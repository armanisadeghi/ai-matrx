#!/usr/bin/env python3
"""HRB-013 — the populated `/hr/me/pay` fixture, completed through the product's own flow.

WHY THIS SCRIPT EXISTS. `/hr/me/pay` renders a person's OWN compensation, so proving it needs a
person who has BOTH an approved-effective comp row AND a session. Neither half was reachable by
hand:

  · A pay CHANGE on an existing employment routes to the workflow engine and correctly stops at
    `distinct_actor_required` — separation of duties needs a third person a two-person sandbox does
    not have. Starting compensation on a HIRE is not a pay change, so `hr_employee_create` writes
    it directly. That is the way round, and it is the product's own rule rather than a bypass.

  · `inv_accept` binds the invitation to the AUTHENTICATED caller, and `/api/dev-login` only ever
    signs in the admin from the environment. Every OTHER account that exists belongs to a real
    colleague or a real signup, and binding one of those to a fixture would hand a real person an
    employment and HR access they never asked for. So this creates a PURPOSE-MADE account that
    exists only for this fixture, at an address in a reserved non-deliverable domain.

🚨 THE PASSWORD IS NEVER STORED, LOGGED OR PRINTED. It is generated per run, used for one
sign-in, and discarded when the process exits; only the resulting access token is printed, and it
expires on its own. This is the same shape as the Leave lane's `hrb017_contractor_fixture.py`.

IDEMPOTENT. Every step checks before it writes: an existing auth user is reused, an already
accepted invitation is reported rather than re-accepted, and a second run of the whole thing
changes nothing. Safe to re-run after a database refresh to rebuild the fixture.

  python3 scripts/hr/hrb013_pay_fixture.py            # build + verify at the door level
  python3 scripts/hr/hrb013_pay_fixture.py --session  # ...and print an access token for a browser look
"""

import asyncio
import os
import pathlib
import re
import sys

ENV = pathlib.Path("/Users/armanisadeghi/code/aidream/.env")

ORG = "7cd12da2-2213-4378-8fba-a9e2dc4ea657"            # Castellano & Reyes, LLP
EMPLOYEE = "2e7c819d-16b1-4161-9203-fb7549ad7699"       # Zzz Payfixture, EMP-00002
EMPLOYMENT = "22e13bc7-1cb5-427b-aaba-281f68fd3ca2"
EMAIL = "zzz.payfixture@example.invalid"
HR_ADMIN_USER = "87a6e699-3622-4869-8843-d0867456c0dd"  # admin@admin.com, hr_admin here
EXPECTED_AMOUNT = 132500


def throwaway_password() -> str:
    """Satisfies the project's complexity policy (lower, upper, digit, symbol) and is never stored.

    Supabase rejects a hex-only string with `weak_password`, hence the fixed affixes.
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
    admin_hdr = {"apikey": service, "Authorization": f"Bearer {service}"}

    try:
        # ---- 1. the purpose-made auth user (idempotent) ------------------------------
        r = await http.get(
            f"{base}/auth/v1/admin/users", headers=admin_hdr, params={"page": 1, "per_page": 200}
        )
        r.raise_for_status()
        user_id = next(
            (u["id"] for u in r.json().get("users", []) if (u.get("email") or "").lower() == EMAIL),
            None,
        )
        if user_id:
            print(f"auth user  REUSED   {user_id}  {EMAIL}")
        else:
            r = await http.post(
                f"{base}/auth/v1/admin/users",
                headers=admin_hdr,
                json={"email": EMAIL, "email_confirm": True, "password": throwaway_password()},
            )
            if r.status_code >= 400:
                print(f"auth user  FAILED {r.status_code}: {r.text[:400]}")
                raise SystemExit(1)
            user_id = r.json()["id"]
            print(f"auth user  CREATED  {user_id}  {EMAIL}")

        # ---- 2. the employee record and its starting compensation --------------------
        row = await conn.fetchrow(
            """
            select e.employee_number, e.display_name, e.login_user_id,
                   c.amount, c.currency, c.per_unit, c.component_kind, c.effective_from
              from hr.employee e
              join hr.employment em on em.employee_id = e.id and em.deleted_at is null
              left join hr.compensation c
                     on c.employment_id = em.id and c.deleted_at is null
             where e.id = $1::uuid
             order by c.effective_from desc nulls last
             limit 1
            """,
            EMPLOYEE,
        )
        if row is None:
            print("employee   MISSING — re-run the hire step before this script")
            raise SystemExit(1)
        print(
            f"employee   {row['employee_number']}  {row['display_name']}  "
            f"{row['component_kind']} {row['amount']} {row['currency']}/{row['per_unit']} "
            f"from {row['effective_from']}"
        )
        if row["amount"] is None or int(row["amount"]) != EXPECTED_AMOUNT:
            print(f"comp row   WRONG — expected {EXPECTED_AMOUNT}, found {row['amount']}")
            raise SystemExit(1)

        # ---- 3. accept the invitation AS THAT USER (idempotent) ----------------------
        # 🚨 `hr_invite_accept`, NOT `inv_accept`. The generic platform door writes the
        # MEMBERSHIP and stops; the HR door calls it and then does the half that matters
        # here — setting `hr.employee.login_user_id`, which is what makes the person's own
        # record reachable. Calling the generic one leaves somebody a member of the org who
        # cannot open their own HR record: the exact mirror of the trap hr_l1_44 closed,
        # and it is what this script did on its first run before the check below caught it.
        # There is no trigger that binds it — verified against pg_trigger — so the door is
        # the only thing that does.
        if row["login_user_id"] is not None:
            print(f"invite     ALREADY ACCEPTED  login_user_id={row['login_user_id']}")
        else:
            # A pending invitation, issued by the HR admin. Re-issued when the last one was
            # consumed or expired, so the script never depends on a token pasted into it.
            tok = await conn.fetchval(
                """
                select i.token from iam.invitations i
                 where i.metadata ->> 'hr_employee_id' = $1::text
                   and i.status = 'pending' and i.deleted_at is null
                   and (i.expires_at is null or i.expires_at > now())
                 order by i.created_at desc limit 1
                """,
                EMPLOYEE,
            )
            if tok is None:
                # 🚨 ONE TRANSACTION. `set_config(..., is_local => true)` lasts for the
                # TRANSACTION, and asyncpg auto-commits each statement on its own — so
                # setting the claims in one call and issuing the invite in the next runs
                # the door with no caller at all ("hr write: no authenticated caller").
                async with conn.transaction():
                    await conn.execute(
                        "select set_config('request.jwt.claims',"
                        " json_build_object('sub',$1::text,'role','authenticated')::text, true)",
                        HR_ADMIN_USER,
                    )
                    inv = await conn.fetchval(
                        "select public.hr_employee_invite($1::uuid, $2::text, null)",
                        EMPLOYEE, EMAIL,
                    )
                import json as _json
                tok = (_json.loads(inv) if isinstance(inv, str) else inv).get("token")
                print(f"invite     ISSUED    {tok}")
            else:
                print(f"invite     PENDING   {tok}")

            pw = throwaway_password()
            r = await http.put(
                f"{base}/auth/v1/admin/users/{user_id}", headers=admin_hdr, json={"password": pw}
            )
            if r.status_code >= 400:
                print(f"password   FAILED {r.status_code}: {r.text[:300]}")
                raise SystemExit(1)
            r = await http.post(
                f"{base}/auth/v1/token?grant_type=password",
                headers={"apikey": anon, "Content-Type": "application/json"},
                json={"email": EMAIL, "password": pw},
            )
            if r.status_code >= 400:
                print(f"sign-in    FAILED {r.status_code}: {r.text[:300]}")
                raise SystemExit(1)
            token = r.json()["access_token"]

            r = await http.post(
                f"{base}/rest/v1/rpc/hr_invite_accept",
                headers={
                    "apikey": anon,
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Content-Profile": "public",
                },
                json={"p_token": tok},
            )
            if r.status_code >= 400:
                print(f"accept     FAILED {r.status_code}: {r.text[:400]}")
                raise SystemExit(1)
            print(f"invite     ACCEPTED as {EMAIL}")

        # ---- 4. verify at the DOOR level, as that person -----------------------------
        pw = throwaway_password()
        await http.put(
            f"{base}/auth/v1/admin/users/{user_id}", headers=admin_hdr, json={"password": pw}
        )
        r = await http.post(
            f"{base}/auth/v1/token?grant_type=password",
            headers={"apikey": anon, "Content-Type": "application/json"},
            json={"email": EMAIL, "password": pw},
        )
        r.raise_for_status()
        token = r.json()["access_token"]
        as_them = {
            "apikey": anon,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Content-Profile": "public",
            "Accept-Profile": "public",
        }

        r = await http.post(
            f"{base}/rest/v1/rpc/hr_my_context", headers=as_them,
            json={"p_organization_id": ORG},
        )
        ctx = r.json() if r.status_code < 400 else {}
        employers = [x.get("name") for x in (ctx.get("employers") or [])]
        active = ctx.get("active") or {}
        listed = "Castellano & Reyes, LLP" in employers
        print(f"context    employers={employers}  active={'yes' if active else 'NO'}")

        r = await http.post(
            f"{base}/rest/v1/rpc/hr_my_compensation", headers=as_them,
            json={"p_employment_id": EMPLOYMENT, "p_as_of": None},
        )
        comp = r.json() if r.status_code < 400 else {}
        current = comp.get("current") or []
        amounts = [c.get("amount") for c in current]
        print(f"my pay     current={len(current)} row(s)  amounts={amounts}")

        ok = listed and bool(active) and len(current) >= 1 and any(
            c.get("amount") is not None and int(float(c["amount"])) == EXPECTED_AMOUNT
            for c in current
        )
        print("\nFIXTURE " + ("READY" if ok else "NOT READY — see above"))
        if not ok:
            raise SystemExit(1)

        print(
            "\nidentity for the browser look:"
            f"\n  email        {EMAIL}"
            f"\n  employee     {EMPLOYEE}  (Zzz Payfixture, EMP-00002)"
            f"\n  employment   {EMPLOYMENT}"
            f"\n  org          {ORG}  (castellano-reyes)"
            "\n  surface      /hr/me/pay?org=castellano-reyes"
        )
        if "--session" in sys.argv:
            print("\naccess_token (expires with the session; the password is discarded):")
            print(token)
    finally:
        await http.aclose()
        await conn.close()


asyncio.run(main())
