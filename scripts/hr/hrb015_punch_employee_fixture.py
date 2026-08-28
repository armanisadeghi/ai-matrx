#!/usr/bin/env python3
"""HRB-015 — the ORDINARY EMPLOYEE who can act on their own timecard.

WHY THIS SCRIPT EXISTS
----------------------
Every punch and timecard surface in this lane is built for a person who is NOT an administrator:
they clock in, they attest their own week, and they see nothing about anybody else. The scenario
org (Write Target Sandbox) could not stage that person. Of its active employments, only two carry
BOTH a login and a punch-enabled worker class — Armani Sadeghi and G2V-Priya Raman — and both hold
`hr_admin`. Every OTHER employment with a login is a `contractor`, and a contractor is refused at
the clock by design ("Contractors do not clock in"). So every self-service walk in the lane was
being proved by an administrator, whose reach can hide a missing self-service arm: an admin passes
`hr_no_clock_read_authority` on the capability branch, never on the self branch. That is exactly
the class of defect hr_l3_88 was: the self arm was wrong, and only a non-admin could show it.

This creates that person. Ordinary `employee` class, punch-enabled, no role of any kind.

THROUGH THE DOORS, NOT AROUND THEM
----------------------------------
`public.hr_employee_create` writes the employee, the employment and the primary position assignment
in one call; the invitation's accept writes the org membership AND links the login in one act. Both
halves matter — see `hrb017_contractor_fixture.py`, which documents the two product defects found
trying to link a login at create time. This script takes the same route for the same reasons.

NO CREDENTIAL IS CREATED, TRANSMITTED, OR STORED — NOT EVEN A THROWAWAY ONE
--------------------------------------------------------------------------
The two earlier fixtures in this directory each set a random password through the admin API and
signed in with it. This one does not need to. The auth user is created WITHOUT a password at all,
and the session used for the door walk is minted with `admin/generate_link` (magiclink) exchanged
at `auth/v1/verify` for a real `authenticated` JWT. The account therefore has no password to leak,
rotate, or leave behind, and the walk is still a genuine PostgREST session under the `authenticated`
role rather than an in-database `set_config` impersonation.

IDEMPOTENT. Every step checks before it writes: an existing auth user is reused, an existing
employment is found by legal name, and an accepted invitation is reported rather than re-accepted.
A second run changes nothing.

  /Users/armanisadeghi/code/aidream/.venv/bin/python scripts/hr/hrb015_punch_employee_fixture.py
  ... --session    # ...and print an access token for a browser look
"""

from __future__ import annotations

import asyncio
import json
import pathlib
import re
import sys

ENV = pathlib.Path("/Users/armanisadeghi/code/aidream/.env")

ORG = "2643e470-b275-47f3-95f3-ae275ad3ca47"            # Write Target Sandbox (the G2S scenario org)
HR_ADMIN_USER = "87a6e699-3622-4869-8843-d0867456c0dd"  # admin@admin.com, hr_admin in this org

# 🚨 A RESERVED, NON-DELIVERABLE ADDRESS. `.invalid` is reserved by RFC 2606 and can never be
# registered, so this fixture can never mail a real person and can never collide with a real signup.
EMAIL = "zzz.l3.punch.employee@example.invalid"
LEGAL_FIRST, LEGAL_LAST = "Zzz", "Punchemployee"

JOB_TITLE = "6e2275c6-47a4-4b6a-9ff4-f48e8adeedb0"     # Operations Specialist
LOCATION = "0ebbf294-2c02-4c0f-968f-fe780bf000ac"      # Sandbox HQ (US) — the clock needs a
DEPARTMENT = "6715f29c-c677-4546-9c9a-5e2b591ab16e"    # Operations      jurisdiction to resolve
HIRE_DATE = "2026-08-01"

# The control for the "no admin capabilities" half: someone else in the same org, whose clock this
# person must NOT be able to read. G2S-CAOT Calla Ortega has no login and is nobody's fixture here.
OTHER_EMPLOYMENT = "6b916a40-8006-494b-949e-2baeb263c5ac"


def env() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in ENV.read_text().splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            out[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return out


async def main() -> None:  # noqa: C901
    e = env()
    import asyncpg
    import httpx

    base = e["SUPABASE_MATRIX_URL"].rstrip("/")
    anon = e["SUPABASE_MATRIX_PUBLISHABLE_KEY"]
    service = e["SUPABASE_MATRIX_SECRET_KEY"]
    dsn = (
        f"postgresql://{e['SUPABASE_MATRIX_USER']}:{e['SUPABASE_MATRIX_PASSWORD']}"
        f"@{e['SUPABASE_MATRIX_HOST']}:{e['SUPABASE_MATRIX_PORT']}/{e['SUPABASE_MATRIX_DATABASE_NAME']}"
    )
    conn = await asyncpg.connect(dsn, statement_cache_size=0)
    http = httpx.AsyncClient(timeout=60)
    admin_hdr = {"apikey": service, "Authorization": f"Bearer {service}"}

    try:
        # ---- 1. the purpose-made auth user, with NO password (idempotent) ---------------
        r = await http.get(
            f"{base}/auth/v1/admin/users", headers=admin_hdr, params={"page": 1, "per_page": 200}
        )
        r.raise_for_status()
        user_id = next(
            (u["id"] for u in r.json().get("users", []) if (u.get("email") or "").lower() == EMAIL),
            None,
        )
        if user_id:
            print(f"auth user       REUSED    {user_id}  {EMAIL}")
        else:
            r = await http.post(
                f"{base}/auth/v1/admin/users",
                headers=admin_hdr,
                json={"email": EMAIL, "email_confirm": True},   # no `password` key, on purpose
            )
            if r.status_code >= 400:
                print(f"auth user       FAILED {r.status_code}: {r.text[:400]}")
                raise SystemExit(1)
            user_id = r.json()["id"]
            print(f"auth user       CREATED   {user_id}  {EMAIL}  (passwordless)")

        # ---- 2. the employee, employment and primary assignment, THROUGH THE DOOR -------
        # Found by NAME, not by login: created unlinked, because the invitation is what links a
        # login and writes the membership. See hrb017's header for what happens otherwise.
        emp = await conn.fetchval(
            "select em.id from hr.employment em join hr.employee e on e.id = em.employee_id "
            " where em.organization_id = $1::uuid and em.deleted_at is null "
            "   and e.legal_first_name = $2 and e.legal_last_name = $3 limit 1",
            ORG, LEGAL_FIRST, LEGAL_LAST,
        )
        if emp:
            print(f"employment      EXISTS    {emp}")
        else:
            async with conn.transaction():
                await conn.execute(
                    "select set_config('request.jwt.claims', $1, true)",
                    json.dumps({"sub": HR_ADMIN_USER, "role": "authenticated"}),
                )
                res = await conn.fetchval(
                    "select public.hr_employee_create($1::jsonb)",
                    json.dumps({
                        "organization_id": ORG,
                        "legal_first_name": LEGAL_FIRST,
                        "legal_last_name": LEGAL_LAST,
                        "work_email": EMAIL,
                        # 🚨 THE POINT OF THE FIXTURE: an ORDINARY employee, not a contractor.
                        "worker_class": "employee",
                        "hire_date": HIRE_DATE,
                        "job_title_id": JOB_TITLE,
                        "location_id": LOCATION,
                        "department_id": DEPARTMENT,
                        "fte": 1.0,
                        # Hourly, so the clock is the right instrument for this person.
                        "flsa_status": "nonexempt",
                    }),
                )
            res = json.loads(res) if isinstance(res, str) else res
            if not res.get("ok"):
                print(f"DOOR REFUSED: {json.dumps(res)[:400]}")
                raise SystemExit(1)
            emp = res.get("employment_id") or res.get("employmentId")
            print(f"employment      CREATED   {emp}")

        employee_id = await conn.fetchval(
            "select employee_id from hr.employment where id = $1::uuid", emp)

        # ---- 3. membership + login link, through the invite door (idempotent) ----------
        linked = await conn.fetchval(
            "select login_user_id from hr.employee where id = $1::uuid", employee_id)
        member = await conn.fetchval(
            "select exists (select 1 from iam.organization_member "
            "  where organization_id = $1::uuid and user_id = $2::uuid)", ORG, user_id)
        if linked is not None and member:
            print(f"invite          ACCEPTED  login_user_id={linked}  member=yes")
        else:
            tok = await conn.fetchval(
                "select i.token from iam.invitations i "
                " where i.metadata ->> 'hr_employee_id' = $1::text "
                "   and i.status = 'pending' and i.deleted_at is null "
                "   and (i.expires_at is null or i.expires_at > now()) "
                " order by i.created_at desc limit 1",
                str(employee_id),
            )
            if tok is None:
                # 🚨 ONE TRANSACTION. `set_config(..., is_local => true)` lasts for the
                # TRANSACTION and asyncpg auto-commits each statement, so splitting these two
                # runs the door with no caller at all.
                async with conn.transaction():
                    await conn.execute(
                        "select set_config('request.jwt.claims', $1, true)",
                        json.dumps({"sub": HR_ADMIN_USER, "role": "authenticated"}),
                    )
                    inv = await conn.fetchval(
                        "select public.hr_employee_invite($1::uuid, $2, now() + interval '7 days')",
                        employee_id, EMAIL)
                inv = json.loads(inv) if isinstance(inv, str) else inv
                tok = inv.get("token") or inv.get("invitation_token")
                print(f"invite          ISSUED    {tok}")
            else:
                print(f"invite          PENDING   {tok}")

            # 🚨 `hr_invite_accept`, NOT `inv_accept`. The generic platform door writes the
            # membership and stops; the HR door also sets `hr.employee.login_user_id`, which is
            # what makes the person's own record reachable at all.
            async with conn.transaction():
                await conn.execute(
                    "select set_config('request.jwt.claims', $1, true)",
                    json.dumps({"sub": user_id, "role": "authenticated"}),
                )
                acc = await conn.fetchval("select public.hr_invite_accept($1)", tok)
            acc = json.loads(acc) if isinstance(acc, str) else acc
            if not acc.get("ok", True):
                print(f"accept          FAILED    {json.dumps(acc)[:400]}")
                raise SystemExit(1)
            print(f"invite          ACCEPTED  {json.dumps(acc)[:160]}")

        # ---- 4. a REAL session, with no password anywhere in the process ----------------
        r = await http.post(
            f"{base}/auth/v1/admin/generate_link", headers=admin_hdr,
            json={"type": "magiclink", "email": EMAIL},
        )
        if r.status_code >= 400:
            print(f"link            FAILED {r.status_code}: {r.text[:300]}")
            raise SystemExit(1)
        body = r.json()
        hashed = body.get("hashed_token") or (body.get("properties") or {}).get("hashed_token")
        r = await http.post(
            f"{base}/auth/v1/verify",
            headers={"apikey": anon, "Content-Type": "application/json"},
            json={"type": "magiclink", "token_hash": hashed},
        )
        if r.status_code >= 400:
            print(f"session         FAILED {r.status_code}: {r.text[:300]}")
            raise SystemExit(1)
        token = r.json()["access_token"]
        as_them = {
            "apikey": anon,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Content-Profile": "public",
            "Accept-Profile": "public",
        }
        print("session         MINTED    (magiclink; no password exists on this account)")

        # ---- 5. VERIFY AT THE DOORS, AS THEM -------------------------------------------
        r = await http.post(f"{base}/rest/v1/rpc/hr_my_context", headers=as_them,
                            json={"p_organization_id": ORG})
        ctx = r.json() if r.status_code < 400 else {}
        employers = [x.get("organization_id") for x in (ctx.get("employers") or [])]
        active = ctx.get("active") or {}
        org_listed = ORG in employers
        persona = active.get("persona")
        caps = active.get("capabilities") or []
        print(f"context         org listed={org_listed}  active={'yes' if active else 'NO'}  "
              f"persona={persona}")

        # 🚨 "NO ADMIN CAPABILITIES" IS AN ASSERTION ABOUT THE PAYLOAD, NOT A HOPE.
        # The context door hands the client the exact capability list it will build the shell
        # from, so the fixture is ordinary only if that list carries none of the administrative
        # ones. Priya — the person this fixture exists to replace — carries all of these.
        ADMIN_CAPS = {"comp.read", "comp.write", "ssn.reveal", "identity.write", "audit.read",
                      "break_glass", "payroll.read", "time.recompute", "candidate.read"}
        leaked = sorted(ADMIN_CAPS.intersection(caps))
        print(f"capabilities    {sorted(caps)}")
        print(f"admin caps      {leaked}  (MUST be [])")

        r = await http.post(f"{base}/rest/v1/rpc/hr_clock_state", headers=as_them,
                            json={"p_employment_id": emp})
        clock = r.json() if r.status_code < 400 else {}
        state = clock.get("state")
        offers_in = "clock_in" in (clock.get("allowed_kinds") or [])
        print(f"clock_state     state={state}  allowed_kinds={clock.get('allowed_kinds')}  "
              f"blocked={(clock.get('blocked') or {}).get('reason_code')}")

        # The negative half — and it must REFUSE BY NAMING WHAT WAS MISSING, not merely fail.
        r = await http.post(f"{base}/rest/v1/rpc/hr_clock_state", headers=as_them,
                            json={"p_employment_id": OTHER_EMPLOYMENT})
        other = r.json() if r.status_code < 400 else {}
        refused = (other.get("reason_code") or (other.get("blocked") or {}).get("reason_code")) \
            == "hr_no_clock_read_authority"
        print(f"someone else's  refused={refused}  "
              f"needed={(other.get('details') or other.get('context') or {}).get('needed')}")

        roles = await conn.fetchval(
            "select coalesce(jsonb_agg(ra.role_key order by ra.role_key), '[]'::jsonb) "
            "  from hr.role_assignment ra "
            " where ra.employment_id = $1::uuid and ra.is_active and ra.revoked_at is null", emp)
        roles = json.loads(roles) if isinstance(roles, str) else roles
        print(f"hr roles        {roles}  (MUST be [] — this is what makes them ORDINARY)")

        ok = (org_listed and bool(active) and persona != "hr_admin" and not leaked
              and offers_in and state == "clocked_out" and refused and roles == [])
        print("\nFIXTURE " + ("READY" if ok else "NOT READY — see above"))
        if not ok:
            raise SystemExit(1)

        row = await conn.fetchrow(
            "select e.employee_number, e.display_name from hr.employee e where e.id = $1::uuid",
            employee_id)
        print(
            "\nthe ordinary employee:"
            f"\n  email        {EMAIL}"
            f"\n  login user   {user_id}"
            f"\n  employee     {employee_id}  ({row['display_name']}, {row['employee_number']})"
            f"\n  employment   {emp}"
            f"\n  org          {ORG}  (Write Target Sandbox)"
            "\n  surface      /hr/me/time?org=2643e470-b275-47f3-95f3-ae275ad3ca47"
        )
        if "--session" in sys.argv:
            print("\naccess_token (expires on its own; the account has no password):")
            print(token)
    finally:
        await http.aclose()
        await conn.close()


asyncio.run(main())
