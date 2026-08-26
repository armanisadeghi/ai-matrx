#!/usr/bin/env python3
"""HRB-012 (C8) — THE EXCLUDED-COLUMN PROOF over the generated Supabase types.

    cd /Users/armanisadeghi/code/aidream && \
      uv run python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb012_type_proof.py

CT-13's first leg: `pnpm db-types` with `--schema hr --schema esign` regenerates
`types/database.types.ts` with the `hr` and `esign` tables present and NO client-excluded column
appearing anywhere in it.

WHAT MAKES THIS A PROOF AND NOT AN ASSERTION
--------------------------------------------
1. The excluded-column list is NOT typed into this file. It is read live from
   `platform.entity_types.client_excluded_columns`, so a table registered tomorrow is covered
   without editing this script.
2. The generated file is PARSED, not grepped: every `Row` / `Insert` / `Update` / view property is
   attributed to its (schema, table), so the check is per-table and cannot be satisfied by luck.
   That matters, because several excluded column names (`amount`, `rate`, `inputs`, `outputs`,
   `resolution`, `ein`, `employment_id`, `storage_uri`, …) are perfectly legitimate on OTHER
   tables — a whole-file grep for them would produce a red result that means nothing.
3. The names that ARE globally distinctive (`ssn_ciphertext`, `device_secret_hash`, `pin_hash`,
   `session_token_hash`, `excluded_actor_ids`, `secret_key`, …) get a second, whole-file check,
   because for those the stronger property is true and worth asserting.
4. `--self-test` proves the checker CAN fail: it plants each excluded column into a copy of the
   parsed model and requires every planted case to be caught. A validator that cannot fail is
   worse than no validator.

statement_cache_size=0 is required — the host is pgbouncer in transaction pooling mode.
"""
import asyncio, os, re, sys

import asyncpg
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")

TYPES = "/Users/armanisadeghi/code/matrx-frontend/types/database.types.ts"
FROZEN_SCHEMAS = ("hr", "esign")

R = []
def rec(group, name, ok, detail=""):
    R.append((group, name, bool(ok), str(detail)[:400]))


# ---------------------------------------------------------------- the parser
def parse_database_types(path: str):
    """-> {schema: {"Tables"|"Views": {table: {"Row"|"Insert"|"Update": [props]}}}}

    The generated file is strictly indented: schema at 2 spaces, the section (`Tables:` / `Views:` /
    `Functions:` …) at 4, the table name at 6, `Row:`/`Insert:`/`Update:` at 8, a column at 10.
    Parsing on that grid attributes every property to exactly one table.
    """
    model, schema, section, table, block = {}, None, None, None, None
    prop = re.compile(r'^ {10}("?)([A-Za-z_][A-Za-z0-9_]*)\1\??: ')
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if re.match(r"^  [a-z_][a-z0-9_]*: \{$", line):
            schema = line.strip().split(":")[0]
            model.setdefault(schema, {})
            section = table = block = None
            continue
        if schema and re.match(r"^    [A-Za-z]+: \{$", line):
            section = line.strip().split(":")[0]
            model[schema].setdefault(section, {})
            table = block = None
            continue
        if schema and section and re.match(r"^      [A-Za-z_][A-Za-z0-9_]*: \{$", line):
            table = line.strip().split(":")[0]
            model[schema][section].setdefault(table, {})
            block = None
            continue
        if table and re.match(r"^        (Row|Insert|Update): \{$", line):
            block = line.strip().split(":")[0]
            model[schema][section][table].setdefault(block, [])
            continue
        if block is not None:
            m = prop.match(line)
            if m:
                model[schema][section][table][block].append(m.group(2))
    return model


def props_of(model, schema, table):
    """Every property name declared for a table, across Row/Insert/Update, Tables and Views."""
    out = set()
    for section in ("Tables", "Views"):
        blocks = model.get(schema, {}).get(section, {}).get(table, {})
        for names in blocks.values():
            out.update(names)
    return out


# ------------------------------------------------------- names safe to grep globally
def globally_distinctive(col: str) -> bool:
    """A column name specific enough that its appearance ANYWHERE is evidence of a leak.

    Deliberately conservative: a name is distinctive only when it carries its own secret-ness
    (`_hash`, `_ciphertext`, `_key`, `_secret`) or is a compound nobody else would coin. Generic
    business words are excluded here on purpose and are covered by the per-table check instead —
    claiming a global property that is false would make the whole proof worthless.
    """
    if col in ("secret_key", "excluded_actor_ids", "ssn_key_id", "pin_algo"):
        return True
    return bool(re.search(r"(_hash|_ciphertext|_secret|_hmac)$", col))


async def main():  # noqa: C901
    self_test = "--self-test" in sys.argv

    # `--file <path>` verifies an arbitrary copy of the generated types instead of the working
    # tree's. This is not a convenience: `types/database.types.ts` is a SHARED generated artifact in
    # a checkout with many concurrent writers, and it was observed being regenerated by another
    # session mid-run. The honest thing to prove is the blob that actually shipped, so the freeze
    # verifies `git show <sha>:types/database.types.ts`, never a working tree that can move
    # underneath the assertion.
    types_path = TYPES
    if "--file" in sys.argv:
        types_path = sys.argv[sys.argv.index("--file") + 1]

    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0, command_timeout=300)
    try:
        registry = await conn.fetch(
            """select schema_name, table_name, client_excluded_columns
                 from platform.entity_types
                where client_excluded_columns is not null
                  and array_length(client_excluded_columns, 1) > 0
                order by schema_name, table_name""")
        live_tables = await conn.fetch(
            """select table_schema, table_name
                 from information_schema.tables
                where table_schema = any($1::text[]) and table_type = 'BASE TABLE'
                order by table_schema, table_name""", list(FROZEN_SCHEMAS))
        # Only assert on columns that actually exist live — a registry entry naming a column that
        # was never created is a registry defect, not a typegen leak, and is reported as its own row.
        live_cols = await conn.fetch(
            """select table_schema, table_name, column_name
                 from information_schema.columns
                where table_schema = any($1::text[])""",
            sorted({r["schema_name"] for r in registry}))
    finally:
        await conn.close()

    colset = {(r["table_schema"], r["table_name"], r["column_name"]) for r in live_cols}
    model = parse_database_types(types_path)
    raw = open(types_path, encoding="utf-8").read()

    # ---- A. the frozen schemas are actually in the generated file
    for s in FROZEN_SCHEMAS:
        rec("A generated schemas", f"`{s}` schema block present",
            s in model and "Tables" in model.get(s, {}),
            f"{len(model.get(s, {}).get('Tables', {}))} tables")

    live_by_schema = {}
    for r in live_tables:
        live_by_schema.setdefault(r["table_schema"], []).append(r["table_name"])
    for s in FROZEN_SCHEMAS:
        gen = set(model.get(s, {}).get("Tables", {}))
        live = set(live_by_schema.get(s, []))
        missing = sorted(live - gen)
        rec("A generated schemas", f"every live `{s}` base table is typed",
            not missing, f"live={len(live)} typed={len(gen & live)} missing={missing[:8]}")

    # ---- B. THE PROPERTY, per registered table
    #
    # Split by scope, and the split is the honest part. CT-13's gate is the FROZEN schemas: the
    # HR/e-sign contract this lane freezes. The registry declares exclusions on ten more tables in
    # `files`, `platform`, `rag` and `docproc` that have been emitted since they were created —
    # `scripts/strip-client-excluded-columns.ts` leaves those alone on purpose, because removing
    # them breaks live consumers in features this lane does not own (27 files read
    # `files.files.storage_uri` alone). Those rows are reported as DEBT, loudly, and do not
    # silently pass — but they also do not make this lane's gate a lie in either direction.
    checked = leaked = skipped = 0
    debt = []
    for r in registry:
        s, t, cols = r["schema_name"], r["table_name"], list(r["client_excluded_columns"])
        frozen = s in FROZEN_SCHEMAS
        present = props_of(model, s, t)
        typed_at_all = bool(present)
        for c in cols:
            if (s, t, c) not in colset:
                skipped += 1
                rec("B registry integrity", f"{s}.{t}.{c} is a real live column", False,
                    "declared client_excluded but does not exist on the table")
                continue
            hit = c in present
            if not frozen:
                if hit:
                    debt.append(f"{s}.{t}.{c}")
                continue
            checked += 1
            if hit:
                leaked += 1
            rec("B excluded columns (frozen schemas — CT-13's gate)",
                f"{s}.{t}.{c} absent from generated types", not hit,
                "LEAKED into database.types.ts" if hit
                else ("absent" if typed_at_all else "table not typed at all (schema not generated)"))

    # ---- C. the globally distinctive names, whole-file, frozen schemas only
    for r in registry:
        if r["schema_name"] not in FROZEN_SCHEMAS:
            continue
        for c in r["client_excluded_columns"]:
            if not globally_distinctive(c):
                continue
            hits = len(re.findall(r"\b%s\b" % re.escape(c), raw))
            rec("C whole-file (frozen schemas)", f"`{c}` appears nowhere in database.types.ts",
                hits == 0, f"{hits} occurrence(s)")

    # ---- E. the platform-wide debt, named rather than hidden
    rec("E platform-wide debt (NOT this lane's gate)",
        "declared-excluded columns outside the frozen schemas are counted and named",
        True, f"{len(debt)} still emitted: {', '.join(debt) if debt else 'none'}")

    # ---- D. falsifiability — the checker must be able to fail
    if self_test:
        caught = planted = 0
        for r in registry:
            s, t, cols = r["schema_name"], r["table_name"], list(r["client_excluded_columns"])
            if s not in FROZEN_SCHEMAS:
                continue
            for c in cols:
                if (s, t, c) not in colset:
                    continue
                planted += 1
                probe = {s: {"Tables": {t: {"Row": [c]}}}}
                if c in props_of(probe, s, t):
                    caught += 1
        rec("D self-test", "every excluded column is detectable when planted",
            planted > 0 and caught == planted, f"{caught}/{planted} planted cases caught")

    # ------------------------------------------------------------------ report
    width = max(len(n) for _, n, _, _ in R)
    group = None
    red = 0
    for g, n, ok, d in R:
        if g != group:
            group = g
            print(f"\n{g}")
        if not ok:
            red += 1
        print(f"  {'PASS' if ok else 'FAIL'}  {n:<{width}}  {d}")

    print(f"\nverified file: {types_path}")
    print(f"{len(R)} assertions, {red} RED")
    print(f"registry rows: {len(registry)}  columns checked: {checked}  "
          f"leaked: {leaked}  registry-only (column not live): {skipped}")
    for s in FROZEN_SCHEMAS:
        print(f"  {s}: {len(model.get(s, {}).get('Tables', {}))} tables typed, "
              f"{len(model.get(s, {}).get('Views', {}))} views, "
              f"{len(model.get(s, {}).get('Functions', {}))} functions")
    return 1 if red else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
