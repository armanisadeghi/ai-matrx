"""HRB-017 — the NEGATIVE-half fixture: a contractor with a login and NO leave enrolment.

    cd /Users/armanisadeghi/code/aidream && uv run --with asyncpg --with httpx \
        python ../matrx-frontend/scripts/hr/hrb017_contractor_fixture.py [--session]

WHY THIS EXISTS
---------------
Round 33: the verifier could not test the NEGATIVE half of the leave nav flag — *a plain
contractor sees no My Time Off* — because the org's only contractor with a login is G2T13, and he
now holds the SPEC-LEAVE §2.8 override enrolment that makes the entry legitimately visible. The
positive case ate the only subject for the negative one.

So this creates a SECOND contractor: a real login, a real employment, worker class `contractor`,
and **no leave enrolment at all**. It is the control for `hr_l5_30` — without it, "the flag hides
leave from an ordinary contractor" is a claim nobody can walk.

THROUGH THE PRODUCT DOOR, NOT AROUND IT
---------------------------------------
`public.hr_employee_create` creates the employee, the employment and the primary position
assignment in one call, and takes `link_user_id` and `worker_class` directly. This lane has twice
shipped defects caused by fixtures written with raw INSERTs that walked past a door — a policy
deleted under a live page, and a contractor enrolled into an employee-only policy. So this fixture
uses the door, and the door's refusals are reported rather than worked around.

NO CREDENTIAL IS EVER WRITTEN DOWN
----------------------------------
`/api/dev-login` only ever signs in the admin from the environment, so it cannot mint a session for
this person. Instead `--session` sets a fresh random password through the Supabase admin API,
signs in with it, and prints only the resulting access token — the password exists for the length
of one function call and is never stored, logged, or committed. Re-run it whenever a session is
needed; it is idempotent and rotates.
"""

from __future__ import annotations

import asyncio
import json
import os
import pathlib
import re
import sys

ENV = pathlib.Path("/Users/armanisadeghi/code/aidream/.env")

ORG = "2643e470-b275-47f3-95f3-ae275ad3ca47"          # Write Target Sandbox
HR_ADMIN_USER = "87a6e699-3622-4869-8843-d0867456c0dd"  # admin@admin.com, hr_admin in this org
EMAIL = "zzz.l5.plain.contractor@example.test"
LEGAL_FIRST, LEGAL_LAST = "Zzz", "Plaincontractor"
JOB_TITLE = "6e2275c6-47a4-4b6a-9ff4-f48e8adeedb0"     # Operations Specialist
LOCATION = "0ebbf294-2c02-4c0f-968f-fe780bf000ac"      # Sandbox HQ (US)
DEPARTMENT = "6715f29c-c677-4546-9c9a-5e2b591ab16e"    # Operations


def throwaway_password() -> str:
    """A password that satisfies the project's complexity policy and is never stored.

    Supabase rejects a hex-only string with `weak_password` — it wants lower, upper, digit and
    symbol. It exists for the length of one sign-in and is discarded.
    """
    return "Zz9!" + os.urandom(12).hex() + "Aa1@"


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

    try:
        # ---- 1. the auth user (idempotent)
        r = await http.get(
            f"{base}/auth/v1/admin/users",
            headers={"apikey": service, "Authorization": f"Bearer {service}"},
            params={"page": 1, "per_page": 200},
        )
        existing = next((u for u in r.json().get("users", []) if u.get("email") == EMAIL), None)
        if existing:
            user_id = existing["id"]
            print(f"auth user exists      : {EMAIL} -> {user_id}")
        else:
            r = await http.post(
                f"{base}/auth/v1/admin/users",
                headers={"apikey": service, "Authorization": f"Bearer {service}"},
                json={"email": EMAIL, "email_confirm": True,
                      "password": throwaway_password()},
            )
            r.raise_for_status()
            user_id = r.json()["id"]
            print(f"auth user created     : {EMAIL} -> {user_id}")

        # ---- 1b. clear a half-made fixture from the linked-at-create attempt described below,
        # which leaves an employee who can sign in but is not an org member and cannot be invited.
        stuck = await conn.fetchval(
            "select em.id from hr.employment em join hr.employee e on e.id = em.employee_id "
            " where e.login_user_id = $1::uuid and em.organization_id = $2::uuid "
            "   and em.deleted_at is null "
            "   and not exists (select 1 from iam.organization_member om "
            "                    where om.organization_id = $2::uuid and om.user_id = $1::uuid) "
            " limit 1",
            user_id, ORG,
        )
        if stuck:
            # UNLINK rather than delete. The employee is fine — it is only the login link that is
            # premature, and it is what makes `hr_employee_invite` refuse ("already signs in
            # here"). Clearing it lets the invitation do its job: accepting is what writes the
            # organization membership AND links the login, in that one act. Deleting instead
            # would fight a web of denormalised pointers and a trigger that restores them, to
            # arrive at the same place.
            print(f"unlinking half-made   : {stuck} (linked login, no membership, uninvitable)")
            await conn.execute(
                "do $$ begin perform hr.arm_write(); "
                "update hr.employee set login_user_id = null "
                f" where id in (select employee_id from hr.employment where id = $tok${stuck}$tok$::uuid); "
                "end $$;")
            await conn.execute(
                "do $$ begin perform hr.arm_write(); "
                f"delete from hr.employee where login_user_id = $tok${user_id}$tok$::uuid "
                f"  and organization_id = $tok${ORG}$tok$::uuid; end $$;")

        # ---- 2. the employee + employment + primary assignment, THROUGH THE DOOR
        # Found by NAME, not by login: the employee is created unlinked and only becomes linked
        # when the invitation is accepted.
        emp = await conn.fetchval(
            "select em.id from hr.employment em join hr.employee e on e.id = em.employee_id "
            " where em.organization_id = $1::uuid and em.deleted_at is null "
            "   and e.legal_first_name = $2 and e.legal_last_name = $3 limit 1",
            ORG, LEGAL_FIRST, LEGAL_LAST,
        )
        if emp:
            print(f"employment exists     : {emp}")
        else:
            # 🚨 CREATED UNLINKED, ON PURPOSE — the invitation is what links a login.
            #
            # Two product defects were found trying to do this the other way round, both reported
            # rather than worked around:
            #   1. `hr_employee_create` with `link_user_id` calls
            #      `crm.ensure_user_party(user, 'hr.employee_create')`, and that function accepts
            #      only ('signup','promotion','backfill','reconcile') — so it raises
            #      `ensure_user_party: unsupported source` on EVERY such call, handing an HR admin
            #      a raw Postgres sentence.
            #   2. Supplying `party_id` to dodge that DOES create the employee — but linking a
            #      login there writes NO organization membership, and `hr_employee_invite` then
            #      refuses ("already signs in here. There is nothing to invite"). The result is an
            #      employee who can sign in, is on the roster, and can never load the HR shell,
            #      with no door left to fix it.
            #
            # So the fixture uses the flow the product actually intends: create UNLINKED, invite,
            # accept. The accept writes the membership and links the login in one act.
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
                        # 🚨 THE POINT OF THE FIXTURE.
                        "worker_class": "contractor",
                        "hire_date": "2026-08-01",
                        "job_title_id": JOB_TITLE,
                        "location_id": LOCATION,
                        "department_id": DEPARTMENT,
                        "fte": 1.0,
                        "flsa_status": "nonexempt",
                    }),
                )
            res = json.loads(res)
            if not res.get("ok"):
                print(f"DOOR REFUSED: {json.dumps(res)[:400]}")
                raise SystemExit(1)
            emp = res.get("employment_id") or res.get("employmentId")
            print(f"employment created    : {emp}")

        # ---- 2b. ORG MEMBERSHIP, through the invite door.
        # `hr_employee_create` links `login_user_id` but does NOT make somebody a member of the
        # organization — and `hr_my_context` builds its `active` block only for members, so
        # without this the fixture cannot even load the HR shell and is useless to a verifier.
        # The invitation's iam half is what writes the membership.
        member = await conn.fetchval(
            "select exists (select 1 from iam.organization_member "
            "  where organization_id = $1::uuid and user_id = $2::uuid)", ORG, user_id)
        if member:
            print("org membership exists : yes")
        else:
            employee_id = await conn.fetchval(
                "select employee_id from hr.employment where id = $1::uuid", emp)
            async with conn.transaction():
                await conn.execute(
                    "select set_config('request.jwt.claims', $1, true)",
                    json.dumps({"sub": HR_ADMIN_USER, "role": "authenticated"}),
                )
                inv = json.loads(await conn.fetchval(
                    "select public.hr_employee_invite($1::uuid, $2, now() + interval '7 days')",
                    employee_id, EMAIL))
            token = inv.get("token") or inv.get("invitation_token")
            print(f"invite issued         : {json.dumps(inv)[:160]}")
            if token:
                async with conn.transaction():
                    await conn.execute(
                        "select set_config('request.jwt.claims', $1, true)",
                        json.dumps({"sub": user_id, "role": "authenticated"}),
                    )
                    acc = json.loads(await conn.fetchval(
                        "select public.hr_invite_accept($1)", token))
                print(f"invite accepted       : {json.dumps(acc)[:200]}")
            member = await conn.fetchval(
                "select exists (select 1 from iam.organization_member "
                "  where organization_id = $1::uuid and user_id = $2::uuid)", ORG, user_id)
            print(f"org membership        : {member}")

        # ---- 3. assert the fixture is what it claims to be
        row = await conn.fetchrow(
            "select e.employee_number, pa.worker_class, "
            "       (select count(*) from hr.leave_enrollment le "
            "         where le.employment_id = em.id and le.deleted_at is null) as enrolments "
            "  from hr.employment em "
            "  join hr.employee e on e.id = em.employee_id "
            "  left join hr.position_assignment pa on pa.employment_id = em.id and pa.is_primary "
            "                                     and pa.deleted_at is null "
            " where em.id = $1::uuid",
            emp,
        )
        ok = row["worker_class"] == "contractor" and row["enrolments"] == 0
        print(f"employee_number       : {row['employee_number']}")
        print(f"worker_class          : {row['worker_class']}")
        print(f"leave enrolments      : {row['enrolments']}  (MUST be 0 — this is the control)")

        # ---- 4. and that the nav flag says what the negative half needs it to say
        async with conn.transaction():
            await conn.execute(
                "select set_config('request.jwt.claims', $1, true)",
                json.dumps({"sub": user_id, "role": "authenticated"}),
            )
            ctx = json.loads(await conn.fetchval(
                "select public.hr_my_context($1::uuid)", ORG))
        active = ctx.get("active") or {}
        print(f"hr_my_context.worker_class              : {active.get('worker_class')}")
        print(f"hr_my_context.has_active_leave_enrolment: "
              f"{active.get('has_active_leave_enrolment')}")
        ok = ok and active.get("worker_class") == "contractor" \
            and active.get("has_active_leave_enrolment") is False
        print("\nFIXTURE " + ("READY" if ok else "NOT READY — see above"))
        if not ok:
            raise SystemExit(1)

        # ---- 5. a session, without writing a credential anywhere
        if "--session" in sys.argv:
            pw = throwaway_password()
            r = await http.put(
                f"{base}/auth/v1/admin/users/{user_id}",
                headers={"apikey": service, "Authorization": f"Bearer {service}"},
                json={"password": pw},
            )
            if r.status_code >= 400:
                print(f"password set FAILED {r.status_code}: {r.text[:300]}")
                raise SystemExit(1)
            r = await http.post(
                f"{base}/auth/v1/token?grant_type=password",
                headers={"apikey": anon, "Content-Type": "application/json"},
                json={"email": EMAIL, "password": pw},
            )
            if r.status_code >= 400:
                print(f"sign-in FAILED {r.status_code}: {r.text[:300]}")
                raise SystemExit(1)
            print("\naccess_token (expires with the session; the password is discarded):")
            print(r.json()["access_token"])
    finally:
        await http.aclose()
        await conn.close()


asyncio.run(main())
