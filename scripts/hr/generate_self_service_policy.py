#!/usr/bin/env python3
"""Generate `features/hr/me/selfServicePolicy.generated.ts` from the database.

🚨 WHY THIS IS GENERATED, AND WHY THAT IS THE FIX RATHER THAN ANOTHER CORRECTION.

`HR_SELF_SERVICE_DEFAULTS` was hand-maintained, and it disagreed with the doors FOUR
times: legal names said `hr_only` where the door accepted a request, `work_phone` said
`hr_only` where the door applied it freely, `work_permit_type` was not the column's name
at all (`work_authorization_kind` is), and `worker_class` claimed HR holds a field that is
not on the employee record — it lives on the position assignment.

Every one of those was the SAME defect: a second, hand-kept copy of a rule the database
already states. A hint stricter than the boundary is not "safe" — it renders a padlock over
a capability nobody can reach, and it fails silently, because the server is never asked.

So the map is now DERIVED from the two sources the door itself reads:
  · EXISTENCE — `information_schema.columns` for the table behind each self-service token,
    which is what makes `worker_class` absent rather than protected.
  · POLICY — `hr.field_policy`, nearest row wins (org override before the platform row),
    and a column with no row at all is `hr_only` by the same fail-closed rule the door
    applies.

Re-run after any change to `hr.field_policy` or to the shape of those three tables:

    python3 scripts/hr/generate_self_service_policy.py

It prints a diff summary and exits non-zero when the file changed, so a check run in CI
fails loudly rather than drifting quietly.
"""

import asyncio
import pathlib
import re
import sys

ENV = pathlib.Path("/Users/armanisadeghi/code/aidream/.env")
OUT = pathlib.Path(
    "/Users/armanisadeghi/code/matrx-frontend/features/hr/me/selfServicePolicy.generated.ts"
)

# The three tokens `hr_self_update` accepts, and the tables behind them. Kept here rather
# than inferred so a new self-service target is a deliberate edit, not a silent widening.
TOKENS = {
    "hr_employee": "hr.employee",
    "hr_employee_private": "hr.employee_private",
    "hr_emergency_contact": "hr.emergency_contact",
}

# The door's vocabulary → the client's three-state rendering vocabulary.
CLIENT = {
    "free": "free",
    "self_free": "free",
    "request_approval": "request_approval",
    "self_request_approval": "request_approval",
    "hr_only": "hr_only",
    "read_only": "read_only",
}


def env() -> dict:
    out = {}
    for line in ENV.read_text().splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            out[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return out


async def main() -> None:
    e = env()
    import asyncpg

    dsn = (
        f"postgresql://{e['SUPABASE_MATRIX_USER']}:{e['SUPABASE_MATRIX_PASSWORD']}"
        f"@{e['SUPABASE_MATRIX_HOST']}:{e['SUPABASE_MATRIX_PORT']}/{e['SUPABASE_MATRIX_DATABASE_NAME']}"
    )
    conn = await asyncpg.connect(dsn, statement_cache_size=0)
    try:
        blocks = []
        for token, tbl in TOKENS.items():
            schema, table = tbl.split(".", 1)
            rows = await conn.fetch(
                """
                select c.column_name,
                       coalesce(fp.policy, 'hr_only') as policy
                  from information_schema.columns c
                  left join lateral (
                    select fp.policy from hr.field_policy fp
                     where fp.target_token = $3::text
                       and fp.column_name = c.column_name
                       and fp.is_active and fp.deleted_at is null
                     order by (fp.organization_id is not null) desc
                     limit 1) fp on true
                 where c.table_schema = $1::text and c.table_name = $2::text
                 order by c.column_name
                """,
                schema, table, token,
            )
            entries = []
            for r in rows:
                policy = CLIENT.get(r["policy"])
                if policy is None:
                    print(f"UNKNOWN POLICY {r['policy']!r} on {token}.{r['column_name']}")
                    raise SystemExit(1)
                entries.append(f'    {r["column_name"]}: "{policy}",')
            blocks.append(
                f"  // {tbl} — {len(entries)} columns\n"
                f"  {token}: {{\n" + "\n".join(entries) + "\n  },"
            )

        body = "\n".join(blocks)
        text = f'''// GENERATED FILE — DO NOT EDIT BY HAND.
//   source: scripts/hr/generate_self_service_policy.py
//   from:   information_schema.columns (existence) + hr.field_policy (policy)
//
// 🚨 THIS FILE EXISTS SO THE CLIENT HINT CANNOT DISAGREE WITH THE DOOR.
// The hand-kept table it replaces was wrong four separate times — legal names, work_phone,
// work_permit_type (never a real column), and worker_class (which is not on the employee
// record at all; it lives on the position assignment). Each was a second copy of a rule the
// database already states, and each failed SILENTLY, because a hint stricter than the
// boundary renders a padlock over a capability nobody can reach and the server is never
// asked.
//
// KEYED BY TOKEN, deliberately. A flat column-name map is what made `worker_class` look
// like a field of the employee record; the same name means different things on different
// tables, and only the pair (token, column) has an answer.
//
// A column ABSENT from a token's block does not exist on that table, which is exactly what
// the door means by "… is not a field on your record". A column PRESENT with `hr_only` may
// exist and be held by HR — the two are different answers and the UI renders them
// differently, so they must not be collapsed.

import type {{ HrSelfServicePolicy }} from "./selfServicePolicy";

export const HR_SELF_SERVICE_POLICY: Record<
  string,
  Record<string, HrSelfServicePolicy>
> = {{
{body}
}};
'''
        before = OUT.read_text() if OUT.exists() else ""
        OUT.write_text(text)
        if before == text:
            print(f"unchanged  {OUT.name}")
        else:
            print(f"REGENERATED {OUT.name}  ({len(text.splitlines())} lines)")
            if before:
                print("the file was out of date with the database — commit the change")
            sys.exit(1 if "--check" in sys.argv else 0)
    finally:
        await conn.close()


asyncio.run(main())
