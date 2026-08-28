#!/usr/bin/env python3
"""HRB-015 / T-L10-3 — a timecard standing at MANAGER APPROVAL, attested by the employee himself.

WHY THIS FIXTURE EXISTS
-----------------------
The verifier's bulk-decide walk needs a `manager_approval` step that is genuinely ACTIVE and
genuinely reachable — one a manager could decide right now. Every previously staged timecard in this
org failed that in one of two ways: the subject held no login so the attestation could never happen
(the `unreachable` rows), or the whole flow was already closed. A step that is active because nobody
answered is not the same fixture as a step that is active because the employee DID their part and it
is now the manager's turn.

So this one is completed by the employee, as the employee, through the product:

  hr_pay_group_upsert -> hr_employment_set_pay_group -> hr_pay_period_generate
  hr_pay_period_transition('submitted')   ... as the HR admin; this is what OPENS the attestation
  hr_wf_decide(step, 'attested')          ... 🚨 as ZZZ PUNCHEMPLOYEE HIMSELF, over PostgREST,
                                              on a real `authenticated` JWT — not an admin
                                              impersonating him and not an in-database set_config

🚨 THE SUBJECT MUST BE THE ONE WHO ATTESTS. An attestation recorded by anyone else is the exact thing
SPEC-TIME §7.1 forbids ("NEVER silently attested"), and a fixture that fakes it would hand the
verifier a timecard whose history is a lie while looking perfect on screen.

NO CREDENTIAL IS CREATED OR STORED. The account is passwordless; the session is minted with
`admin/generate_link` (magiclink) exchanged at `auth/v1/verify`. Same pattern as
`hrb015_punch_employee_fixture.py`, which is where this person comes from.

IDEMPOTENT. Every step checks before it writes, and an already-attested step is reported rather than
re-decided. A second run changes nothing.

  /Users/armanisadeghi/code/aidream/.venv/bin/python scripts/hr/hrb015_bulk_decide_fixture.py
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import pathlib
import re

ENV = pathlib.Path("/Users/armanisadeghi/code/aidream/.env")

ORG = "2643e470-b275-47f3-95f3-ae275ad3ca47"            # Write Target Sandbox
HR_ADMIN_USER = "87a6e699-3622-4869-8843-d0867456c0dd"  # admin@admin.com
EMPLOYER_PROFILE = "2ac6a8e9-08da-4a0a-a578-cbfcd0d7f6e1"

EMPLOYMENT = "1a7033e5-1536-4f15-9549-4e5dd85285c5"     # Zzz Punchemployee, EMP-00016
EMAIL = "zzz.l3.punch.employee@example.invalid"

GROUP_NAME = "R40 T-L10-3 bulk-decide (fixture)"
# 🚨 THE WINDOW IS PINNED BY TWO FACTS, BOTH MEASURED RATHER THAN ASSUMED.
# His punches are on 2026-08-27, so the period must contain that date; and a period is only
# submittable once its end date has passed. A Friday start puts 08-27 at the end of a weekly window.
# (The other constraint learned the hard way in hr_l3_97's sibling work: authority is evaluated AS OF
# the period's dates, and this org's admin roles only became effective 2026-08-26.)
FIRST_PERIOD_START = "2026-08-21"
TARGET_END = dt.date(2026, 8, 27)


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

    def jd(v):
        return json.loads(v) if isinstance(v, str) else v

    async def as_admin(sql: str, *args):
        # ONE TRANSACTION: set_config(..., is_local => true) dies with the transaction, and asyncpg
        # auto-commits each statement — split them and the door runs with no caller at all.
        async with conn.transaction():
            await conn.execute(
                "select set_config('request.jwt.claims', $1, true)",
                json.dumps({"sub": HR_ADMIN_USER, "role": "authenticated"}),
            )
            return await conn.fetchval(sql, *args)

    try:
        # ---- 1. the pay group and the period that contains his punches -------------------
        gid = await conn.fetchval(
            "select id from hr.pay_group where organization_id=$1::uuid and name=$2"
            "   and deleted_at is null", ORG, GROUP_NAME)
        if gid:
            print(f"pay group        EXISTS    {gid}")
        else:
            res = jd(await as_admin("select public.hr_pay_group_upsert($1::jsonb)", json.dumps({
                "organization_id": ORG, "name": GROUP_NAME, "pay_frequency": "weekly",
                "employer_profile_id": EMPLOYER_PROFILE,
                "first_period_start_on": FIRST_PERIOD_START,
                "workweek_start_dow": 0, "workweek_effective_from": FIRST_PERIOD_START,
                "timesheet_required": True,
            })))
            if not res.get("ok", True):
                print(f"pay group        REFUSED   {json.dumps(res)[:300]}")
                raise SystemExit(1)
            gid = res.get("pay_group_id")
            print(f"pay group        CREATED   {gid}")
        gid = str(gid)

        cur = await conn.fetchval("select pay_group_id from hr.employment where id=$1::uuid", EMPLOYMENT)
        if str(cur) == gid:
            print("pay group        ASSIGNED  (already)")
        else:
            jd(await as_admin("select public.hr_employment_set_pay_group($1::uuid,$2::uuid)",
                              EMPLOYMENT, gid))
            print("pay group        ASSIGNED")

        period = await conn.fetchval(
            "select id from hr.pay_period where pay_group_id=$1::uuid and period_end_on=$2::date",
            gid, TARGET_END)
        if period is None:
            jd(await as_admin("select public.hr_pay_period_generate($1::uuid,$2::date)", gid, TARGET_END))
            period = await conn.fetchval(
                "select id from hr.pay_period where pay_group_id=$1::uuid and period_end_on=$2::date",
                gid, TARGET_END)
        if period is None:
            print(f"period           MISSING — nothing generated ending {TARGET_END}")
            raise SystemExit(1)
        period = str(period)
        state = await conn.fetchval("select state from hr.pay_period where id=$1::uuid", period)
        print(f"period           {period}  state={state}")

        punches = await conn.fetchval(
            "select count(*) from hr.punch p join hr.pay_period pp on pp.id=$1::uuid "
            " where p.employment_id=$2::uuid and p.voided_at is null "
            "   and p.local_work_date between pp.period_start_on and pp.period_end_on",
            period, EMPLOYMENT)
        print(f"his punches in it {punches}")
        if punches == 0:
            print("🚨 the period contains none of his punches — the fixture would be empty")
            raise SystemExit(1)

        # ---- 2. submit: this is what OPENS the attestation ------------------------------
        if state == "open":
            res = jd(await as_admin(
                "select public.hr_pay_period_transition($1::uuid,'submitted',$2)",
                period, "R40: staging a manager-approval step for the bulk-decide walk"))
            if not res.get("ok", True):
                print(f"submit           REFUSED   {json.dumps(res)[:300]}")
                raise SystemExit(1)
            print(f"submit           DONE      {json.dumps(res.get('data', res))[:180]}")
        else:
            print(f"submit           ALREADY   (state={state})")

        # ---- 3. HIS step, and HIS session --------------------------------------------
        step = await conn.fetchrow(
            "select ws.id, ws.state, coalesce(cardinality(ws.resolved_user_ids),0) reachable "
            "  from hr.workflow_step ws "
            "  join hr.workflow_instance wi on wi.id=ws.workflow_instance_id "
            "  join hr.pay_period_employment ppe on ppe.id=wi.target_id "
            " where ppe.pay_period_id=$1::uuid and wi.subject_employment_id=$2::uuid "
            "   and ws.step_key='employee_attestation' order by ws.activated_at desc limit 1",
            period, EMPLOYMENT)
        if step is None:
            print("attestation step MISSING — submitting opened no attestation for him")
            raise SystemExit(1)
        print(f"attestation step {step['id']}  state={step['state']}  reachable={step['reachable']}")
        if step["reachable"] == 0:
            print("🚨 his attestation reaches NOBODY — he is supposed to have a login. Aborting "
                  "rather than staging an `unreachable` row and calling it an attested one.")
            raise SystemExit(1)

        if step["state"] in ("active", "pending"):
            r = await http.post(f"{base}/auth/v1/admin/generate_link", headers=admin_hdr,
                                json={"type": "magiclink", "email": EMAIL})
            r.raise_for_status()
            body = r.json()
            hashed = body.get("hashed_token") or (body.get("properties") or {}).get("hashed_token")
            r = await http.post(f"{base}/auth/v1/verify",
                                headers={"apikey": anon, "Content-Type": "application/json"},
                                json={"type": "magiclink", "token_hash": hashed})
            r.raise_for_status()
            token = r.json()["access_token"]
            print("his session      MINTED    (magiclink; the account has no password)")

            r = await http.post(
                f"{base}/rest/v1/rpc/hr_wf_decide",
                headers={"apikey": anon, "Authorization": f"Bearer {token}",
                         "Content-Type": "application/json",
                         "Content-Profile": "public", "Accept-Profile": "public"},
                json={"p_step_id": str(step["id"]), "p_decision": "attested",
                      "p_reason": "These hours are mine and they are right."},
            )
            out = r.json() if r.status_code < 400 else {"http": r.status_code, "body": r.text[:300]}
            granted = out.get("granted") if isinstance(out, dict) else None
            if isinstance(out, dict) and (out.get("ok") is False or granted is False):
                print(f"attest           REFUSED   {json.dumps(out)[:300]}")
                raise SystemExit(1)
            print(f"attest           DONE as HIM  {json.dumps(out)[:200]}")
        else:
            print(f"attest           ALREADY   (step state={step['state']})")

        # ---- 4. what the verifier will find --------------------------------------------
        rows = await conn.fetch(
            "select ws.step_key, ws.state, ws.id, "
            "       coalesce(cardinality(ws.resolved_user_ids),0) reachable "
            "  from hr.workflow_step ws "
            "  join hr.workflow_instance wi on wi.id=ws.workflow_instance_id "
            "  join hr.pay_period_employment ppe on ppe.id=wi.target_id "
            " where ppe.pay_period_id=$1::uuid order by ws.activated_at nulls last",
            period)
        print("\nthe flow now:")
        for r0 in rows:
            print(f"  {r0['step_key']:<26} {r0['state']:<10} reachable={r0['reachable']}  {r0['id']}")

        mgr = [r0 for r0 in rows
               if r0["step_key"] == "manager_approval" and r0["state"] == "active"
               and r0["reachable"] > 0]
        att = [r0 for r0 in rows if r0["step_key"] == "employee_attestation"
               and r0["state"] not in ("active", "pending")]
        ok = bool(mgr) and bool(att)
        print("\nFIXTURE " + ("READY" if ok else "NOT READY — see above"))
        if not ok:
            print("  needed: employee_attestation decided, AND manager_approval ACTIVE with a "
                  "reachable approver.")
            raise SystemExit(1)
        print(f"\n  period            {period}"
              f"\n  employment        {EMPLOYMENT}  (Zzz Punchemployee, EMP-00016)"
              f"\n  manager step      {mgr[0]['id']}   <- the bulk-decide target"
              f"\n  surface           /hr/time/periods/{period}?org={ORG}")
    finally:
        await http.aclose()
        await conn.close()


asyncio.run(main())
