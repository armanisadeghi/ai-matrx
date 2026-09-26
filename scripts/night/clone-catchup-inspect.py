#!/usr/bin/env python3
"""clone-catchup-inspect.py — is the clone ALREADY LEVEL with production on everything a file writes?

🚨 CHAIR RULING 2026-09-26 (lane CLONE-LEDGER-VERDICTS), rule 1. A file the catch-up judges
ALREADY LEVEL or SUPERSEDED is correctly not executed, and the ledger's own guard forbids a row that
says it ran ("do NOT ledger a migration you did not actually run"), so until today those files were
re-judged every night and the ledger delta could never empty. The ruling: the tool compares, and
when every object the file writes is byte-identical on the clone and on production it writes an
honest `parity` row on the CLONE naming what it compared, by hash. Never a row claiming the file ran.

"Checked, not assumed" is this script. It reads a migration file, names every schema object the file
writes (a function by name — every overload —, a view, a table with its columns, constraints,
indexes, triggers, policies and grants, a type, a publication's membership) and prints ONE
catalogue query that hashes each of them the same way `body-drift.sh` does. The shell runs that
query on both databases (production inside a proven read-only transaction) and hands both answers
back here to compare. An object absent on BOTH sides is level (a DROP production also carries, or
an object production itself has since removed); absent on one side only is not.

    clone-catchup-inspect.py objects <file.sql>            kind<TAB>key, one per object
    clone-catchup-inspect.py sql <file.sql>                the catalogue query (one statement)
    clone-catchup-inspect.py compare <clone.tsv> <prod.tsv>
          LEVEL<TAB><n objects><TAB><digest><TAB><note>   exit 0
          DIFFERS<TAB><kind key: clone … production …>   exit 1 (one line per object)
          NOTHING<TAB><why>                               exit 2 (the file writes no inspectable object)
    clone-catchup-inspect.py --self-test                   no database: extraction + compare, RED first
"""

from __future__ import annotations

import hashlib
import re
import sys

IDENT = r'(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)'
QNAME = rf"({IDENT}(?:\s*\.\s*{IDENT})?)"


def strip_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    return re.sub(r"--[^\n]*", " ", sql)


def norm(q: str) -> str:
    parts = [p.strip() for p in re.split(r"\s*\.\s*", q.strip())]
    parts = [p[1:-1] if p.startswith('"') and p.endswith('"') else p.lower() for p in parts]
    if len(parts) == 1:
        parts = ["public"] + parts
    return ".".join(parts)


PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("function", re.compile(rf"\b(?:create(?:\s+or\s+replace)?|drop|alter)\s+(?:function|procedure)\s+(?:if\s+exists\s+)?{QNAME}", re.I)),
    ("function", re.compile(rf"\b(?:grant|revoke)\b[^;]*?\bon\s+(?:function|procedure)\s+{QNAME}", re.I)),
    ("view", re.compile(rf"\b(?:create(?:\s+or\s+replace)?|drop|alter)\s+(?:materialized\s+)?view\s+(?:if\s+(?:not\s+)?exists\s+)?{QNAME}", re.I)),
    ("table", re.compile(rf"\b(?:create|alter|drop)\s+(?:unlogged\s+)?table\s+(?:if\s+(?:not\s+)?exists\s+)?(?:only\s+)?{QNAME}", re.I)),
    ("table", re.compile(rf"\bcreate\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(?:{IDENT}\s+)?on\s+(?:only\s+)?{QNAME}", re.I)),
    ("table", re.compile(rf"\b(?:create(?:\s+or\s+replace)?\s+(?:constraint\s+)?|drop\s+|alter\s+)trigger\s+(?:if\s+exists\s+)?{IDENT}\b[^;]*?\bon\s+(?:only\s+)?{QNAME}", re.I)),
    ("table", re.compile(rf"\b(?:create|drop|alter)\s+policy\s+(?:if\s+exists\s+)?{IDENT}\s+on\s+{QNAME}", re.I)),
    ("table", re.compile(rf"\b(?:grant|revoke)\b[^;]*?\bon\s+table\s+{QNAME}", re.I)),
    ("table", re.compile(rf"\bcomment\s+on\s+column\s+{QNAME}\s*\.\s*{IDENT}", re.I)),
    ("type", re.compile(rf"\b(?:create|alter|drop)\s+(?:type|domain)\s+(?:if\s+exists\s+)?{QNAME}", re.I)),
    ("publication", re.compile(rf"\b(?:create|alter|drop)\s+publication\s+(?:if\s+exists\s+)?({IDENT})", re.I)),
]

#: SQL words a lazy regex can capture as a "name" when the statement is built at run time.
NOT_A_NAME = {"public.if", "public.only", "public.on", "public.as", "public.format", "public.concurrently"}


BASED_ON = re.compile(rf"^--\s*based-on:\s*(?:(trigger)\s+{IDENT}\s+on\s+{QNAME}|(view)\s+{QNAME}|{QNAME}\s*\()", re.I | re.M)
#: Bodies a file writes through a generator, not a written-out statement: `iam.apply_rls(schema, table, …)`
#: re-emits a table's policies; `execute pg_get_functiondef('x(…)'::regprocedure)`-style rewrites name their target.
GENERATED = [
    ("table", re.compile(r"\biam\s*\.\s*apply_rls\s*\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*'([a-z_][a-z0-9_]*)'", re.I)),
    ("function", re.compile(rf"pg_get_functiondef\s*\(\s*'{QNAME}\s*\(", re.I)),
]


def objects_of(sql: str) -> list[tuple[str, str]]:
    out: set[tuple[str, str]] = set()
    # The file's own `-- based-on:` declarations name what it replaces (read BEFORE comments go).
    for m in BASED_ON.finditer(sql):
        if m.group(1):
            out.add(("table", norm(m.group(2))))
        elif m.group(3):
            out.add(("view", norm(m.group(4))))
        elif m.group(5):
            out.add(("function", norm(m.group(5))))
    text = strip_comments(sql)
    for kind, pat in GENERATED:
        for m in pat.finditer(text):
            key = norm(f"{m.group(1)}.{m.group(2)}") if kind == "table" else norm(m.group(1))
            out.add((kind, key))
    for kind, pat in PATTERNS:
        for m in pat.finditer(text):
            name = m.group(1)
            key = norm(name) if kind != "publication" else norm(name).split(".", 1)[1]
            if key in NOT_A_NAME or "%" in key:
                continue
            out.add((kind, key))
    return sorted(out)


def lit(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def hash_sql(kind: str, key: str) -> str:
    """One row: kind, key, sha256 of the object's catalogue text (or 'absent')."""
    if kind == "publication":
        body = f"""(select case when p.oid is null then null else
             p.pubinsert::text || p.pubupdate::text || p.pubdelete::text || p.pubtruncate::text || '|' ||
             coalesce((select string_agg(t.schemaname || '.' || t.tablename, ',' order by 1)
                         from pg_publication_tables t where t.pubname = p.pubname), '') end
             from (select null::oid as oid) z left join pg_publication p on p.pubname = {lit(key)} limit 1)"""
        return f"select {lit(kind)}, {lit(key)}, coalesce(encode(sha256(convert_to({body}, 'utf8')), 'hex'), 'absent')"
    schema, name = key.split(".", 1)
    s, n = lit(schema), lit(name)
    if kind == "function":
        body = f"""(select string_agg(p.oid::regprocedure::text || ' owner ' || pg_get_userbyid(p.proowner) || ' acl ' ||
                   coalesce(p.proacl::text, '-') || E'\\n' || pg_get_functiondef(p.oid), E'\\n' order by p.oid::regprocedure::text)
              from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
             where ns.nspname = {s} and p.proname = {n} and p.prokind in ('f','p'))"""
    elif kind == "view":
        body = f"""(select 'owner ' || pg_get_userbyid(c.relowner) || '|acl ' || coalesce(c.relacl::text, '-') || '|' ||
                   coalesce(array_to_string(c.reloptions, ','), '') || '|' ||
                   (select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum)
                      from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) || '|' ||
                   regexp_replace(pg_get_viewdef(c.oid), ' AS "?[A-Za-z_][A-Za-z0-9_]*"?(,?)$', '\\1', 'gn')
              from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
             where ns.nspname = {s} and c.relname = {n} and c.relkind in ('v','m'))"""
    elif kind == "table":
        body = f"""(select 'owner ' || pg_get_userbyid(c.relowner) || '|rls ' || c.relrowsecurity || '|force ' || c.relforcerowsecurity ||
                   '|acl ' || coalesce(c.relacl::text, '-') ||
                   '|cols ' || coalesce((select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || ' nn ' || a.attnotnull ||
                        ' def ' || coalesce(pg_get_expr(ad.adbin, ad.adrelid), '') || ' id ' || a.attidentity::text || ' gen ' || a.attgenerated::text ||
                        ' comment ' || coalesce(col_description(c.oid, a.attnum), ''), ',' order by a.attname)
                      from pg_attribute a left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
                     where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), '') ||
                   '|cons ' || coalesce((select string_agg(k.conname || ' ' || pg_get_constraintdef(k.oid), ',' order by k.conname)
                      from pg_constraint k where k.conrelid = c.oid and k.conparentid = 0), '') ||
                   '|idx ' || coalesce((select string_agg(i.relname || ' ' || pg_get_indexdef(x.indexrelid) || ' valid ' || x.indisvalid, ',' order by i.relname)
                      from pg_index x join pg_class i on i.oid = x.indexrelid where x.indrelid = c.oid
                       and not exists (select 1 from pg_constraint k where k.conindid = x.indexrelid and k.contype in ('p','u','x'))), '') ||
                   '|trg ' || coalesce((select string_agg(t.tgname || ' ' || pg_get_triggerdef(t.oid) || ' ' || t.tgenabled::text, ',' order by t.tgname)
                      from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal and t.tgparentid = 0), '') ||
                   '|pol ' || coalesce((select string_agg(pol.polname || ' ' || pol.polpermissive::text || pol.polcmd::text || ' ' ||
                        (select string_agg(case r when 0 then 'public' else pg_get_userbyid(r) end, ',' order by 1) from unnest(pol.polroles) r) || ' ' ||
                        coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''), ',' order by pol.polname)
                      from pg_policy pol where pol.polrelid = c.oid), '')
              from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
             where ns.nspname = {s} and c.relname = {n} and c.relkind in ('r','p','f'))"""
    elif kind == "type":
        body = f"""(select t.typtype::text || '|' || coalesce(format_type(t.typbasetype, t.typtypmod), '') || '|' ||
                   coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid), '') || '|' ||
                   coalesce((select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum)
                               from pg_attribute a where a.attrelid = t.typrelid and a.attnum > 0 and not a.attisdropped), '') || '|' ||
                   coalesce((select string_agg(pg_get_constraintdef(k.oid), ',' order by k.conname) from pg_constraint k where k.contypid = t.oid), '')
              from pg_type t join pg_namespace ns on ns.oid = t.typnamespace
             where ns.nspname = {s} and t.typname = {n})"""
    else:
        raise ValueError(kind)
    return f"select {lit(kind)}, {lit(key)}, coalesce(encode(sha256(convert_to({body}, 'utf8')), 'hex'), 'absent')"


def catalogue_sql(objs: list[tuple[str, str]]) -> str:
    return "set local search_path = pg_catalog;\n" + "\nunion all\n".join(hash_sql(k, key) for k, key in objs) + ";"


def load(path: str) -> dict[tuple[str, str], str]:
    rows: dict[tuple[str, str], str] = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if len(parts) == 3:
                rows[(parts[0], parts[1])] = parts[2]
    return rows


def compare(clone: dict, prod: dict) -> tuple[int, list[str]]:
    """(exit code, lines). 0 LEVEL · 1 DIFFERS · 2 NOTHING (no object to compare)."""
    keys = sorted(set(clone) | set(prod))
    if not keys:
        return 2, ["NOTHING\tthe file writes no schema object this inspection can hash (data-only, or built at run time)"]
    bad = []
    for k in keys:
        c, p = clone.get(k), prod.get(k)
        if c is None or p is None:
            bad.append(f"DIFFERS\t{k[0]} {k[1]}: not measured on {'the clone' if c is None else 'production'}")
        elif c != p:
            bad.append(f"DIFFERS\t{k[0]} {k[1]}: clone {c[:12]}, production {p[:12]}")
    if bad:
        return 1, bad
    lines = [f"{k[0]} {k[1]} {prod[k]}" for k in keys]
    digest = hashlib.sha256("\n".join(lines).encode()).hexdigest()[:16]
    shown = "; ".join(f"{k[0]} {k[1]} {prod[k][:12]}" for k in keys[:12])
    more = f"; +{len(keys) - 12} more" if len(keys) > 12 else ""
    present = sum(1 for k in keys if prod[k] != "absent")
    note = (f"{len(keys)} object(s) compared on clone and production, identical ({present} present, "
            f"{len(keys) - present} absent on both); digest {digest}: {shown}{more}")
    return 0, [f"LEVEL\t{len(keys)}\t{digest}\t{note}"]


FIXTURE = """-- create table public.commented_out (x int);
/* create function public.also_commented() */
drop function if exists public.agx_duplicate_agent(uuid, boolean);
create or replace function public.agx_duplicate_agent(p uuid) returns void language sql as $$ select 1 $$;
create or replace view platform.v_things as select 1;
create index if not exists things_idx on custom.things (id);
create policy "Things read" on custom.things for select using (true);
drop trigger if exists zz_t on "Custom"."Things";
alter publication supabase_realtime add table platform.comments;
revoke all on function iam.has_access_for_base(uuid) from public;
execute format('create table %I.%I ()', s, t);
"""


def self_test() -> int:
    fails = 0

    def check(label: str, ok: bool, detail: str = "") -> None:
        nonlocal fails
        print(("  ok   " if ok else "  FAIL ") + label)
        if not ok:
            fails += 1
            if detail:
                print("        " + detail)

    got = objects_of(FIXTURE)
    want = [
        ("function", "iam.has_access_for_base"),
        ("function", "public.agx_duplicate_agent"),
        ("publication", "supabase_realtime"),
        ("table", "Custom.Things"),
        ("table", "custom.things"),
        ("view", "platform.v_things"),
    ]
    check("extraction names every object the file writes, and nothing a comment or a format() names", got == want, f"got {got}")
    gen = objects_of("-- based-on: public.access_denied_context(text, uuid) " + "ab" * 32 + "\n"
                     "select iam.apply_rls('runtime', 'work_item', 'work_item', 'component');\n"
                     "v := pg_get_functiondef('custom.f(uuid)'::regprocedure);\n")
    check("a based-on declaration, iam.apply_rls and a pg_get_functiondef rewrite name what they write",
          gen == [("function", "custom.f"), ("function", "public.access_denied_context"), ("table", "runtime.work_item")], f"got {gen}")
    sql = catalogue_sql(got)
    check("the catalogue query is one statement with one arm per object", sql.count("union all") == len(got) - 1 and sql.rstrip().endswith(";"))

    a = {("function", "public.f"): "aa" * 32, ("table", "custom.t"): "bb" * 32, ("view", "platform.v"): "absent"}
    rc, _ = compare(dict(a), {**a, ("table", "custom.t"): "cc" * 32})
    check("RED-1 one body differs -> not level", rc == 1)
    b = dict(a); b.pop(("function", "public.f"))
    rc, _ = compare(b, dict(a))
    check("RED-2 an object measured on one side only -> not level", rc == 1)
    rc, _ = compare({("table", "custom.t"): "absent"}, {("table", "custom.t"): "bb" * 32})
    check("RED-3 absent on the clone, present on production -> not level", rc == 1)
    rc, _ = compare({}, {})
    check("RED-4 a file that writes nothing inspectable is NOT level (never a vacuous green)", rc == 2)
    rc, lines = compare(dict(a), dict(a))
    check("GREEN every object identical (absent on both counts) -> LEVEL, note names the hashes",
          rc == 0 and lines[0].startswith("LEVEL\t3\t") and "custom.t bbbbbbbbbbbb" in lines[0])
    print("clone-catchup-inspect self-test: " + ("PASS" if not fails else f"{fails} FAILED"))
    return 0 if not fails else 1


def main() -> int:
    a = sys.argv[1:]
    if a == ["--self-test"]:
        return self_test()
    if len(a) == 2 and a[0] == "objects":
        for k, key in objects_of(open(a[1], encoding="utf-8", errors="replace").read()):
            print(f"{k}\t{key}")
        return 0
    if len(a) == 2 and a[0] == "sql":
        objs = objects_of(open(a[1], encoding="utf-8", errors="replace").read())
        if not objs:
            return 2
        print(catalogue_sql(objs))
        return 0
    if len(a) == 3 and a[0] == "compare":
        rc, lines = compare(load(a[1]), load(a[2]))
        print("\n".join(lines))
        return rc
    print(__doc__, file=sys.stderr)
    return 64


if __name__ == "__main__":
    raise SystemExit(main())
