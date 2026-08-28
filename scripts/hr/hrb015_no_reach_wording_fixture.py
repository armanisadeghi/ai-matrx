#!/usr/bin/env python3
"""HRB-015 — a `no_reach` not-attested timecard, staged through the doors, for the panel wording.

WHY THIS SCRIPT EXISTS
----------------------
`hr.pay_period_get` projects `attestation_reason` — `no_reach` (the employee holds no platform
login, so the attestation was never deliverable and nobody ever asked them) or `no_response` (they
were asked and did not answer). The attestation panel words those two cases differently, because
wording them the same accuses a person with no login of a silence that was the platform's.

Proving the RENDERING needs a row that actually carries the reason, and at the time this was written
NO row in the database carried the key at all. The one live candidate — an open
`unactionable_no_reach` failure on G2S-CAOT Calla Ortega — belongs to another lane's in-flight work,
and closing a workflow failure is a one-way move. So this stages its own, end to end, on a
purpose-made person nobody else's fixture touches.

THE CHAIN, ALL THROUGH DOORS
----------------------------
  hr_pay_group_upsert   → a weekly group whose windows have already passed
  hr_employee_create    → an employee-class person, deliberately NEVER INVITED, so no login exists
  hr_employment_set_pay_group / hr_pay_period_generate / hr_pay_period_transition('submitted')
                        → submitting opens one attestation flow per included employment; this one
                          cannot route to anybody, so the engine raises `unactionable_no_reach`
  hr_wf_resolve_failure(..., 'not_attested', note)
                        → the failure lane's legal resolution for that class, which is what writes
                          `not_attested_reason = 'no_reach'` and the period row's sentence

🚨 `no_response` IS NOT STAGEABLE THIS WAY, AND THAT IS A FINDING, NOT AN OMISSION.
`unactionable_no_reach` is the ONLY failure class whose category lists `not_attested` among its
legal resolutions, and that class arises only when nobody could be resolved — so the failure lane
can produce `no_reach` and nothing else. The sole producer of `no_response` is
`hr.timecard_attestation_sweep`, which requires `reminders_sent >= reminder_max`; reminders are sent
one per `hr.wf_tick()` and gated on `now() >= last_reminder_at + reminder_cadence_hours`. With
reminder_max 3 and a 12-hour cadence that is ~36 hours of wall clock, and there is no honest way to
shorten it that does not fake a timestamp.

IDEMPOTENT. Every step checks before it writes; a second run reports and changes nothing.

  /Users/armanisadeghi/code/aidream/.venv/bin/python scripts/hr/hrb015_no_reach_wording_fixture.py
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import pathlib
import re

ENV = pathlib.Path("/Users/armanisadeghi/code/aidream/.env")

ORG = "2643e470-b275-47f3-95f3-ae275ad3ca47"            # Write Target Sandbox
HR_ADMIN_USER = "87a6e699-3622-4869-8843-d0867456c0dd"  # admin@admin.com, hr_admin here
EMPLOYER_PROFILE = "2ac6a8e9-08da-4a0a-a578-cbfcd0d7f6e1"

GROUP_NAME = "R39 no_reach wording (fixture)"
LEGAL_FIRST, LEGAL_LAST = "Zzz", "Noreach"
JOB_TITLE = "6e2275c6-47a4-4b6a-9ff4-f48e8adeedb0"     # Operations Specialist
LOCATION = "0ebbf294-2c02-4c0f-968f-fe780bf000ac"      # Sandbox HQ (US)
DEPARTMENT = "6715f29c-c677-4546-9c9a-5e2b591ab16e"    # Operations

# 🚨 THE PERIOD WINDOW IS PINNED BETWEEN TWO REAL CONSTRAINTS, AND THE OBVIOUS CHOICE FAILS BOTH.
# `hr.timecard_attestation_sweep` refuses unless the caller holds `payroll.read` AS OF
# `period_end_on` — not today. In this org the only two admin role assignments became effective on
# 2026-08-26 and 2026-08-27, so EVERY period ending before then is unsweepable by anybody alive,
# and a period ending 2026-08-15 returns `hr_no_sweep_authority` no matter who calls it. The other
# edge is the due clock: the sweep needs `now() >= period_end_on + 24h`. That leaves a two-day
# window, so the group starts on a Friday to put a weekly boundary inside it.
FIRST_PERIOD_START = "2026-08-21"
# 🚨 asyncpg will not coerce an ISO string into a `date` parameter — it wants a real date object.
TARGET_END = dt.date(2026, 8, 27)
THROUGH = dt.date(2026, 8, 27)


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

    dsn = (
        f"postgresql://{e['SUPABASE_MATRIX_USER']}:{e['SUPABASE_MATRIX_PASSWORD']}"
        f"@{e['SUPABASE_MATRIX_HOST']}:{e['SUPABASE_MATRIX_PORT']}/{e['SUPABASE_MATRIX_DATABASE_NAME']}"
    )
    conn = await asyncpg.connect(dsn, statement_cache_size=0)

    async def as_admin(sql: str, *args):
        """One transaction: `set_config(..., is_local => true)` dies with the transaction, and
        asyncpg auto-commits each statement, so splitting these runs the door with NO caller."""
        async with conn.transaction():
            await conn.execute(
                "select set_config('request.jwt.claims', $1, true)",
                json.dumps({"sub": HR_ADMIN_USER, "role": "authenticated"}),
            )
            return await conn.fetchval(sql, *args)

    def jd(v):
        return json.loads(v) if isinstance(v, str) else v

    try:
        # ---- 1. the pay group ------------------------------------------------------------
        gid = await conn.fetchval(
            "select id from hr.pay_group where organization_id=$1::uuid and name=$2"
            "   and deleted_at is null", ORG, GROUP_NAME)
        if gid:
            print(f"pay group       EXISTS    {gid}")
        else:
            res = jd(await as_admin("select public.hr_pay_group_upsert($1::jsonb)", json.dumps({
                "organization_id": ORG,
                "name": GROUP_NAME,
                "pay_frequency": "weekly",
                "employer_profile_id": EMPLOYER_PROFILE,
                "first_period_start_on": FIRST_PERIOD_START,
                "workweek_start_dow": 0,
                "workweek_effective_from": FIRST_PERIOD_START,
                "timesheet_required": True,
            })))
            if not res.get("ok", True):
                print(f"pay group       REFUSED   {json.dumps(res)[:400]}")
                raise SystemExit(1)
            gid = res.get("pay_group_id") or res.get("id")
            print(f"pay group       CREATED   {gid}")
        gid = str(gid)

        # ---- 2. the person, DELIBERATELY NEVER INVITED -----------------------------------
        # 🚨 No invitation is issued and none must be: the absence of a login is the whole point.
        # An invited-and-accepted person would resolve to a user, the step would route, and the
        # engine would raise nothing to close.
        emp = await conn.fetchval(
            "select em.id from hr.employment em join hr.employee e on e.id=em.employee_id "
            " where em.organization_id=$1::uuid and em.deleted_at is null "
            "   and e.legal_first_name=$2 and e.legal_last_name=$3 limit 1",
            ORG, LEGAL_FIRST, LEGAL_LAST)
        if emp:
            print(f"employment      EXISTS    {emp}")
        else:
            res = jd(await as_admin("select public.hr_employee_create($1::jsonb)", json.dumps({
                "organization_id": ORG,
                "legal_first_name": LEGAL_FIRST,
                "legal_last_name": LEGAL_LAST,
                "worker_class": "employee",
                "hire_date": "2026-08-01",
                "job_title_id": JOB_TITLE,
                "location_id": LOCATION,
                "department_id": DEPARTMENT,
                "fte": 1.0,
                "flsa_status": "nonexempt",
            })))
            if not res.get("ok"):
                print(f"employee        REFUSED   {json.dumps(res)[:400]}")
                raise SystemExit(1)
            emp = res.get("employment_id") or res.get("employmentId")
            print(f"employment      CREATED   {emp}")
        emp = str(emp)

        login = await conn.fetchval(
            "select e.login_user_id from hr.employee e join hr.employment em on em.employee_id=e.id"
            " where em.id=$1::uuid", emp)
        if login is not None:
            print(f"🚨 this person HAS a login ({login}) — they would resolve, and the close would "
                  f"be no_response, not no_reach. Aborting rather than proving the wrong case.")
            raise SystemExit(1)
        print("login           NONE      (required: this is what makes the close `no_reach`)")

        # ---- 3. the group membership and its periods -------------------------------------
        cur = await conn.fetchval("select pay_group_id from hr.employment where id=$1::uuid", emp)
        if str(cur) == gid:
            print("pay group       ASSIGNED  (already)")
        else:
            res = jd(await as_admin(
                "select public.hr_employment_set_pay_group($1::uuid,$2::uuid)", emp, gid))
            print(f"pay group       ASSIGNED  {json.dumps(res)[:160]}")

        period = await conn.fetchval(
            "select id from hr.pay_period where pay_group_id=$1::uuid and period_end_on=$2::date",
            gid, TARGET_END)
        if period is None:
            res = jd(await as_admin(
                "select public.hr_pay_period_generate($1::uuid,$2::date)", gid, THROUGH))
            print(f"periods         GENERATED {json.dumps(res)[:200]}")
            period = await conn.fetchval(
                "select id from hr.pay_period where pay_group_id=$1::uuid and period_end_on=$2::date",
                gid, TARGET_END)
        if period is None:
            print("period          MISSING — generation produced no period ending "
                  f"{TARGET_END}")
            raise SystemExit(1)
        period = str(period)
        state = await conn.fetchval("select state from hr.pay_period where id=$1::uuid", period)
        print(f"period          {period}  state={state}")

        # ---- 4. submit — which is what OPENS the attestation flow ------------------------
        if state == "open":
            res = jd(await as_admin(
                "select public.hr_pay_period_transition($1::uuid,'submitted',$2)",
                period, "R39: staging a no_reach attestation close for the panel wording"))
            if not res.get("ok", True):
                print(f"submit          REFUSED   {json.dumps(res)[:400]}")
                raise SystemExit(1)
            print(f"submit          DONE      {json.dumps(res)[:200]}")
        else:
            print(f"submit          ALREADY   (state={state})")

        # ---- 5. the failure the engine raised, closed through the failure lane -----------
        row = await conn.fetchrow(
            """
            select wf.id as failure_id, wf.failure_class, wf.state as failure_state,
                   ws.id as step_id, ws.state as step_state,
                   coalesce(cardinality(ws.resolved_user_ids),0) as reachable
              from hr.workflow_failure wf
              join hr.workflow_step ws on ws.id = wf.workflow_step_id
              join hr.workflow_instance wi on wi.id = ws.workflow_instance_id
             where wi.subject_employment_id = $1::uuid
               and ws.step_key = 'employee_attestation'
             order by wf.created_at desc limit 1
            """, emp)
        if row is None:
            # 🚨 NO FAILURE IS RAISED FOR THIS CASE, AND THAT IS DELIBERATE.
            # `hr.wf_activate_step` suppresses the unroutable failure specifically for a self-step
            # whose subject holds no login — otherwise every login-less employment would raise one
            # per period (the code puts it at 8 employments x 59 periods) and bury the panel. The
            # deliberate signal for this case is the CLOSE, not a failure row. So the failure lane
            # is not the producer here; the sweep is, and an unreachable step is eligible for it on
            # the due-hours clock alone (`cardinality(resolved_user_ids) = 0` satisfies the
            # reminders condition outright, because a reminder could never have been delivered).
            step = await conn.fetchrow(
                "select ws.id, ws.state, coalesce(cardinality(ws.resolved_user_ids),0) reachable "
                "  from hr.workflow_step ws join hr.workflow_instance wi "
                "    on wi.id=ws.workflow_instance_id "
                " where wi.subject_employment_id=$1::uuid and ws.step_key='employee_attestation' "
                " order by ws.activated_at desc limit 1",
                emp)
            if step is None:
                print("step            NONE — submitting opened no attestation step at all.")
                raise SystemExit(1)
            print(f"failure         NONE (suppressed by design for a login-less self-step)")
            print(f"step            {step['id']}  state={step['state']}  "
                  f"reachable={step['reachable']}  (MUST be 0 for no_reach)")
            if step["state"] in ("active", "unroutable"):
                res = jd(await as_admin(
                    "select hr.timecard_attestation_sweep($1::uuid, false)", period))
                print(f"sweep           RAN       {json.dumps(res)[:300]}")
            else:
                print(f"sweep           SKIPPED   (step already {step['state']})")
            row = None
        else:
            print(f"failure         {row['failure_id']}  class={row['failure_class']}  "
                  f"state={row['failure_state']}  step={row['step_state']}  "
                  f"reachable={row['reachable']}  (reachable MUST be 0 for no_reach)")

        if row is not None and row["failure_state"] == "open":
            res = jd(await as_admin(
                "select public.hr_wf_resolve_failure($1::uuid,'not_attested',$2)",
                str(row["failure_id"]),
                "R39: closed as not attested — this employee holds no platform login, so the "
                "attestation was never deliverable to them."))
            if not (res.get("granted", True) and res.get("ok", True)):
                print(f"close           REFUSED   {json.dumps(res)[:400]}")
                raise SystemExit(1)
            print(f"close           DONE      {json.dumps(res)[:220]}")
        elif row is not None:
            print(f"close           ALREADY   (failure state={row['failure_state']})")

        # ---- 6. READ IT BACK FROM THE DOOR THE PANEL ACTUALLY CALLS ----------------------
        got = jd(await as_admin("select public.hr_pay_period_get($1::uuid)", period))
        rows = ((got.get("workflow") or {}).get("rows") or [])
        mine = [r for r in rows if str(r.get("employment_id")) == emp]
        print(f"\npay_period_get  {len(rows)} workflow row(s); {len(mine)} for this person")
        for r in mine:
            print(f"  subject_name         {r.get('subject_name')}")
            print(f"  attestation_outcome  {r.get('attestation_outcome')}")
            print(f"  attestation_reason   {r.get('attestation_reason')}")
            print(f"  attestation_note     {r.get('attestation_note')}")
        ok = bool(mine) and mine[0].get("attestation_reason") == "no_reach"
        print("\nFIXTURE " + ("READY" if ok else "NOT READY — see above"))
        if not ok:
            raise SystemExit(1)
        print(f"\n  period    {period}"
              f"\n  employment {emp}"
              f"\n  surface   /hr/time/periods/{period}?org={ORG}")
    finally:
        await conn.close()


asyncio.run(main())
