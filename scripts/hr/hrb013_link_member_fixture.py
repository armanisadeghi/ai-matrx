#!/usr/bin/env python3
"""HRB-013 — a PURPOSE-MADE org member with a login who is NOT yet an HR employee.

WHY THIS EXISTS. Proving "link an existing member-with-login at create completes access"
needs exactly that shape, and it does not occur naturally in the fixtures: every current
member of the G2 org is already an employee. Binding a REAL colleague's account into an
employer to make the shape would hand a real person an employment they never asked for, so
this creates an account that exists only for this proof, at a reserved non-deliverable
address, and makes it an org member through the canonical membership door.

🚨 THE PASSWORD IS NEVER STORED, LOGGED OR PRINTED. Generated per run, used for nothing here
(no sign-in is needed — the account only has to EXIST and be a member), and discarded when the
process exits. Only the user id is printed.

IDEMPOTENT. Reuses an existing account and membership; a second run changes nothing. Safe to
re-run after a database refresh.

  python3 scripts/hr/hrb013_link_member_fixture.py            # ensure + report state
"""

import asyncio
import os
import pathlib
import re
import sys

ENV = pathlib.Path("/Users/armanisadeghi/code/aidream/.env")

ORG = "2643e470-b275-47f3-95f3-ae275ad3ca47"  # Write Target Sandbox (G2)
# Optional argv[1] picks the address, so several purpose-made members can be staged.
EMAIL = (sys.argv[1] if len(sys.argv) > 1 else "zzz.link.member@example.invalid")
# admin@admin.com — owner/admin of the G2 org, so mbr_add's has_org_access gate passes.
ADMIN_USER = "87a6e699-3622-4869-8843-d0867456c0dd"


def throwaway_password() -> str:
    return "Zz9!" + os.urandom(12).hex() + "Aa1@"


def env() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in ENV.read_text().splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            out[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return out


async def main() -> None:
    e = env()
    import asyncpg
    import httpx

    base = e["SUPABASE_MATRIX_URL"].rstrip("/")
    service = e["SUPABASE_MATRIX_SECRET_KEY"]
    dsn = (
        f"postgresql://{e['SUPABASE_MATRIX_USER']}:{e['SUPABASE_MATRIX_PASSWORD']}"
        f"@{e['SUPABASE_MATRIX_HOST']}:{e['SUPABASE_MATRIX_PORT']}/{e['SUPABASE_MATRIX_DATABASE_NAME']}"
    )
    conn = await asyncpg.connect(dsn, statement_cache_size=0)
    http = httpx.AsyncClient(timeout=60)
    admin_hdr = {"apikey": service, "Authorization": f"Bearer {service}"}

    try:
        # 1. the purpose-made auth user (idempotent)
        r = await http.get(
            f"{base}/auth/v1/admin/users", headers=admin_hdr, params={"page": 1, "per_page": 200}
        )
        r.raise_for_status()
        user_id = next(
            (u["id"] for u in r.json().get("users", []) if (u.get("email") or "").lower() == EMAIL),
            None,
        )
        if user_id:
            print(f"auth user   REUSED   {user_id}  {EMAIL}")
        else:
            r = await http.post(
                f"{base}/auth/v1/admin/users",
                headers=admin_hdr,
                json={"email": EMAIL, "email_confirm": True, "password": throwaway_password()},
            )
            if r.status_code >= 400:
                print(f"auth user   FAILED {r.status_code}: {r.text[:300]}")
                raise SystemExit(1)
            user_id = r.json()["id"]
            print(f"auth user   CREATED  {user_id}  {EMAIL}")

        # 2. make them an org member through the canonical door, acting as the HR admin.
        #    set_config in the SAME transaction as the call (asyncpg auto-commits each stmt).
        async with conn.transaction():
            await conn.execute(
                "select set_config('request.jwt.claims', $1, true)",
                f'{{"sub":"{ADMIN_USER}","role":"authenticated"}}',
            )
            await conn.execute(
                "select public.mbr_add('organization', $1::uuid, $2::uuid, $1::uuid,"
                " 'member', 'active', jsonb_build_object('source','hrb013_link_member_fixture'))",
                ORG,
                user_id,
            )

        # 3. report the shape this proof needs: member yes, employee no.
        is_member = await conn.fetchval(
            "select exists(select 1 from iam.memberships m where m.user_id=$1::uuid"
            " and m.organization_id=$2::uuid and m.container_type='organization'"
            " and m.deleted_at is null and coalesce(m.status,'active')='active')",
            user_id,
            ORG,
        )
        is_employee = await conn.fetchval(
            "select exists(select 1 from hr.employee e where e.login_user_id=$1::uuid"
            " and e.organization_id=$2::uuid and e.deleted_at is null)",
            user_id,
            ORG,
        )
        print(f"membership  {'MEMBER' if is_member else 'NOT A MEMBER'}")
        print(f"employee    {'ALREADY AN EMPLOYEE' if is_employee else 'not yet an employee'}")
        print(f"LINK_USER_ID={user_id}")
    finally:
        await http.aclose()
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
