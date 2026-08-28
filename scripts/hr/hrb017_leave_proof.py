"""HRB-017 (L5 Leave & PTO) — the end-to-end proof, driven as REAL USERS through PostgREST.

    cd /Users/armanisadeghi/code/aidream && uv run --with asyncpg --with httpx \
        python ../matrx-frontend/scripts/hr/hrb017_leave_proof.py [--keep]

WHY IT IS SHAPED THIS WAY
-------------------------
The program's own law: *prove doors through `POST /rest/v1/rpc` with a real user token, never
only privileged SQL.* A `SECURITY DEFINER` door that writes can pass every privileged-SQL probe
and still die for an actual signed-in person — that is the class of defect this file exists to
catch. So every assertion about a DOOR goes over HTTPS with a bearer token minted by signing the
test employee in; privileged SQL is used ONLY to set the fixtures up and to read the ledger back
afterwards as an independent witness.

The chain proved here is the one the G2 finish line needs and the one nothing in this system had
ever run: an employee files leave → the ONE workflow engine routes it → the item appears in the
ONE inbox → an approver decides it in the engine → `hr.leave_wf_apply` writes ONE usage entry →
the five figures move, and the identity still holds against the ledger.

Everything it creates is prefixed `ZZZ L5 PROOF` and, unless `--keep` is passed, the leave rows
it wrote are removed at the end. The ledger is append-only, so cleanup is a hard delete run as
the migration role — which is exactly why this proof runs against a sandbox org.
"""

from __future__ import annotations

import asyncio
import json
import os
import pathlib
import re
import sys
from datetime import date, timedelta

ENV = pathlib.Path("/Users/armanisadeghi/code/aidream/.env")
ORG = "2643e470-b275-47f3-95f3-ae275ad3ca47"          # Write Target Sandbox
EMPLOYEE = "11dfa190-8762-4bca-b131-ee13ed397f72"      # EMP-00012, g2t13.tomas@example.test
APPROVER = "ca9e12da-35bb-402d-8bda-1b76fa4c678d"      # EMP-00004, admin+g2v.priya@admin.com
EMPLOYEE_USER = "daeb6d44-a7dd-4085-aba2-5025fb711b79"
PROOF_PW = "L5-proof-" + os.urandom(6).hex()

RED: list[str] = []
GREEN = 0


def env() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in ENV.read_text().splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            out[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return out


def check(label: str, ok: bool, detail: str = "") -> None:
    global GREEN
    if ok:
        GREEN += 1
        print(f"  \033[32mPASS\033[0m {label}")
    else:
        RED.append(f"{label} — {detail}")
        print(f"  \033[31mRED \033[0m {label} — {detail}")


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
    policy_id: str | None = None
    request_id: str | None = None

    async def rpc(fn: str, body: dict, token: str) -> object:
        r = await http.post(
            f"{base}/rest/v1/rpc/{fn}",
            headers={
                "apikey": anon,
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                # PostgREST resolves an RPC in the FIRST exposed schema unless the caller names
                # one. `api` is first on this fleet, so a `public.hr_*` door is a 404 without
                # these two headers — which is exactly what supabase-js sends by default
                # (`db.schema = "public"`), so this matches what the browser will do.
                "Content-Profile": "public",
                "Accept-Profile": "public",
            },
            json=body,
        )
        if r.status_code >= 400:
            return {"__http_error": r.status_code, "body": r.text[:400]}
        return r.json()

    async def purge() -> None:
        """Remove every row a previous run of this proof left behind, by name prefix.

        The ledger is append-only by trigger, which is the point of it — so the ONLY way to clean
        up is to disable that trigger for the delete and put it straight back. That is lawful for
        a proof fixture in a sandbox org and would be a defect anywhere else.
        """
        ids = await conn.fetch(
            "select id from hr.leave_policy where organization_id=$1::uuid and name like 'ZZZ L5 PROOF%'",
            ORG,
        )
        for row in ids:
            pid = str(row["id"])
            # `hr.calculation_snapshot` refuses deletion outright ("evidence is never deleted",
            # SPEC-JURISDICTION §4.5) and that refusal is correct — so the proof's snapshots stay.
            # They outlive the rows they explain, which is exactly what evidence is for.
            await conn.execute("alter table hr.leave_ledger disable trigger _zz_leave_ledger_no_delete")
            await conn.execute(
                "do $$ begin perform hr.arm_write(); "
                f"delete from hr.leave_ledger where leave_policy_id = $tok${pid}$tok$::uuid; end $$;"
            )
            await conn.execute("alter table hr.leave_ledger enable trigger _zz_leave_ledger_no_delete")
            await conn.execute(
                "do $$ begin perform hr.arm_write(); "
                f"delete from hr.workflow_instance where target_token='hr_leave_request' and target_id in "
                f"  (select id from hr.leave_request where leave_policy_id = $tok${pid}$tok$::uuid); end $$;"
            )
            for tbl in ("leave_request", "leave_enrollment", "leave_policy"):
                col = "id" if tbl == "leave_policy" else "leave_policy_id"
                await conn.execute(
                    f"do $$ begin perform hr.arm_write(); "
                    f"delete from hr.{tbl} where {col} = $tok${pid}$tok$::uuid; end $$;"
                )

    try:
        print("\n=== 0. Fixtures (privileged; this half is setup, not proof) ===")
        await purge()

        # An employment with no standard hours per week cannot state how long a leave day is.
        # Every position assignment in this sandbox has it NULL — recorded as a finding; here we
        # set it so the day-hours basis has something true to read.
        await conn.execute(
            "do $$ begin perform hr.arm_write(); "
            "update hr.position_assignment set standard_hours_per_week = 40 "
            " where employment_id = $tok$" + EMPLOYEE + "$tok$::uuid and is_primary "
            "   and standard_hours_per_week is null; end $$;"
        )

        policy_id = await conn.fetchval(
            """
            with armed as (select hr.arm_write())
            insert into hr.leave_policy
              (name, leave_kind, accrual_method, accrual_rate, accrual_unit, accrual_starts,
               balance_cap, carryover_allowed, increment_minutes, requires_approval,
               worker_class_scope, schedule_class_scope, is_active, organization_id)
            select 'ZZZ L5 PROOF — PTO bank', 'pto', 'per_pay_period', 3.08, 'pay_period', 'hire',
                   120, true, 15, true, '{employee}'::text[], '{}'::text[], true, $1::uuid
              from armed
            returning id
            """,
            ORG,
        )
        policy_id = str(policy_id)
        enroll_id = await conn.fetchval(
            """
            with armed as (select hr.arm_write())
            insert into hr.leave_enrollment
              (employment_id, leave_policy_id, effective_from, policy_year_start_on, organization_id)
            select $1::uuid, $2::uuid, current_date - 200, date_trunc('year', current_date)::date, $3::uuid
              from armed
            returning id
            """,
            EMPLOYEE, policy_id, ORG,
        )
        opening = await conn.fetchval(
            "select hr.leave_ledger_post($1::uuid, $2::uuid, 'opening_balance', 40, "
            "current_date - 30, 'ZZZ L5 PROOF opening balance')",
            EMPLOYEE, policy_id,
        )
        print(f"  policy={policy_id} enrollment={enroll_id}")
        check("opening balance posted", json.loads(opening)["ok"] is True, opening)

        # 🚨 No role and no org held `leave_approve` anywhere in the system before this line.
        # Granted here through the sanctioned door so the flow has somewhere to route.
        # `set_config(..., is_local => true)` is TRANSACTION-scoped, and asyncpg autocommits every
        # statement — so the claim must be set and used inside ONE explicit transaction or
        # `auth.uid()` is null by the time the door reads it.
        async with conn.transaction():
            await conn.execute(
                "select set_config('request.jwt.claims', $1, true)",
                json.dumps({"sub": "87a6e699-3622-4869-8843-d0867456c0dd", "role": "authenticated"}),
            )
            grant = await conn.fetchval(
                "select public.hr_authority_grant('employment', $1, 'leave_approve', 'org', null, "
                "null, '{}'::jsonb, 1, current_date - 1, null, 'ZZZ L5 PROOF', $2::uuid)",
                APPROVER, ORG,
            )
        print(f"  leave_approve grant → {str(grant)[:160]}")

        print("\n=== 1. THE BACK-DATE REFUSAL is real, not documented ===")
        try:
            await conn.fetchval(
                "select hr.leave_ledger_post($1::uuid, $2::uuid, 'adjustment', 1, current_date - 60)",
                EMPLOYEE, policy_id,
            )
            check("a back-dated insert is refused", False, "it was accepted")
        except asyncpg.PostgresError as exc:  # noqa: PERF203
            check(
                "a back-dated insert is refused with LEAVE_LEDGER_BACKDATE",
                "LEAVE_LEDGER_BACKDATE" in str(exc),
                str(exc)[:200],
            )

        print("\n=== 2. Sign the employee in — a REAL user token, not a jwt.claims literal ===")
        r = await http.put(
            f"{base}/auth/v1/admin/users/{EMPLOYEE_USER}",
            headers={"apikey": service, "Authorization": f"Bearer {service}"},
            json={"password": PROOF_PW},
        )
        check("test employee password set", r.status_code < 300, f"{r.status_code} {r.text[:200]}")
        r = await http.post(
            f"{base}/auth/v1/token?grant_type=password",
            headers={"apikey": anon, "Content-Type": "application/json"},
            json={"email": "g2t13.tomas@example.test", "password": PROOF_PW},
        )
        check("employee signed in", r.status_code < 300, f"{r.status_code} {r.text[:200]}")
        if r.status_code >= 300:
            raise SystemExit("cannot continue without a real token")
        emp_token = r.json()["access_token"]

        print("\n=== 3. /hr/me/time-off, as the employee, over PostgREST ===")
        me = await rpc("hr_my_time_off", {"p_employment_id": EMPLOYEE}, emp_token)
        check("hr_my_time_off is reachable as a real user", isinstance(me, dict) and me.get("granted") is True, str(me)[:300])
        pol = None
        if isinstance(me, dict):
            pol = next((p for p in me.get("policies", []) if p.get("policy_id") == policy_id), None)
        check("the proof policy appears with its figures", pol is not None, str(me)[:300])
        if pol:
            check("the five figures are all present",
                  all(k in pol for k in ("accrued_to_date", "used_taken", "approved_upcoming",
                                         "pending_approval", "available")), str(pol)[:300])
            check("available is 40 before anything is booked", float(pol["available"]) == 40.0, str(pol.get("available")))
            check("the balance identity holds", pol.get("identity_holds") is True, str(pol)[:300])
            check("a sentence is generated, not left to the screen", bool(pol.get("sentence")), str(pol.get("sentence")))

        print("\n=== 4. The pre-submit preview states the cost in words ===")
        start = date.today() + timedelta(days=21)
        while start.isoweekday() >= 6:
            start += timedelta(days=1)
        end = start + timedelta(days=1)
        prev = await rpc(
            "hr_leave_request_preview",
            {"p_employment_id": EMPLOYEE, "p_leave_policy_id": policy_id,
             "p_starts_on": start.isoformat(), "p_ends_on": end.isoformat(), "p_day_parts": []},
            emp_token,
        )
        check("preview is reachable", isinstance(prev, dict) and prev.get("granted") is True, str(prev)[:300])
        if isinstance(prev, dict) and prev.get("granted"):
            check("the breakdown sentence names days and hours",
                  "working day" in (prev.get("breakdown_sentence") or ""), str(prev.get("breakdown_sentence")))
            check("the day-by-day breakdown exists",
                  len(prev.get("span", {}).get("days", [])) == (end - start).days + 1,
                  str(prev.get("span", {}).get("days"))[:200])

        print("\n=== 5. Submit — and the ONE engine routes it ===")
        sub = await rpc(
            "hr_leave_request_submit",
            {"p_employment_id": EMPLOYEE, "p_leave_policy_id": policy_id,
             "p_starts_on": start.isoformat(), "p_ends_on": end.isoformat(),
             "p_day_parts": [], "p_reason_note": "ZZZ L5 PROOF"},
            emp_token,
        )
        check("submit is reachable as a real user", isinstance(sub, dict) and sub.get("granted") is True, str(sub)[:400])
        if not (isinstance(sub, dict) and sub.get("granted")):
            raise SystemExit("submit refused; the rest of the chain cannot run")
        request_id = sub["leave_request_id"]
        instance_id = sub["workflow_instance_id"]
        check("the request was NOT rejected at intake", sub.get("rejected_at_intake") is False, str(sub.get("conflict_check"))[:400])
        cc = sub.get("conflict_check") or {}
        check("validation was frozen onto the request", bool(cc.get("evaluated_at")), str(cc)[:200])
        check("the request costs real hours, not zero", float(sub.get("requested_hours") or 0) > 0, str(sub.get("requested_hours")))

        state = await conn.fetchrow(
            "select state, state_reason, current_step_order, payload from hr.workflow_instance where id=$1::uuid",
            instance_id,
        )
        check("the instance is routing or waiting on a human",
              state["state"] in ("routing", "in_progress", "awaiting_decision", "active"),
              f"{state['state']} / {state['state_reason']}")
        check("payload.escalation_required was written by the validator",
              "escalation_required" in json.loads(state["payload"]),
              str(state["payload"])[:200])

        print("\n=== 6. THE ONE INBOX carries it (no second queue was built) ===")
        # The step to decide is the ACTIVE one, never the highest-ordered one: `auto_approve` is
        # skipped (mode 5, off by default) and `hr_review` sits `pending` until its condition is
        # evaluated. An earlier draft took the last step by order and the engine correctly refused
        # it with WF_STEP_CLOSED — the engine was right and the probe was wrong.
        step = await conn.fetchrow(
            "select s.id, s.step_key, s.state from hr.workflow_step s "
            " where s.workflow_instance_id=$1::uuid and s.state = 'active' "
            " order by s.step_order limit 1",
            instance_id,
        )
        check("a workflow step exists for the leave request", step is not None, "no step row")
        if step:
            print(f"  step {step['step_key']} state={step['state']}")

        # the inbox door, read as the APPROVER — a real user again
        r = await http.put(
            f"{base}/auth/v1/admin/users/20149d3f-6572-4263-b43c-7e52f0e42058",
            headers={"apikey": service, "Authorization": f"Bearer {service}"},
            json={"password": PROOF_PW},
        )
        r = await http.post(
            f"{base}/auth/v1/token?grant_type=password",
            headers={"apikey": anon, "Content-Type": "application/json"},
            json={"email": "admin+g2v.priya@admin.com", "password": PROOF_PW},
        )
        check("approver signed in", r.status_code < 300, f"{r.status_code} {r.text[:200]}")
        mgr_token = r.json()["access_token"] if r.status_code < 300 else None

        if mgr_token:
            inbox = await rpc("hr_wf_inbox", {"p_scope": "mine", "p_employment_id": APPROVER,
                                              "p_filters": {}}, mgr_token)
            found = json.dumps(inbox)[:4000]
            check("the leave item reaches the ONE inbox", instance_id in json.dumps(inbox),
                  found[:300])

        print("\n=== 7. The decision, and what apply actually wrote ===")
        if step and mgr_token:
            dec = await rpc("hr_wf_decide", {"p_step_id": str(step["id"]), "p_decision": "approved",
                                             "p_reason": "ZZZ L5 PROOF", "p_payload": {}}, mgr_token)
            check("the approver could decide through the door",
                  isinstance(dec, dict) and dec.get("granted") is True, str(dec)[:400])

        row = await conn.fetchrow(
            "select state, approved_hours, affected_shift_ids from hr.leave_request where id=$1::uuid",
            request_id,
        )
        check("the request is approved", row and row["state"] == "approved",
              str(dict(row)) if row else "no row")

        entries = await conn.fetch(
            "select entry_kind, hours_delta, balance_after, occurred_on, engine_key "
            "  from hr.leave_ledger where leave_policy_id=$1::uuid and employment_id=$2::uuid "
            " order by occurred_on, created_at",
            policy_id, EMPLOYEE,
        )
        usage = [x for x in entries if x["entry_kind"] == "usage"]
        check("EXACTLY ONE usage entry was written at approval", len(usage) == 1,
              f"{len(usage)} usage entries: {[dict(x) for x in entries]}")
        if usage:
            # Compared against the DATABASE's current_date, not Python's. The server runs UTC and
            # this machine does not; an earlier draft compared to `date.today()` and went red at
            # 21:00 local for a row that was correctly dated.
            db_today = await conn.fetchval("select current_date")
            check("the usage entry is dated the approval date, never the leave dates",
                  usage[0]["occurred_on"] == db_today,
                  f"{usage[0]['occurred_on']} vs db current_date {db_today}")
            check("the usage entry is negative", float(usage[0]["hours_delta"]) < 0,
                  str(usage[0]["hours_delta"]))

        snap = await conn.fetchval(
            "select count(*) from hr.calculation_snapshot s join hr.leave_ledger l "
            "  on l.id = s.subject_id and s.subject_type='hr_leave_ledger' "
            " where l.leave_policy_id=$1::uuid",
            policy_id,
        )
        total_entries = await conn.fetchval(
            "select count(*) from hr.leave_ledger where leave_policy_id=$1::uuid", policy_id)
        check("EVERY ledger entry carries a rule door (§12: no unexplained entry)",
              snap == total_entries, f"{snap} snapshots for {total_entries} entries")

        print("\n=== 8. The figures moved, and the identity still holds ===")
        me2 = await rpc("hr_my_time_off", {"p_employment_id": EMPLOYEE}, emp_token)
        pol2 = next((p for p in me2.get("policies", []) if p.get("policy_id") == policy_id), None) \
            if isinstance(me2, dict) else None
        if pol2:
            print(f"  accrued={pol2['accrued_to_date']} used={pol2['used_taken']} "
                  f"upcoming={pol2['approved_upcoming']} pending={pol2['pending_approval']} "
                  f"available={pol2['available']}")
            check("approved-but-not-taken time shows as Approved upcoming",
                  float(pol2["approved_upcoming"]) > 0, str(pol2["approved_upcoming"]))
            check("available EXCLUDES the approved upcoming time (the encumbrance ruling)",
                  float(pol2["available"]) < 40.0, str(pol2["available"]))
            check("the identity still holds after the deduction",
                  pol2.get("identity_holds") is True, str(pol2)[:300])

        print("\n=== 9. The ledger audit view, as the employee ===")
        lv = await rpc("hr_leave_ledger_view",
                       {"p_employment_id": EMPLOYEE, "p_leave_policy_id": policy_id}, emp_token)
        check("the ledger view is reachable", isinstance(lv, dict) and lv.get("granted") is True, str(lv)[:300])
        if isinstance(lv, dict) and lv.get("granted"):
            check("the running-balance verification passes", lv.get("running_balance_ok") is True,
                  f"diverges at {lv.get('divergence_at_entry_id')}")
            kinds = [x["entry_kind"] for x in lv.get("entries", [])]
            sentences = [x["sentence"] for x in lv.get("entries", [])]
            check("no row prints an enum token as its sentence",
                  not any(s in kinds for s in sentences), str(sentences))
            check("every row carries a human sentence", all(bool(s) for s in sentences), str(sentences))

        print("\n=== 10. A PEER holds no path (the positive control that can fail) ===")
        peer = await rpc("hr_my_time_off", {"p_employment_id": APPROVER}, emp_token)
        # Tomas asking for Priya's time off. He is not her, and he holds no working-record grant.
        check("a peer is refused another person's balances",
              isinstance(peer, dict) and peer.get("granted") is False, str(peer)[:300])
        # …and the control can fail: the SAME call for HIS OWN record must succeed, which §3 proved.
        check("the control is meaningful — the same door grants his own record",
              isinstance(me, dict) and me.get("granted") is True, "his own read was refused too")

    finally:
        if "--keep" not in sys.argv and policy_id:
            print("\n=== cleanup ===")
            await conn.execute(
                "alter table hr.leave_ledger disable trigger _zz_leave_ledger_no_delete")
            await conn.execute(
                "do $$ begin perform hr.arm_write(); "
                "delete from hr.leave_ledger where leave_policy_id = $tok$" + policy_id + "$tok$::uuid; "
                "end $$;")
            await conn.execute(
                "alter table hr.leave_ledger enable trigger _zz_leave_ledger_no_delete")
            for tbl in ("leave_request", "leave_enrollment", "leave_policy"):
                col = "id" if tbl == "leave_policy" else "leave_policy_id"
                await conn.execute(
                    f"do $$ begin perform hr.arm_write(); "
                    f"delete from hr.{tbl} where {col} = $tok${policy_id}$tok$::uuid; end $$;")
            print("  proof rows removed (pass --keep to leave them for a browser walk)")
        await http.aclose()
        await conn.close()

    print(f"\n==== {GREEN} PASS / {len(RED)} RED ====")
    for r_ in RED:
        print(f"  RED: {r_}")
    sys.exit(1 if RED else 0)


asyncio.run(main())
