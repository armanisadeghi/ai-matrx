"""T-L10-3 — STAGE the fixture the campaign's literal skip-walk needs. STAGING ONLY, NO WALK.

Run:  cd /Users/armanisadeghi/code/aidream && uv run --with asyncpg --with python-dotenv \
        python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/t_l10_3_ended_period_punch_fixture.py

🚨 WHAT WAS MISSING, AND WHY THE WALK COULD NOT RUN. Verifier B could not move a timecard digest
mid-batch because no fixture put all three facts on ONE row at once:
  (1) an ACTIVE employee G2V-Priya Raman can punch for,
  (2) whose pay period has ENDED (so a punch into it is a genuine mid-batch move, not a live day),
  (3) whose timesheet is SUBMITTED, so a `timecard_approval` step actually exists to batch.
Every candidate held two of the three. The T-L10-3 pay group's own member (Zzz Punchemployee) has
an ended period, but its timesheet was already APPROVED — no live step. The only ended+submitted
timesheets left belonged to TERMINATED employments with zero punches, which nobody can punch for.

🚨 EVERY WRITE GOES THROUGH A SANCTIONED DOOR. hr_employee_create → hr_pay_group_upsert →
hr_employment_set_pay_group → hr.pay_period_generate → hr.punch_record → hr.pay_period_transition.
The last one is what launches the workflow: pay_period_transition('submitted') calls hr.wf_request
itself for each timesheet, so the `timecard_approval` step is created BY THE ENGINE, not stapled on.
Nothing here writes an hr table directly.

🚨 THE PERIOD IS BACKDATED BY CONSTRUCTION, NOT BY EDITING A ROW. The new pay group's
`first_period_start_on` is 2026-08-01, so pay_period_generate lays down whole weekly periods that
have already ended. No existing period, group, or employment is touched — this fixture is additive,
so the R40 T-L10-3 group and Zzz Punchemployee keep the state their own proofs recorded.

IDEMPOTENT: every step checks for its own prior result first. Re-running prints EXISTS and changes
nothing.
"""
import asyncio, datetime, json, os, sys
import asyncpg
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")

ORG        = "2643e470-b275-47f3-95f3-ae275ad3ca47"   # Write Target Sandbox
HR_ADMIN   = "87a6e699-3622-4869-8843-d0867456c0dd"   # admin@admin.com, hr_admin in this org
PRIYA_UID  = "20149d3f-6572-4263-b43c-7e52f0e42058"   # G2V-Priya Raman
EMPLOYER   = "2ac6a8e9-08da-4a0a-a578-cbfcd0d7f6e1"
JOB_TITLE  = "6e2275c6-47a4-4b6a-9ff4-f48e8adeedb0"
LOCATION   = "0ebbf294-2c02-4c0f-968f-fe780bf000ac"
DEPARTMENT = "6715f29c-c677-4546-9c9a-5e2b591ab16e"

FIRST, LAST = "Zzzended", "Punchme"
EMAIL       = "zzz.ended.punchme@example.test"
HIRE_DATE   = "2026-08-01"
PG_NAME     = "T-L10-3 ended-period skip-walk (fixture)"
PG_FIRST    = "2026-08-01"
THROUGH     = datetime.date(2026, 8, 29)      # lays down whole weeks; the last one ENDS 2026-08-28

def as_admin(uid=HR_ADMIN):
    return json.dumps({"sub": uid, "role": "authenticated"})

async def main():
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0)

    async def door(uid, sql, *args):
        async with conn.transaction():
            await conn.execute("select set_config('request.jwt.claims',$1,true)", as_admin(uid))
            res = await conn.fetchval(sql, *args)
        return json.loads(res) if isinstance(res, str) else res

    # ---- 1. the employee ------------------------------------------------------------------
    emp = await conn.fetchval(
        "select em.id from hr.employment em join hr.employee e on e.id = em.employee_id "
        " where em.organization_id = $1::uuid and e.legal_first_name = $2 and e.legal_last_name = $3 "
        "   and em.deleted_at is null limit 1", ORG, FIRST, LAST)
    if emp:
        print(f"employee        EXISTS    {emp}")
    else:
        r = await door(HR_ADMIN, "select public.hr_employee_create($1::jsonb)", json.dumps({
            "organization_id": ORG, "legal_first_name": FIRST, "legal_last_name": LAST,
            "work_email": EMAIL, "worker_class": "employee", "hire_date": HIRE_DATE,
            "job_title_id": JOB_TITLE, "location_id": LOCATION, "department_id": DEPARTMENT,
            "fte": 1.0, "flsa_status": "nonexempt"}))
        if not r.get("ok"):
            print("DOOR REFUSED hr_employee_create:", json.dumps(r)[:400]); raise SystemExit(1)
        emp = r.get("employment_id") or r.get("employmentId")
        print(f"employee        CREATED   {emp}")
    emp = str(emp)

    # ---- 2. a pay group whose weeks have already ended -------------------------------------
    pg = await conn.fetchval("select id from hr.pay_group where organization_id=$1::uuid and name=$2 "
                             " and deleted_at is null limit 1", ORG, PG_NAME)
    if pg:
        print(f"pay group       EXISTS    {pg}")
    else:
        r = await door(HR_ADMIN, "select public.hr_pay_group_upsert($1::jsonb)", json.dumps({
            "organization_id": ORG, "employer_profile_id": EMPLOYER, "name": PG_NAME,
            "pay_frequency": "weekly", "first_period_start_on": PG_FIRST,
            "workweek_start_dow": 6, "timesheet_required": True, "is_active": True}))
        if not (r.get("ok") or r.get("id") or r.get("pay_group_id")):
            print("DOOR REFUSED hr_pay_group_upsert:", json.dumps(r)[:400]); raise SystemExit(1)
        pg = r.get("pay_group_id") or r.get("id")
        print(f"pay group       CREATED   {pg}")
    pg = str(pg)

    cur = await conn.fetchval("select pay_group_id from hr.employment where id=$1::uuid", emp)
    if str(cur) == pg:
        print(f"pay group set   EXISTS    {pg}")
    else:
        r = await door(HR_ADMIN, "select public.hr_employment_set_pay_group($1::uuid,$2::uuid)", emp, pg)
        print(f"pay group set   {'OK' if (r or {}).get('ok', True) else 'REFUSED'}        {json.dumps(r)[:160]}")

    # ---- 3. the periods (all already ended) ------------------------------------------------
    r = await door(HR_ADMIN, "select hr.pay_period_generate($1::uuid,$2::date)", pg, THROUGH)
    periods = await conn.fetch("select id, period_start_on, period_end_on, state from hr.pay_period "
                               " where pay_group_id=$1::uuid order by period_end_on", pg)
    for p in periods: print("   period", p["period_start_on"], "→", p["period_end_on"], p["state"],
                            "ENDED" if str(p["period_end_on"]) < "2026-08-30" else "NOT ENDED")
    # 🚨 THE REAL SHAPE OF VERIFIER B'S BLOCKER, MEASURED. G2V-Priya Raman's `hr_admin` role
    # assignment has `effective_from = 2026-08-27`, and hr.punch_record asks the capability AT THE
    # PUNCH'S OWN WORK DATE — not at today. So her punch reach is False on 2026-08-26 and earlier
    # and True from 2026-08-27. A weekly period she can punch into must therefore END on or after
    # 2026-08-27, and to be usable it must also have ENDED (before today, 2026-08-30). Exactly one
    # week satisfies both: 2026-08-22 → 2026-08-28. That is why no fixture had all three facts at
    # once — it is a one-week window, not an oversight.
    REACH_FROM = datetime.date(2026, 8, 27)
    TODAY      = datetime.date(2026, 8, 30)
    ended = [p for p in periods if p["period_end_on"] < TODAY and p["period_end_on"] >= REACH_FROM]
    if not ended:
        print("no period is both ENDED and inside Priya's authority window — nothing to stage")
        await conn.close(); return
    target = ended[-1]
    print(f"target period   {target['id']}  {target['period_start_on']} → {target['period_end_on']} "
          f"({target['state']})  — ENDED and inside Priya's reach")

    # ---- 4. PROVE Priya can punch into the ended period — WITHOUT consuming the walk's move -
    # 🚨 THE PUNCH IS ROLLED BACK ON PURPOSE. Moving the timecard mid-batch IS the skip-walk's own
    # action; staging it here would spend the very thing the walk exists to observe. So the reach is
    # PROVEN through the real door on the real date and then undone, leaving the timecard exactly as
    # the walk will find it.
    ppe = await conn.fetchval("select id from hr.pay_period_employment where pay_period_id=$1::uuid "
                              " and employment_id=$2::uuid", target["id"], emp)
    print(f"timesheet       {ppe}")
    at = datetime.datetime.combine(target["period_end_on"], datetime.time(9, 0),
                                   tzinfo=datetime.timezone.utc)
    tx = conn.transaction(); await tx.start()
    try:
        await conn.execute("select set_config('request.jwt.claims',$1,true)", as_admin(PRIYA_UID))
        # the kinds are `clock_in`/`clock_out`; "in"/"out" is refused hr_punch_kind_unknown
        r = await conn.fetchval(
            "select hr.punch_record($1::uuid,'clock_in',$2::timestamptz,'manager_entry',$3,"
            "null,null,null,null)", emp, at, f"tl103-reach-probe-{emp[:8]}")
        r = json.loads(r) if isinstance(r, str) else r
        ok = (r or {}).get("ok") is not False
        print(f"punch reach     {'PROVEN ' if ok else 'REFUSED'}  as Priya, dated {target['period_end_on']}: "
              f"{json.dumps(r)[:180]}")
    finally:
        await tx.rollback()
    left = await conn.fetchval("select count(*) from hr.punch where employment_id=$1::uuid", emp)
    print(f"punch reach     rolled back — punches on this employment: {left} (the walk's move is untouched)")
    if not ok:
        print("REACH REFUSED — the fixture's whole point is that Priya CAN punch for this person "
              "on this date; stopping rather than staging a half-truth.")
        raise SystemExit(1)

    # ---- 5. submit → the engine launches timecard_approval ----------------------------------
    st = await conn.fetchval("select state from hr.pay_period where id=$1::uuid", target["id"])
    if st == "open":
        r = await door(HR_ADMIN, "select hr.pay_period_transition($1::uuid,'submitted',$2)",
                       target["id"], "T-L10-3 skip-walk fixture: submitted so a timecard_approval step exists")
        print("submit          ", json.dumps(r)[:300])
    else:
        print(f"submit          EXISTS    period already {st}")

    # ---- 5b. attestation → approval, through the engine's own sweep -------------------------
    # 🚨 THE ORG REQUIRES ATTESTATION FIRST. `employee_attestation_required` resolves TRUE here, so
    # pay_period_transition launches `timecard_attestation`, not `timecard_approval`. This fixture's
    # employee has no login, so nobody can attest — exactly the shape of the two Zzzrehire timecards
    # already in this org, whose attestation FAILED and whose `timecard_approval` was then launched
    # by hr.timecard_wf_apply. hr.timecard_attestation_sweep is the sanctioned instrument for that
    # transition; the knob is NOT flipped, because a walk fixture may not change how the whole
    # organization works.
    have_appr = await conn.fetchval(
        "select id from hr.workflow_instance where target_id=$1::uuid and flow_key='timecard_approval'", ppe)
    if have_appr:
        print(f"approval flow   EXISTS    {have_appr}")
    else:
        r = await door(HR_ADMIN, "select hr.timecard_attestation_sweep($1::uuid,false)", target["id"])
        print("attestation sweep", json.dumps(r)[:300])

    # ---- 6. what the walk now has ----------------------------------------------------------
    rows = await conn.fetch("""
        select wi.id inst, wi.flow_key, wi.state, ws.step_key, ws.state sstate, ws.resolved_user_ids
          from hr.workflow_instance wi join hr.workflow_step ws on ws.workflow_instance_id = wi.id
         where wi.target_id = $1::uuid order by ws.step_order""", ppe)
    print("\n=== STAGED ===")
    print(f"  employee            Zzzended Punchme   employment {emp}")
    print(f"  pay group           {PG_NAME}   {pg}")
    print(f"  period              {target['period_start_on']} → {target['period_end_on']}  (ENDED)  {target['id']}")
    print(f"  timesheet (target)  {ppe}")
    for r_ in rows:
        print(f"  workflow            {r_['flow_key']} {r_['state']} · step {r_['step_key']} {r_['sstate']} "
              f"· approver {r_['resolved_user_ids']}")
    if not rows:
        print("  workflow            NONE — the submit did not launch one; report, do not force it")
    await conn.close()

asyncio.run(main())
