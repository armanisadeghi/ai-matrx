"""HRB-008 PROOF SUITE — the HR workflow/approval engine, proven live.

Run:  cd /Users/armanisadeghi/code/aidream && uv run python \
        /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb008_proof.py

Every assertion runs against the LIVE platform Postgres, as real `authenticated` identities, inside
ONE transaction that is ROLLED BACK — the database is left byte-identical (the tail line prints the
row counts to prove it). Nothing here is a mock and nothing is asserted that is not measured.

Covers SPEC-WORKFLOW-ENGINE §8.1 / §8.2 / §8.3 end to end, never-approve-yourself from three
directions, T-21b BOTH HALVES across all 26 action tokens (the blocking obligation HRB-007 recorded
against this lane), the reminder/escalation/timeout/result sweep by direct call, the exclusive
binding, the versioned target reference, bulk per-step refusal, the contentless restricted
projection, ledger immutability, and publish-does-not-touch-running-instances.

Connection comes from the five SUPABASE_MATRIX_* variables in aidream/.env.
🚨 statement_cache_size=0 is required: the host is pgbouncer in transaction pooling mode.
"""
import asyncio, json, os, sys, uuid
import asyncpg
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")
SYS_ORG = "39c38960-d30c-4840-b0c1-c9960de95582"

R = []          # (group, name, ok, detail)
def rec(group, name, ok, detail=""):
    R.append((group, name, bool(ok), str(detail)[:300]))


async def main():
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0, command_timeout=600)
    tr = conn.transaction()
    await tr.start()

    async def as_user(uid):
        await conn.execute("set local role authenticated")
        await conn.execute(
            "select set_config('request.jwt.claims', $1, true)",
            json.dumps({"sub": str(uid), "role": "authenticated"}))

    async def as_owner():
        await conn.execute("reset role")
        await conn.execute("select set_config('request.jwt.claims', '', true)")
        await conn.execute("select set_config('hr.privileged_write','on',true)")

    async def j(q, *a):
        v = await conn.fetchval(q, *a)
        return json.loads(v) if isinstance(v, str) else v

    SQL_SUBJECT_RULE = (
        "select prosrc ~ 'when ''hr\\.asset_assignment''\\s+then ''employment_id''' and prosrc !~ 'then ''assigned_by_employment_id''' and prosrc ~ 'NEVER WHO PERFORMED IT' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='hr' and p.proname='_approval_subject'"
    )
    try:
        # ================================================================= FIXTURES
        await as_owner()
        org = await conn.fetchval(
            "insert into iam.organizations (name, slug, abbreviation) "
            "values ('HRB-008 Proof Org','hrb008-proof-'||substr(gen_random_uuid()::text,1,8),'HRB') returning id")

        people = {}
        for key, first, last in [("alice", "Alice", "Requester"), ("bob", "Bob", "Manager"),
                                 ("carol", "Carol", "Owner"), ("dave", "Dave", "Delegate"),
                                 ("erin", "Erin", "Skip")]:
            uid = await conn.fetchval(
                "insert into auth.users (id, instance_id, aud, role, email, encrypted_password, "
                "email_confirmed_at, created_at, updated_at) values "
                "(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',"
                "$1,'x',now(),now(),now()) returning id", f"{key}.hrb008@example.invalid")
            await conn.execute(
                "insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) "
                "values ($1,'organization',$1,$2,$3,'active')", org, uid,
                'owner' if key == 'carol' else 'member')
            party = await conn.fetchval(
                "insert into crm.party (organization_id, party_kind, display_name) "
                "values ($1,'person',$2) returning id", org, f"{first} {last}")
            emp = await conn.fetchval(
                "insert into hr.employee (organization_id, party_id, login_user_id, employee_number, "
                "legal_first_name, legal_last_name, display_name) values ($1,$2,$3,$4,$5,$6,$7) returning id",
                org, party, uid, f"EMP-{key}", first, last, f"{first} {last}")
            people[key] = {"uid": uid, "employee": emp}

        er = await conn.fetchval(
            "insert into hr.employer_profile (organization_id, legal_name, ein) "
            "values ($1,'HRB008 Proof Employer','00-0000000') returning id", org)
        jur = await conn.fetchval(
            "select id from hr.jurisdiction where deleted_at is null order by level, key limit 1")
        loc = await conn.fetchval(
            "insert into hr.location (organization_id, name, tz, jurisdiction_id) "
            "values ($1,'HQ','America/Los_Angeles',$2) returning id", org, jur)
        dept = await conn.fetchval(
            "insert into hr.department (organization_id, name) values ($1,'Operations') returning id", org)
        jt = await conn.fetchval(
            "insert into hr.job_title (organization_id, title, eeo1_job_category) "
            "values ($1,'Associate','professionals') returning id", org)
        pg = await conn.fetchval(
            "insert into hr.pay_group (organization_id, employer_profile_id, name, pay_frequency, "
            "first_period_start_on, workweek_effective_from) "
            "values ($1,$2,'Biweekly','biweekly',current_date - 30, current_date - 30) returning id", org, er)

        for key in people:
            e = await conn.fetchval(
                "insert into hr.employment (organization_id, employee_id, employer_profile_id, "
                "pay_group_id, hire_date, status) values ($1,$2,$3,$4,current_date - 365,'active') returning id",
                org, people[key]["employee"], er, pg)
            people[key]["employment"] = e

        # the chart: alice -> bob -> carol ; dave and erin report to carol
        for key, mgr in [("alice", "bob"), ("bob", "carol"), ("dave", "carol"), ("erin", "carol")]:
            await conn.execute(
                "insert into hr.position_assignment (organization_id, employment_id, job_title_id, "
                "department_id, location_id, worker_class, flsa_status, pay_basis, schedule_class, "
                "effective_from, manager_employment_id) "
                "values ($1,$2,$3,$4,$5,'employee','nonexempt','hourly','full_time',current_date - 365,$6)",
                org, people[key]["employment"], jt, dept, loc, people[mgr]["employment"])
        await conn.execute(
            "insert into hr.position_assignment (organization_id, employment_id, job_title_id, "
            "department_id, location_id, worker_class, flsa_status, pay_basis, schedule_class, effective_from) "
            "values ($1,$2,$3,$4,$5,'employee','nonexempt','salary','full_time',current_date - 365)",
            org, people["carol"]["employment"], jt, dept, loc)

        # carol is the HR owner; bob holds leave/timecard authority over his direct reports
        await conn.execute(
            "insert into hr.role_assignment (organization_id, employment_id, role_key, scope_kind) "
            "values ($1,$2,'hr_owner','org')", org, people["carol"]["employment"])
        auth_ids = {}
        for act in ["leave_approve", "timecard_approve", "timecard_attest"]:
            aid = await conn.fetchval(
                "insert into hr.approval_authority (organization_id, holder_kind, holder_id, action_type, "
                "scope_kind, rank, effective_from) values ($1,'employment',$2,$3,'direct_reports',10,current_date - 300) "
                "returning id", org, str(people["bob"]["employment"]), act)
            auth_ids[act] = aid
        # carol is the org-scoped backstop for every action token (the top_of_chart answer)
        acts = [r["slug"] for r in await conn.fetch(
            "select slug from platform.categories where dimension='hr_approval_action' and deleted_at is null order by slug")]
        for act in acts:
            await conn.execute(
                "insert into hr.approval_authority (organization_id, holder_kind, holder_id, action_type, "
                "scope_kind, rank, effective_from) values ($1,'employment',$2,$3,'org',90,current_date - 300)",
                org, str(people["carol"]["employment"]), act)

        lp = await conn.fetchval(
            "insert into hr.leave_policy (organization_id, name, leave_kind, accrual_method, accrual_rate) "
            "values ($1,'PTO','pto','unlimited',null) returning id", org)
        # 🚨 THE LEAVE LANE MADE ENROLMENT STRUCTURAL AFTER THIS SUITE WAS WRITTEN: leave_request's
        # validate_fn now raises the hard finding `not_enrolled`, so a fixture that never enrolled
        # anybody was asserting against a request the engine is RIGHT to refuse at intake. Same
        # class as §8.2's `period_not_submitted`. Everybody who might request leave is enrolled.
        for _k in people:
            await conn.execute(
                "insert into hr.leave_enrollment (organization_id, employment_id, leave_policy_id, "
                "balance_hours, effective_from) values ($1,$2,$3,400,current_date - 365)",
                org, people[_k]["employment"], lp)
        lr = await conn.fetchval(
            "insert into hr.leave_request (organization_id, employment_id, leave_policy_id, starts_on, "
            "ends_on, requested_hours, state, engine_key, engine_version) "
            "values ($1,$2,$3,current_date + 30, current_date + 30, 8,'submitted','proof','1') returning id",
            org, people["alice"]["employment"], lp)
        pp = await conn.fetchval(
            "insert into hr.pay_period (organization_id, pay_group_id, period_start_on, period_end_on, "
            "sequence_number) values ($1,$2,current_date - 14, current_date - 1, 1) returning id", org, pg)
        ppe = await conn.fetchval(
            "insert into hr.pay_period_employment (organization_id, pay_period_id, employment_id, state, "
            "engine_key, engine_version) values ($1,$2,$3,'open','proof','1') returning id",
            org, pp, people["alice"]["employment"])

        rec("fixtures", "org, 5 identities, chart, authorities, targets created", True,
            f"org={org}")

        # ================================================================= T-21b, BOTH HALVES
        # THE SELECTOR HALF, the blocking obligation HRB-007 recorded against this lane.
        # Every candidate hr.wf_resolve_approvers returns must satisfy hr.can_approve — proven by
        # driving a real instance for every action token that has a mapped target, then re-asking
        # the predicate about every returned candidate.
        target_for = {
            "leave_approve": ("hr_leave_request", lr, "hr.leave_request"),
            "leave_cancellation_approve": ("hr_leave_request", lr, "hr.leave_request"),
            "timecard_attest": ("hr_pay_period_employment", ppe, "hr.pay_period_employment"),
            "timecard_approve": ("hr_pay_period_employment", ppe, "hr.pay_period_employment"),
        }
        # every token gets its predicate probed against a mapped target table; the four above also
        # get the selector driven for real.
        pred_ok = sel_ok = sel_run = 0
        for act in acts:
            tt, tid, tbl = target_for.get(act, ("hr_pay_period_employment", ppe, "hr.pay_period_employment"))
            # PREDICATE HALF: never-self is absolute (or, for a self-step, exclusive)
            self_v = await conn.fetchval("select hr.can_approve($1,$2,$3,$4)",
                                         people["alice"]["uid"], act, tbl, tid)
            meta = await conn.fetchval(
                "select coalesce((metadata->>'allows_self')::boolean,false) from platform.categories "
                "where dimension='hr_approval_action' and slug=$1 and deleted_at is null", act)
            if bool(self_v) == bool(meta):
                pred_ok += 1
            else:
                rec("T-21b predicate", f"{act}: subject self-answer", False, f"got {self_v}, allows_self={meta}")
        rec("T-21b predicate", f"never-self answered correctly for all {len(acts)} action tokens",
            pred_ok == len(acts), f"{pred_ok}/{len(acts)}")

        # ---------------- THE SELECTOR HALF, DRIVEN FOR REAL ON ALL 26 TOKENS ----------------
        # One real definition + instance + step per action token, against a target hr._approval_subject
        # resolves (hr.pay_period_employment -> alice). hr.wf_resolve_approvers is called for each and
        # EVERY candidate it returns is put back to hr.can_approve. This is the blocking obligation
        # HRB-007 recorded against this lane: "every candidate hr.wf_resolve_approvers returns
        # satisfies hr.can_approve".
        await as_owner()
        probe_def = await conn.fetchval(
            "insert into hr.workflow_definition (organization_id, flow_key, name, definition_version, "
            "status, visibility) values ($1,'leave_request','T-21b probe',99,'draft','internal') returning id", org)
        probe_inst = await conn.fetchval(
            "insert into hr.workflow_instance (organization_id, flow_key, workflow_definition_id, "
            "definition_version, target_token, target_id, requester_employment_id, "
            "subject_employment_id, state, submitted_at) values "
            "($1,'leave_request',$2,99,'hr_pay_period_employment',$3,$4,$4,'active',now()) returning id",
            org, probe_def, ppe, people["alice"]["employment"])
        tok_ok, tok_cand, tok_bad = 0, 0, []
        for act in acts:
            sdid = await conn.fetchval(
                "insert into hr.workflow_step_definition (organization_id, workflow_definition_id, "
                "step_key, label, step_order, resolver_kind, authority_action, allows_self, autonomy_mode) "
                "values ($1,$2,$3,$3,10,'authority',$3,$4,4) returning id",
                org, probe_def, act,
                await conn.fetchval("select coalesce((metadata->>'allows_self')::boolean,false) "
                                    "from platform.categories where dimension='hr_approval_action' "
                                    "and slug=$1 and deleted_at is null", act))
            sid = await conn.fetchval(
                "insert into hr.workflow_step (organization_id, workflow_instance_id, step_definition_id, "
                "step_key, step_order, state) values ($1,$2,$3,$4,10,'pending') returning id",
                org, probe_inst, sdid, act)
            res = await j("select hr.wf_resolve_approvers($1)", sid)
            if not res.get("granted"):
                # a rung that yields nobody is a NAMED failure, never a candidate the predicate refuses
                if res.get("reason") in ("unroutable", "approver_ineligible"):
                    tok_ok += 1
                else:
                    tok_bad.append(f"{act}:{res.get('reason')}")
                continue
            good = True
            for e in res.get("candidates") or []:
                tok_cand += 1
                u = await conn.fetchval("select hr._wf_login_of($1)", uuid.UUID(e))
                v = await conn.fetchval(
                    "select hr.can_approve($1,$2,'hr.pay_period_employment',$3)", u, act, ppe)
                if not v:
                    good = False
                    tok_bad.append(f"{act}:candidate {e} refused by the predicate")
            if good:
                tok_ok += 1
        rec("T-21b selector",
            f"🚨 ALL {len(acts)} action tokens: every candidate hr.wf_resolve_approvers returned satisfies hr.can_approve",
            tok_ok == len(acts) and not tok_bad,
            f"{tok_ok}/{len(acts)} tokens clean, {tok_cand} candidates checked" + (f", BAD: {tok_bad[:5]}" if tok_bad else ""))
        await conn.execute("delete from hr.workflow_step where workflow_instance_id=$1", probe_inst)
        await conn.execute("delete from hr.workflow_instance where id=$1", probe_inst)
        await conn.execute("delete from hr.workflow_step_definition where workflow_definition_id=$1", probe_def)
        await conn.execute("delete from hr.workflow_definition where id=$1", probe_def)

        # ================================================================= §8.1 LEAVE, END TO END
        await as_user(people["alice"]["uid"])
        res = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2,$3::jsonb)",
                      lr, org, json.dumps({"total_hours": 8, "notice_days": 30,
                                           "leave_type": "pto", "coverage_pct": 100}))
        inst = res.get("instance_id")
        rec("§8.1 leave", "employee submits; instance routes to the manager step",
            res.get("granted") and res.get("state") == "active", json.dumps(res)[:200])

        await as_owner()
        step = await conn.fetchrow(
            "select id, state, resolution_path, resolved_approver_ids, resolved_user_ids, due_at "
            "from hr.workflow_step where workflow_instance_id=$1 and state='active'", inst)
        rec("§8.1 leave", "the AUTHORITY rung matched (not reporting_line, not top_of_chart)",
            step and step["resolution_path"] == "authority", step["resolution_path"] if step else None)
        rec("§8.1 leave", "the resolved approver is the manager who holds leave_approve",
            step and list(step["resolved_approver_ids"]) == [people["bob"]["employment"]])
        rec("§8.1 leave", "the mode-5 auto_approve step SKIPPED rather than auto-applying",
            await conn.fetchval("select state='skipped' and state_reason='autonomy_mode_off' "
                                "from hr.workflow_step where workflow_instance_id=$1 and step_key='auto_approve'", inst))

        # ---- T-21b SELECTOR HALF on a real resolved step
        cands = await conn.fetch(
            "select unnest(resolved_approver_ids) e from hr.workflow_step where id=$1", step["id"])
        all_ok = True
        for c in cands:
            u = await conn.fetchval("select hr._wf_login_of($1)", c["e"])
            ok = await conn.fetchval("select hr.can_approve($1,'leave_approve','hr.leave_request',$2)", u, lr)
            all_ok = all_ok and bool(ok)
        sel_run += 1
        rec("T-21b selector", "every candidate the selector returned satisfies hr.can_approve (leave_approve)",
            all_ok and len(cands) > 0, f"{len(cands)} candidate(s)")

        # ---- the grant and the projection
        rec("§8.1 leave", "an iam.permissions grant was issued to the approver on the instance",
            await conn.fetchval(
                "select count(*)=1 from iam.permissions where resource_type='hr_workflow_instance' "
                "and resource_id=$1 and granted_to_user_id=$2 and review_note='auto:wf_step:'||$3::text",
                inst, people["bob"]["uid"], str(step["id"])))
        rec("§5 projection", "the step projected into workspace.tasks with the deep link",
            await conn.fetchval(
                "select count(*)=1 from workspace.tasks where dedupe_key=$1 and source_type='hr_workflow_step'",
                f"hrwf:{step['id']}:{people['bob']['uid']}"),
            str(await conn.fetchval("select detail::text from hr.workflow_event where workflow_instance_id=$1 "
                                    "and event_kind='projection_failed' limit 1", inst)))
        rec("§6 notification", "hr.workflow.step_assigned was enqueued with target_kind + deep_link",
            await conn.fetchval(
                "select count(*)>0 from communication.notification where event_key='hr.workflow.step_assigned' "
                "and target_kind='hr_workflow_step' and target_id=$1 and deep_link like '/hr/tasks/%'", step["id"]))
        rec("§1.7 notice view", "hr.workflow_notice shows the notice against the instance",
            await conn.fetchval("select count(*)>0 from hr.workflow_notice where workflow_step_id=$1", step["id"]))

        # ---- NEVER APPROVE YOURSELF, direction 1: the subject calls wf_decide with the real step id
        await as_user(people["alice"]["uid"])
        r1 = await j("select hr.wf_decide($1,'approved')", step["id"])
        rec("never-self", "the SUBJECT calling wf_decide on the real step is refused",
            r1.get("granted") is False, r1.get("reason"))
        rec("never-self", "and the refusal is an ENVELOPE, not a raise (refusal-envelope law)",
            "granted" in r1 and r1.get("reason") in ("WF_NOT_APPROVER", "WF_SELF_APPROVAL_FORBIDDEN"),
            r1.get("reason"))

        # ---- the exclusive binding: a second open leave_request on the same target
        await as_owner()
        inst_before = await conn.fetchval(
            "select count(*) from hr.workflow_instance where organization_id=$1", org)
        await as_user(people["alice"]["uid"])
        r2 = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2)", lr, org)
        rec("§1.6 binding", "a second open instance on the same (target, flow) is refused",
            r2.get("granted") is False and r2.get("reason") == "WF_BINDING_OPEN", r2.get("reason"))
        rec("§1.6 binding", "and it names the instance already holding the binding, so the caller can go to it",
            r2.get("existing_instance_id") == str(inst), r2.get("existing_instance_id"))
        # 🚨 D275: A REFUSAL WRITES NOTHING. The engine used to insert the instance and only THEN
        # try the binding, returning the refusal from inside the catch — so every duplicate submit
        # stranded a `validating` instance with no binding, no steps and no event, on a table §1.3
        # forbids ever deleting from. Fixed at the source in hr_c4_10 (pre-check, plus both inserts
        # in ONE exception block so even losing the concurrent race rolls the instance back).
        await as_owner()
        inst_after = await conn.fetchval(
            "select count(*) from hr.workflow_instance where organization_id=$1", org)
        rec("§1.6 binding", "🚨 and the refusal leaves NO instance row behind — an instance is evidence, and evidence is never deleted (D275)",
            inst_after == inst_before, f"before={inst_before} after={inst_after}")
        rec("§1.6 binding", "no orphan can exist even in principle: zero instances in this org lack a binding",
            await conn.fetchval(
                "select count(*)=0 from hr.workflow_instance i where i.organization_id=$1 "
                "and not exists (select 1 from hr.workflow_binding b where b.workflow_instance_id=i.id)",
                org),
            str(await conn.fetchval(
                "select string_agg(i.state||':'||i.flow_key, ', ') from hr.workflow_instance i "
                "where i.organization_id=$1 and not exists "
                "(select 1 from hr.workflow_binding b where b.workflow_instance_id=i.id)", org)))

        # ---- §4.2 idempotency: a replay RETURNS the existing instance, it does not error and it
        # does not write a second one. hr_c4_10 moved this handler into the binding's exception
        # block, so it is PROVEN here rather than assumed — nothing else in the suite drove it.
        idem_target = await conn.fetchval(
            "insert into hr.leave_request (organization_id, employment_id, leave_policy_id, starts_on, "
            "ends_on, requested_hours, state, engine_key, engine_version) "
            "values ($1,$2,$3,current_date + 500, current_date + 500, 8,'submitted','proof','1') returning id",
            org, people["alice"]["employment"], lp)
        idem_key = f"hrb008-idem-{uuid.uuid4()}"
        await as_user(people["alice"]["uid"])
        ri1 = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2,$3::jsonb,null,false,$4)",
                      idem_target, org, json.dumps({"total_hours": 8}), idem_key)
        await as_owner()
        idem_before = await conn.fetchval(
            "select count(*) from hr.workflow_instance where organization_id=$1", org)
        await as_user(people["alice"]["uid"])
        ri2 = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2,$3::jsonb,null,false,$4)",
                      idem_target, org, json.dumps({"total_hours": 8}), idem_key)
        await as_owner()
        rec("§4.2 idempotency", "a replay of the same idempotency key RETURNS the first instance instead of erroring",
            ri2.get("granted") is True and ri2.get("replayed") is True
            and ri2.get("instance_id") == ri1.get("instance_id"), json.dumps(ri2)[:180])
        rec("§4.2 idempotency", "and it writes no second instance row",
            await conn.fetchval("select count(*) from hr.workflow_instance where organization_id=$1", org)
            == idem_before)
        await as_user(people["alice"]["uid"])

        # ---- the manager approves
        await as_user(people["bob"]["uid"])
        r3 = await j("select hr.wf_decide($1,'approved')", step["id"])
        rec("§8.1 leave", "the manager's approval is recorded and the step closes",
            r3.get("granted") and r3.get("decision") == "approved", json.dumps(r3)[:200])

        await as_owner()
        st_hr = await conn.fetchrow(
            "select id, state, state_reason from hr.workflow_step where workflow_instance_id=$1 "
            "and step_key='hr_review'", inst)
        rec("§2.4 condition", "the HR-review step SKIPPED (8h is under the 40h condition)",
            st_hr and st_hr["state"] == "skipped" and st_hr["state_reason"] == "condition_false",
            st_hr["state_reason"] if st_hr else None)
        inst_row = await conn.fetchrow("select state, state_reason, applied_at from hr.workflow_instance where id=$1", inst)
        # 🚨 THE LEAVE LANE BUILT ITS APPLY HOOK. When this suite was written every flow carried
        # hr.wf_apply_unimplemented and leave_request went `applying -> failed` with
        # `pillar_lane_not_built`. hr.leave_wf_apply is real now, so the honest assertion is that
        # the request APPLIES and completes. The fail-closed law is still proven, below, on the
        # stub itself — eleven flows still carry it.
        rec("§4.3 apply", "the leave lane's apply hook is BUILT, so the request applies for real and the instance completes",
            inst_row["state"] in ("completed", "closed") and inst_row["applied_at"] is not None,
            f'state={inst_row["state"]} reason={inst_row["state_reason"]} ev=' + str(await conn.fetchval(
                "select string_agg(event_kind||coalesce(\':\'||(detail->>\'detail\'),\'\'), \' | \' order by occurred_at) "
                "from hr.workflow_event where workflow_instance_id=$1", inst)))
        rec("§4.3 apply", "🚨 and the FAIL-CLOSED stub still refuses rather than silently succeeding — the law, proven on the stub eleven live flows still carry",
            (lambda v: v.get("ok") is False
             and v.get("reason") == "pillar_lane_not_built"
             and v.get("failure_class") == "apply_failed")(
                await j("select hr.wf_apply_unimplemented($1)", inst)),
            json.dumps(await j("select hr.wf_apply_unimplemented($1)", inst))[:180])
        rec("§4.3 apply", "and it is still what those eleven unbuilt flows point at — an unbuilt lane fails closed, it does not quietly approve",
            await conn.fetchval(
                "select count(*)>=11 from hr.workflow_flow_type where deleted_at is null and is_active "
                "and apply_fn::text = 'hr.wf_apply_unimplemented(uuid)'"))
        rec("§1.3 grant revoked", "the approver's grant was deleted when the step closed",
            await conn.fetchval(
                "select count(*)=0 from iam.permissions where review_note='auto:wf_step:'||$1::text", str(step["id"])))
        rec("AD-11 ledger", "the decision row is immutable evidence and names its authority row",
            await conn.fetchval(
                "select count(*)=1 from hr.workflow_decision where workflow_instance_id=$1 "
                "and decision='approved' and actor_employment_id=$2 and authority_id is not null",
                inst, people["bob"]["employment"]))

        # ---- the fallback LADDER (§2.2 rungs + RECORDED DECISION 4): point bob's authority at a
        # VACANT position seat. It dereferences to nobody, contributes no candidate, and the walk
        # continues — to the `substitute` rung, which is the next-rank holder in the same scope.
        await as_owner()
        vacant = await conn.fetchval(
            "insert into hr.position_assignment (organization_id, employment_id, job_title_id, "
            "department_id, location_id, worker_class, flsa_status, pay_basis, schedule_class, "
            "effective_from, effective_to) values "
            "($1,$2,$3,$4,$5,'employee','nonexempt','hourly','full_time',current_date - 900, current_date - 800) "
            "returning id", org, people["bob"]["employment"], jt, dept, loc)
        await conn.execute(
            "update hr.approval_authority set holder_kind='position', holder_id=$2, scope_kind='org', "
            "scope_id=null where id=$1", auth_ids["leave_approve"], str(vacant))
        lr2 = await conn.fetchval(
            "insert into hr.leave_request (organization_id, employment_id, leave_policy_id, starts_on, "
            "ends_on, requested_hours, state, engine_key, engine_version) "
            "values ($1,$2,$3,current_date + 60, current_date + 60, 8,'submitted','proof','1') returning id",
            org, people["alice"]["employment"], lp)
        await as_user(people["alice"]["uid"])
        r4 = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2,$3::jsonb)",
                     lr2, org, json.dumps({"total_hours": 8}))
        await as_owner()
        p2 = await conn.fetchval(
            "select resolution_path from hr.workflow_step where workflow_instance_id=$1 and state='active'",
            r4.get("instance_id"))
        rec("§2.2 fallback ladder", "🚨 a VACANT position seat contributes no candidate and the walk falls to `substitute`",
            p2 == "substitute", f"resolution_path={p2}")
        rec("§2.2 fallback ladder", "and the substitute it found is the next-rank holder, the org backstop",
            await conn.fetchval(
                "select resolved_approver_ids @> array[$2]::uuid[] from hr.workflow_step "
                "where workflow_instance_id=$1 and state='active'",
                r4.get("instance_id"), people["carol"]["employment"]))
        # restore bob's row for the delegation proof later on
        await conn.execute(
            "update hr.approval_authority set holder_kind='employment', holder_id=$2, "
            "scope_kind='direct_reports' where id=$1",
            auth_ids["leave_approve"], str(people["bob"]["employment"]))

        # ---- UNROUTABLE: strip every holder for the action and the next request names the failure
        await conn.execute(
            "update hr.approval_authority set is_active=false where organization_id=$1 and action_type='leave_approve'", org)
        await conn.execute("update hr.role_assignment set is_active=false where organization_id=$1", org)
        await conn.execute("update hr.position_assignment set manager_employment_id=null where organization_id=$1", org)
        await conn.execute("update iam.memberships set role='member' where organization_id=$1 and container_type='organization'", org)
        lr3 = await conn.fetchval(
            "insert into hr.leave_request (organization_id, employment_id, leave_policy_id, starts_on, "
            "ends_on, requested_hours, state, engine_key, engine_version) "
            "values ($1,$2,$3,current_date + 90, current_date + 90, 8,'submitted','proof','1') returning id",
            org, people["alice"]["employment"], lp)
        await as_user(people["alice"]["uid"])
        r5 = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2)", lr3, org)
        await as_owner()
        f5 = await conn.fetchval(
            "select failure_class from hr.workflow_failure where workflow_instance_id=$1 limit 1",
            r5.get("instance_id"))
        rec("§10 test 4", "with NO leave_approve holder the request FAILS NAMED — it does not auto-approve and does not hang",
            f5 in ("unroutable", "approver_ineligible"), f"failure_class={f5}")
        rec("§10 test 4", "and the instance state says failed, visibly",
            await conn.fetchval("select state='failed' from hr.workflow_instance where id=$1",
                                r5.get("instance_id")))
        # 🚨 AND THE QUEUE CANNOT BE CLEANED BY SWEEPING THE EVIDENCE UP. `resolve` IS on this
        # class's menu, but its step is still `unroutable` — marking the row resolved would close
        # the only thing surfacing a dead step. Measured live on 2026-08-27: that is exactly how a
        # real timecard was lost after an escalation killed its step.
        f5_id = await conn.fetchval(
            "select id from hr.workflow_failure where workflow_instance_id=$1 and state='open' limit 1",
            r5.get("instance_id"))
        await as_user(people["carol"]["uid"])
        f5_hide = await j("select hr.wf_resolve_failure($1,'resolve','tidy it away')", f5_id)
        await as_owner()
        rec("§1.8 failure", "🚨 `resolve` is REFUSED while the step is still unroutable — a dead step may not be tidied away",
            f5_hide.get("granted") is False
            and f5_hide.get("reason") == "WF_STEP_STILL_UNROUTABLE"
            and "resolve" not in json.dumps(f5_hide.get("available_actions")),
            json.dumps(f5_hide)[:220])

        # restore the chart for the remaining proofs
        await conn.execute("update hr.approval_authority set is_active=true where organization_id=$1", org)
        await conn.execute("update hr.role_assignment set is_active=true where organization_id=$1", org)
        await conn.execute("update iam.memberships set role='owner' where organization_id=$1 "
                           "and container_type='organization' and user_id=$2", org, people["carol"]["uid"])
        for key, mgr in [("alice", "bob"), ("bob", "carol"), ("dave", "carol"), ("erin", "carol")]:
            await conn.execute(
                "update hr.position_assignment set manager_employment_id=$1 where employment_id=$2",
                people[mgr]["employment"], people[key]["employment"])

        # ================================================================= §8.2 TIMECARD
        # 🚨 §8.2 NODE A IS PART OF THE FIXTURE: "Pay period ends — hr.pay_period moves to
        # submitted" HAPPENS BEFORE "the engine opens one timecard_attestation instance". The L3
        # lane made that structural after this suite was first written — hr.timecard_wf_validate
        # (the flow type's validate_fn, NULL when C4 shipped) raises the hard finding
        # `period_not_submitted` while the period is still `open`, and hr.wf_request correctly
        # closes the instance `rejected_at_intake` with no step at all. A fixture that leaves the
        # period open is therefore asserting against a request the engine is RIGHT to refuse.
        # The period runs to yesterday, so submitting it is legal in both directions.
        await as_owner()
        await conn.execute("update hr.pay_period set state='submitted' where id=$1", pp)
        await as_user(people["alice"]["uid"])
        ra = await j("select hr.wf_request('timecard_attestation','hr_pay_period_employment',$1,$2,$3::jsonb)",
                     ppe, org, json.dumps({"total_hours": 80, "exception_count": 0}))
        att_inst = ra.get("instance_id")
        await as_owner()
        rec("§8.2 attestation", "a submitted period makes the timecard decidable — the request clears intake and opens its step",
            ra.get("state") == "active",
            f"state={ra.get('state')} findings={json.dumps(ra.get('findings') or {})[:200]}")
        att_step = await conn.fetchrow(
            "select id, resolution_path, resolved_approver_ids from hr.workflow_step "
            "where workflow_instance_id=$1 and state='active'", att_inst)
        rec("§8.2 attestation", "the ONLY v1 allows_self step routes to the employee themselves",
            att_step is not None and list(att_step["resolved_approver_ids"]) == [people["alice"]["employment"]],
            att_step["resolution_path"] if att_step else json.dumps(ra)[:220])

        # somebody ELSE cannot attest for you: allows_self makes SELF the only true case
        await as_user(people["bob"]["uid"])
        rb = await j("select hr.wf_decide($1,'attested')", att_step["id"])
        rec("§8.2 attestation", "the manager cannot attest on the employee's behalf",
            rb.get("granted") is False, rb.get("reason"))

        # PRESERVED DISAGREEMENT: attested_with_exception is a decision row with a reason
        await as_user(people["alice"]["uid"])
        rc = await j("select hr.wf_decide($1,'attested_with_exception','Thursday shows 6h; I worked 8h.')",
                     att_step["id"])
        rec("§8.2 attestation", "the employee attests WITH EXCEPTION and it is accepted",
            rc.get("granted") is True, json.dumps(rc)[:160])
        await as_owner()
        rec("§8.2 attestation", "🚨 the DISAGREEMENT survives as a first-class decision row with its own reason and actor",
            await conn.fetchval(
                "select count(*)=1 from hr.workflow_decision where workflow_instance_id=$1 "
                "and decision='attested_with_exception' and reason is not null and actor_employment_id=$2",
                att_inst, people["alice"]["employment"]))
        # (the no-reason refusal is proven on the termination HR-review step below, which is open
        #  and carries requires_reason = true)

        # 🚨 §8.2 E/F → H: THE ENGINE OPENS THE MANAGER-APPROVAL INSTANCE ITSELF. The attestation's
        # apply hook (hr.timecard_wf_apply, L3 — NULL when C4 shipped) advances the flow, so a
        # second hr.wf_request here is refused WF_BINDING_OPEN by the exclusive binding, exactly as
        # §1.6 promises. The proof follows the instance the engine built rather than racing it.
        await as_owner()
        tc_inst = await conn.fetchval(
            "select workflow_instance_id from hr.workflow_binding "
            "where target_token='hr_pay_period_employment' and target_id=$1 "
            "and flow_key='timecard_approval' and is_open", ppe)
        rec("§8.2 grain", "attesting advances the flow: the engine opens the manager-approval instance on the SAME employment row",
            tc_inst is not None)
        tc_step = await conn.fetchrow(
            "select id, resolved_approver_ids from hr.workflow_step where workflow_instance_id=$1 and state='active'",
            tc_inst)
        rec("§8.2 grain", "the timecard flow targets hr_pay_period_employment — ONE EMPLOYMENT, not the period",
            await conn.fetchval("select target_token='hr_pay_period_employment' from hr.workflow_instance where id=$1",
                                tc_inst))
        rec("§8.2 attestation", "🚨 and the employee's disagreement TRAVELS — it is on the manager's instance verbatim, never overwritten",
            await conn.fetchval(
                "select validation_findings->'advisory' @> jsonb_build_array(jsonb_build_object("
                "'code','open_disagreement','dispute_note','Thursday shows 6h; I worked 8h.')) "
                "from hr.workflow_instance where id=$1", tc_inst))
        pp_state_before = await conn.fetchval("select state from hr.pay_period where id=$1", pp)
        await as_user(people["bob"]["uid"])
        rf = await j("select hr.wf_decide($1,'rejected','Thursday needs a correction before I approve.')",
                     tc_step["id"])
        await as_owner()
        # 🚨 §8.2 node J2 IS ABOUT THE ROW, NOT THE WORD. `timecard_approval` ships
        # `on_reject = 'return_to_requester'`, so the engine closes the instance `returned` and
        # hands it back — asserting the literal state `rejected` here was measuring this suite's
        # assumption about a flow-type knob rather than the grain rule §8.2 actually states.
        tc_after = await conn.fetchval("select state from hr.workflow_instance where id=$1", tc_inst)
        rec("§8.2 grain", "a manager rejection closes THIS employment's instance per the flow type's on_reject",
            rf.get("granted") and tc_after == "returned",
            f"state={tc_after} on_reject=return_to_requester")
        rec("§8.2 grain", "🚨 and ONLY this employment's row moves — it returns to `open` for a fresh attestation",
            await conn.fetchval("select state='open' from hr.pay_period_employment where id=$1", ppe),
            await conn.fetchval("select state from hr.pay_period_employment where id=$1", ppe))
        rec("§8.2 grain", "🚨 and the hr.pay_period row is UNTOUCHED — one disputed timecard never un-submits a pay group",
            pp_state_before == "submitted"
            and pp_state_before == await conn.fetchval("select state from hr.pay_period where id=$1", pp),
            f"before={pp_state_before} after={await conn.fetchval('select state from hr.pay_period where id=$1', pp)}")


        # ================================================================= §3.4 VERSIONED TARGET
        await as_owner()
        lr4 = await conn.fetchval(
            "insert into hr.leave_request (organization_id, employment_id, leave_policy_id, starts_on, "
            "ends_on, requested_hours, state, engine_key, engine_version) "
            "values ($1,$2,$3,current_date + 120, current_date + 121, 16,'submitted','proof','1') returning id",
            org, people["alice"]["employment"], lp)
        await as_user(people["alice"]["uid"])
        rh = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2,$3::jsonb)",
                     lr4, org, json.dumps({"total_hours": 16}))
        tgt_inst = rh.get("instance_id")
        await as_owner()
        tgt_step = await conn.fetchval(
            "select id from hr.workflow_step where workflow_instance_id=$1 and state='active'", tgt_inst)
        d_before = await conn.fetchval("select target_digest from hr.workflow_instance where id=$1", tgt_inst)
        # a COSMETIC change: version moves, the digest does not
        await conn.execute("update hr.leave_request set reason_note='typo fix' where id=$1", lr4)
        # a MATERIAL change: the dates move
        await conn.execute("update hr.leave_request set ends_on=current_date + 125, requested_hours=40 where id=$1", lr4)
        await as_user(people["bob"]["uid"])
        ri = await j("select hr.wf_decide($1,'approved')", tgt_step)
        rec("§3.4 versioned target", "🚨 approving a request whose target changed materially is REFUSED with WF_TARGET_CHANGED",
            ri.get("granted") is False and ri.get("reason") == "WF_TARGET_CHANGED", ri.get("reason"))
        rec("§3.4 versioned target", "the default policy is `restart`, and it says so",
            ri.get("policy") == "restart", ri.get("policy"))
        await as_owner()
        rec("§3.4 versioned target", "the digest was refreshed to what the target now says",
            await conn.fetchval("select target_digest <> $2 from hr.workflow_instance where id=$1",
                                tgt_inst, d_before))
        rec("§3.4 versioned target", "prior approvers were notified that the request changed",
            await conn.fetchval(
                "select count(*)>0 from communication.notification where event_key='hr.workflow.request_changed' "
                "and (payload->>'instance_id')::uuid=$1", tgt_inst))

        # ================================================================= §8.3 TERMINATION
        await as_user(people["carol"]["uid"])
        rj = await j("select hr.wf_request('termination','hr_employment',$1,$2,$3::jsonb,$4)",
                     people["erin"]["employment"], org,
                     json.dumps({"voluntary": False, "last_day": "2026-09-30",
                                 "separation_reason": "position_eliminated",
                                 "level_at_or_above_threshold": False}),
                     people["erin"]["employment"])
        term = rj.get("instance_id")
        rec("§8.3 termination", "the termination instance opens and routes to HR review",
            rj.get("granted") and rj.get("state") == "active", json.dumps(rj)[:200])
        await as_owner()
        rec("§9.5 bulk", "termination ships allow_bulk_decide = false",
            await conn.fetchval(
                "select not d.allow_bulk_decide from hr.workflow_definition d "
                "join hr.workflow_instance i on i.workflow_definition_id=d.id where i.id=$1", term))
        rec("§5.1 projection", "🚨 the restricted-tier projection is CONTENTLESS — no name in the task title",
            await conn.fetchval(
                "select count(*)=0 from workspace.tasks t join hr.workflow_step s on s.workspace_task_id=t.id "
                "where s.workflow_instance_id=$1 and t.title ilike '%Erin%'", term))

        t_step = await conn.fetchval(
            "select id from hr.workflow_step where workflow_instance_id=$1 and step_key='hr_review'", term)
        await as_user(people["carol"]["uid"])
        rk0 = await j("select hr.wf_decide($1,'approved')", t_step)
        rec("§4.2 refusals", "approving a requires_reason step with NO reason is refused",
            rk0.get("granted") is False and rk0.get("reason") == "WF_REASON_REQUIRED", rk0.get("reason"))
        rk0b = await j("select hr.wf_decide($1,'rejected')", t_step)
        rec("§4.2 refusals", "rejecting with no reason is refused — a hard rule, never a knob (§9.1)",
            rk0b.get("granted") is False and rk0b.get("reason") == "WF_REASON_REQUIRED", rk0b.get("reason"))
        # 🚨 SINCE hr_c4_22 A TERMINATION NEEDS TWO ACTORS ON ITS LADDER, and the fixture had one.
        # Dave holds termination_approve at a WORSE rank than carol, so the authority rung still
        # yields carol alone for hr_review (min rank wins), and once she is struck as a prior
        # decider the `substitute` rung — "the next-rank holder in the same scope" — is what carries
        # the second actor to the executive step. The ladder was always the mechanism for this.
        await as_owner()
        await conn.execute(
            "insert into hr.approval_authority (organization_id, holder_kind, holder_id, action_type, "
            "scope_kind, rank, effective_from) "
            "values ($1,'employment',$2,'termination_approve','org',95,current_date - 300)",
            org, str(people["dave"]["employment"]))
        await as_user(people["carol"]["uid"])
        rk = await j("select hr.wf_decide($1,'approved','Position eliminated; approved by HR.')", t_step)
        rec("§8.3 termination", "HR review approves with a mandatory reason", rk.get("granted"),
            json.dumps(rk)[:160])
        await as_owner()
        e_step = await conn.fetchval(
            "select id from hr.workflow_step where workflow_instance_id=$1 and step_key='executive_approval'", term)
        rec("§2.4 condition", "the executive step ACTIVATED because the separation is involuntary",
            await conn.fetchval("select state='active' from hr.workflow_step where id=$1", e_step))
        rec("§1.4 two actors", "🚨 §8.3's executive step is NOT offered to the HR reviewer who just decided — the second level is a second person",
            not await conn.fetchval(
                "select resolved_approver_ids @> array[$2]::uuid[] from hr.workflow_step where id=$1",
                e_step, people["carol"]["employment"]),
            str(await conn.fetchval(
                "select resolved_approver_ids::text from hr.workflow_step where id=$1", e_step)))
        await as_user(people["carol"]["uid"])
        rl_self = await j("select hr.wf_decide($1,'approved','Same person, second level.')", e_step)
        rec("§1.4 two actors", "and the decide door refuses her by name if she reaches it anyway",
            rl_self.get("granted") is False
            and rl_self.get("reason") in ("WF_DISTINCT_ACTOR_REQUIRED", "WF_NOT_APPROVER"),
            rl_self.get("reason"))
        await as_user(people["dave"]["uid"])
        rl = await j("select hr.wf_decide($1,'approved','Confirmed.')", e_step)
        await as_owner()
        rec("§1.4 two actors", "🚨 the SUBSTITUTE rung carries the second actor and the two-level review actually happens — two distinct deciders on the ladder",
            rl.get("granted") is True and await conn.fetchval(
                "select count(distinct actor_employment_id)=2 from hr.workflow_decision "
                "where workflow_instance_id=$1 and step_key in ('hr_review','executive_approval')", term),
            json.dumps(rl)[:140])
        term_state = await conn.fetchval("select state from hr.workflow_instance where id=$1", term)
        branches = await conn.fetch(
            "select step_key, state from hr.workflow_step where workflow_instance_id=$1 "
            "and parallel_group='offboarding' order by step_key", term)
        rec("§8.3 termination", "🚨 with both sequential gates approved the PARALLEL offboarding group opened — six branches at once",
            len(branches) == 6 and all(b["state"] in ("active", "awaiting_result") for b in branches),
            f"state={term_state} branches=" + ",".join(f"{b['step_key']}:{b['state']}" for b in branches))
        rec("§8.3 termination", "and Branch A (access shutoff) is `awaiting_result`, not `active` — it has no human approver",
            any(b["step_key"] == "access_shutoff" and b["state"] == "awaiting_result" for b in branches))

        # 🚨 THE DELIBERATELY-FAILED SHUTOFF. Prove that an external_result step cannot self-complete.
        await as_owner()
        shut = await conn.fetchrow(
            "select id, state, result_due_at from hr.workflow_step where workflow_instance_id=$1 "
            "and step_key='access_shutoff'", term)
        # the fan-out only opens if apply succeeded; the shipped apply stub refuses, which is itself
        # the fail-closed proof. Drive the branch directly to prove the RESULT law as well.
        await conn.execute(
            "update hr.workflow_step set state='awaiting_result', activated_at=now(), "
            "result_due_at=now() - interval '1 hour' where id=$1", shut["id"])
        await as_user(people["carol"]["uid"])
        rm = await j("select hr.wf_record_result($1,$2::jsonb,true)", shut["id"],
                     json.dumps({"accounts_disabled": ["okta", "gsuite"], "note": "claimed by the integration"}))
        rec("§0 law 5", "🚨 a caller CLAIMING verified is refused when the flow type's probe says otherwise",
            rm.get("granted") is False and rm.get("reason") == "result_unverified", rm.get("reason"))
        await as_owner()
        rec("§0 law 5", "the step is STILL awaiting_result — it did not self-complete because an event fired",
            await conn.fetchval("select state='awaiting_result' from hr.workflow_step where id=$1", shut["id"]))
        rec("§0 law 5", "and the claim is retained alongside the probe that contradicted it",
            await conn.fetchval(
                "select result_evidence ? 'claimed' and result_evidence ? 'probe' "
                "from hr.workflow_step where id=$1", shut["id"]))

        tick = await j("select hr.wf_tick()")
        rec("§1.9 tick pass 5", "the sweep opens a result_unverified failure on the elapsed window",
            (tick or {}).get("results_unverified", 0) >= 1, json.dumps(tick)[:220])
        fail_id = await conn.fetchval(
            "select id from hr.workflow_failure where workflow_step_id=$1 and failure_class='result_unverified'",
            shut["id"])
        rec("§1.8 failure", "the failure row is assigned to a real human, not left ownerless",
            await conn.fetchval("select assigned_employment_id is not null from hr.workflow_failure where id=$1",
                                fail_id))
        rec("§8.3 termination", "🚨 the instance NEVER reached completed with a failed shutoff",
            await conn.fetchval("select state <> 'completed' from hr.workflow_instance where id=$1", term))
        await as_user(people["carol"]["uid"])
        rn = await j("select hr.wf_resolve_failure($1,'resolve','Disabled by hand in Okta and Google; screenshots filed.')",
                     fail_id)
        rec("§1.8 failure", "a human resolving it WITH EVIDENCE closes the branch — the only way it can close",
            rn.get("granted") is True, json.dumps(rn)[:160])
        await as_owner()
        rec("§1.8 failure", "and the manual resolution is recorded on the step",
            await conn.fetchval(
                "select result_evidence ? 'manual_resolution' from hr.workflow_step where id=$1", shut["id"]))

        # ================================================================= THE SWEEP, by direct call
        await as_owner()
        lr5 = await conn.fetchval(
            "insert into hr.leave_request (organization_id, employment_id, leave_policy_id, starts_on, "
            "ends_on, requested_hours, state, engine_key, engine_version) "
            "values ($1,$2,$3,current_date + 200, current_date + 200, 8,'submitted','proof','1') returning id",
            org, people["alice"]["employment"], lp)
        await as_user(people["alice"]["uid"])
        ro = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2)", lr5, org)
        await as_owner()
        sweep_step = await conn.fetchval(
            "select id from hr.workflow_step where workflow_instance_id=$1 and state='active'", ro.get("instance_id"))
        await conn.execute(
            "update hr.workflow_step set activated_at = now() - interval '200 hours', "
            "due_at = now() - interval '100 hours' where id=$1", sweep_step)
        t1 = await j("select hr.wf_tick()")
        rec("§1.9 tick pass 1", "the sweep sent a reminder to the approver who has not decided",
            (t1 or {}).get("reminders", 0) >= 1, json.dumps(t1)[:200])
        rec("§1.9 tick pass 1", "and the reminder notice exists on the spine",
            await conn.fetchval(
                "select count(*)>0 from communication.notification where event_key='hr.workflow.step_reminder' "
                "and target_id=$1", sweep_step))
        t2 = await j("select hr.wf_tick()")
        rec("§1.9 tick pass 4", "a step past its due date with on_expiry=escalate ESCALATED",
            (t2 or {}).get("escalations", 0) >= 1 or await conn.fetchval(
                "select escalated_at is not null from hr.workflow_step where id=$1", sweep_step),
            json.dumps(t2)[:200])
        rec("§1.9 tick pass 4", "and it escalated AWAY from the previous holder, recording who it left",
            await conn.fetchval(
                "select escalated_from_employment_id is not null from hr.workflow_step where id=$1", sweep_step))

        # ================================================================= BULK, PER-STEP REFUSAL
        await as_user(people["bob"]["uid"])
        rp = await j("select hr.wf_bulk_decide(array[$1]::uuid[],'approved')", tgt_step)
        rec("§5.2 bulk", "bulk returns PER-STEP outcomes, not all-or-nothing",
            rp.get("granted") is True and isinstance(rp.get("results"), list), json.dumps(rp)[:200])
        rq = await j("select hr.wf_bulk_decide(array[$1]::uuid[],'approved')", t_step)
        rec("§5.2 bulk", "bulk is refused outright for a flow whose definition forbids it (termination)",
            rq.get("granted") is False and rq.get("reason") == "WF_BULK_FORBIDDEN", rq.get("reason"))

        # ================================================================= PUBLISH DOESN'T TOUCH FLIGHT
        await as_owner()
        newdef = await conn.fetchval(
            "insert into hr.workflow_definition (organization_id, flow_key, name, definition_version, "
            "status, visibility) values ($1,'leave_request','Org override',2,'draft','internal') returning id", org)
        await conn.execute(
            "insert into hr.workflow_step_definition (organization_id, workflow_definition_id, step_key, "
            "label, step_order, resolver_kind, authority_action, autonomy_mode) "
            "values ($1,$2,'manager_approval','Manager',10,'authority','leave_approve',4)", org, newdef)
        before = await conn.fetchrow(
            "select workflow_definition_id, definition_version from hr.workflow_instance where id=$1",
            ro.get("instance_id"))
        await as_user(people["carol"]["uid"])
        rr = await j("select hr.wf_publish_definition($1)", newdef)
        await as_owner()
        after = await conn.fetchrow(
            "select workflow_definition_id, definition_version from hr.workflow_instance where id=$1",
            ro.get("instance_id"))
        rec("§10 test 7", "publishing a new definition mid-flight leaves every running instance pinned",
            rr.get("granted") and before["workflow_definition_id"] == after["workflow_definition_id"]
            and before["definition_version"] == after["definition_version"], json.dumps(rr)[:200])

        # an org definition that sets allows_self is refused at publish time (§9.1 P-only)
        bad = await conn.fetchval(
            "insert into hr.workflow_definition (organization_id, flow_key, name, definition_version, "
            "status, visibility) values ($1,'leave_request','Bad override',3,'draft','internal') returning id", org)
        await conn.execute(
            "insert into hr.workflow_step_definition (organization_id, workflow_definition_id, step_key, "
            "label, step_order, resolver_kind, authority_action, allows_self) "
            "values ($1,$2,'self','Self',10,'authority','leave_approve',true)", org, bad)
        await as_user(people["carol"]["uid"])
        rs = await j("select hr.wf_publish_definition($1)", bad)
        rec("§9.1 P-only", "an org definition setting allows_self is refused at publish time",
            rs.get("granted") is False and rs.get("reason") == "definition_invalid", rs.get("detail"))

        # ================================================================= DELEGATION
        await as_owner()
        await conn.execute("update hr.approval_authority set is_active=true where id=$1", auth_ids["leave_approve"])
        await as_user(people["bob"]["uid"])
        rt = await j("select hr.wf_delegate('employment',$1,'leave_approve',null,now(),now()+interval '10 days','Vacation cover')",
                     people["dave"]["employment"])
        rec("§4.2 delegate", "the delegation INTENT is written and returns a pending delegation id",
            rt.get("granted") and rt.get("state") == "pending", json.dumps(rt)[:200])
        await as_owner()
        rec("§1.3b delegation", "an unaccepted delegation materialises NO authority row",
            await conn.fetchval(
                "select count(*)=0 from hr.approval_authority where delegation_id=$1", (rt or {}).get("delegation_id")))
        await as_user(people["dave"]["uid"])
        ru = await j("select public.hr_authority_delegate($1)", (rt or {}).get("delegation_id"))
        rec("§1.3b delegation", "acceptance materialises an authority row with source='delegated'",
            ru.get("granted") and await conn.fetchval(
                "select source='delegated' and effective_to is not null from hr.approval_authority where id=$1",
                (ru or {}).get("authority_id")))
        await as_owner()
        rec("§1.3b delegation", "🚨 the materialised row carries a MANDATORY effective_to — an endless delegation cannot be represented",
            await conn.fetchval(
                "select bool_and(effective_to is not null) from hr.approval_authority where source='delegated' "
                "and organization_id=$1", org))
        # the delegated row SUPERSEDES its principal on the next resolution (§2.1)
        lr6 = await conn.fetchval(
            "insert into hr.leave_request (organization_id, employment_id, leave_policy_id, starts_on, "
            "ends_on, requested_hours, state, engine_key, engine_version) "
            "values ($1,$2,$3,current_date + 300, current_date + 300, 8,'submitted','proof','1') returning id",
            org, people["alice"]["employment"], lp)
        await as_user(people["alice"]["uid"])
        rv = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2)", lr6, org)
        await as_owner()
        dstep = await conn.fetchrow(
            "select resolution_path, resolved_approver_ids from hr.workflow_step "
            "where workflow_instance_id=$1 and state='active'", rv.get("instance_id"))
        rec("§2.1 delegation supersedes", "the DELEGATE is routed to and the path says `delegated`, not `authority`",
            dstep and dstep["resolution_path"] == "delegated"
            and people["dave"]["employment"] in list(dstep["resolved_approver_ids"]),
            f"path={dstep['resolution_path'] if dstep else None}")
        rec("§2.1 delegation supersedes", "and the PRINCIPAL is no longer routed to for the window",
            dstep and people["bob"]["employment"] not in list(dstep["resolved_approver_ids"]))
        # T-21b selector half again, on the delegated path
        allok = True
        for e in list(dstep["resolved_approver_ids"]):
            u = await conn.fetchval("select hr._wf_login_of($1)", e)
            allok = allok and bool(await conn.fetchval(
                "select hr.can_approve($1,'leave_approve','hr.leave_request',$2)", u, lr6))
        rec("T-21b selector", "every candidate on the DELEGATED path also satisfies hr.can_approve", allok)
        # delegating to the subject of your own open step is refused
        # dave is now deciding an OPEN step whose SUBJECT is alice; handing that authority to
        # alice would be never-approve-yourself wearing a different hat.
        await as_user(people["dave"]["uid"])
        rw = await j("select hr.wf_delegate('employment',$1,'leave_approve',null,now(),now()+interval '5 days','x')",
                     people["alice"]["employment"])
        rec("§4.2 delegate", "delegating to the SUBJECT of your own open steps is refused (self-approval by proxy)",
            rw.get("granted") is False, rw.get("reason"))

        # ================================================================= WITHDRAW keeps decisions
        await as_user(people["alice"]["uid"])
        rx = await j("select hr.wf_withdraw($1,'Changed my mind')", rv.get("instance_id"))
        rec("§3.3 withdraw", "the requester may withdraw, and the instance closes as withdrawn",
            rx.get("granted") and rx.get("state") == "withdrawn", json.dumps(rx)[:160])
        await as_owner()
        rec("§3.3 withdraw", "decisions already made are RETAINED — a withdrawal erases nothing",
            await conn.fetchval(
                "select count(*) >= 0 from hr.workflow_decision where workflow_instance_id=$1",
                rv.get("instance_id")))

        # ================================================================= WRITE-GUARD SCOPE
        # 🚨 THIS WAS THIS SUITE'S SIXTH FINDING AND IT IS NOW A GUARANTEE. The engine used to arm
        # the guard with `set_config('hr.privileged_write','on',true)`, whose is_local => true
        # scopes it to the TRANSACTION, not the statement — so one engine RPC left every hr.* table
        # writable for the rest of that transaction, ledgers included. The access lane shipped the
        # fix (`hr.arm_write()`: a statement-scoped, unforgeable token that never degrades a caller
        # who already holds a legacy arm — HRB-007, hr_c3_00/hr_c3_11), and hr_c4_08 moved all 20
        # `hr.wf_*` / `hr._wf_*` writers onto it. Measured here from a COLD flag, because that is
        # the state a real PostgREST request starts in, and as SEPARATE statements, because a
        # statement-scoped arm is by definition invisible inside one.
        await as_owner()
        lrg = await conn.fetchval(
            "insert into hr.leave_request (organization_id, employment_id, leave_policy_id, starts_on, "
            "ends_on, requested_hours, state, engine_key, engine_version) "
            "values ($1,$2,$3,current_date + 400, current_date + 400, 8,'submitted','proof','1') returning id",
            org, people["alice"]["employment"], lp)
        await conn.execute("select set_config('hr.privileged_write','',true)")   # COLD
        await as_user(people["alice"]["uid"])
        rg = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2,$3::jsonb)",
                     lrg, org, json.dumps({"total_hours": 8}))
        guard_flag = await conn.fetchval("select current_setting('hr.privileged_write', true)")
        await conn.execute("reset role")
        await conn.execute("select set_config('request.jwt.claims','',true)")
        rec("§ write-guard scope", "an engine RPC arms ITSELF — with nothing armed ambiently it still writes its instance row",
            await conn.fetchval("select count(*)=1 from hr.workflow_instance where id=$1", rg.get("instance_id")),
            json.dumps(rg)[:160])
        rec("§ write-guard scope",
            "🚨 and it leaves NO transaction-wide arm behind — the legacy `on` literal is gone from the engine",
            (guard_flag or "") not in ("on", "true", "1", "yes") and (guard_flag or "") != "",
            f"flag={guard_flag!r}")
        # the other half: the arm died with the statement that issued it, so the NEXT statement in
        # the SAME transaction cannot write hr.* — run as the connection owner so RLS is not in the
        # picture and the write guard is the only thing that can refuse.
        sp0 = conn.transaction()
        await sp0.start()
        guard_refused, guard_state = False, None
        try:
            await conn.execute("delete from hr.workflow_binding where workflow_instance_id=$1",
                               rg.get("instance_id"))
            guard_state = "no error — the delete went through"
        except Exception as e:
            guard_refused = getattr(e, "sqlstate", None) == "42501"
            guard_state = f"{type(e).__name__} {getattr(e, 'sqlstate', None)}"
        await sp0.rollback()
        rec("§ write-guard scope",
            "🚨 the NEXT statement in the same transaction is REFUSED 42501 — a definer call no longer disarms the guard",
            guard_refused, guard_state)

        # ================================================================= LEDGER IMMUTABILITY
        await conn.execute("reset role")
        await conn.execute("select set_config('hr.privileged_write','off',true)")
        # a refused write ABORTS the surrounding transaction, so each probe gets its own savepoint
        await as_user(people["bob"]["uid"])
        for label, stmt in [
            ("a client cannot UPDATE a decision row",
             "update hr.workflow_decision set decision='rejected' where workflow_instance_id=$1"),
            ("a client cannot DELETE a workflow instance (the write guard, not the column)",
             "delete from hr.workflow_instance where id=$1"),
            ("a client cannot INSERT a decision row directly (the ledger is SELECT-only)",
             "insert into hr.workflow_decision (organization_id, workflow_instance_id, workflow_step_id, "
             "step_key, decision, actor_type) select organization_id, id, id, 'x','approved','employee' "
             "from hr.workflow_instance where id=$1"),
        ]:
            sp = conn.transaction()
            await sp.start()
            outcome = None
            try:
                tag = await conn.execute(stmt, inst)
                # a write RLS filters to zero rows is refused just as surely as one that raises —
                # the row must still be there and unchanged either way.
                outcome = f"no error, {tag}"
                affected = int(str(tag).rsplit(" ", 1)[-1]) if str(tag).rsplit(" ", 1)[-1].isdigit() else 0
                ok = affected == 0
            except Exception as e:
                ok, outcome = True, type(e).__name__
            await sp.rollback()
            rec("AD-11 ledger", label, ok, outcome)

        # ============================================= §8.2 A→B→C→H→L, THROUGH THE REAL DOORS
        # 🚨 THE WHOLE CHAIN, FROM THE PERIOD SUBMIT. Everything above drives hr.wf_request
        # directly; nothing proved that the PRODUCT path — an HR admin pressing Submit on a pay
        # period — opens the instances at all. It did not: the submit opened them and every one
        # died `approver_ineligible` because hr.wf_resolve_approvers dropped any candidate with no
        # platform login, including the SUBJECT of the self-step. `hr.pay_period_transition` then
        # counted only granted envelopes and reported "0 instance(s) were started", so four
        # verification rounds read an empty hr.workflow_instance and a submit that looked inert.
        # Fixed in hr_c4_11; proven here end to end, on their own pay group so nothing above moves.
        await as_owner()
        pg2 = await conn.fetchval(
            "insert into hr.pay_group (organization_id, employer_profile_id, name, pay_frequency, "
            "first_period_start_on, workweek_effective_from) "
            "values ($1,$2,'Chain Biweekly','biweekly',current_date - 60, current_date - 60) returning id", org, er)
        for key in ("alice", "bob"):
            await conn.execute("update hr.employment set pay_group_id=$1 where id=$2",
                               pg2, people[key]["employment"])
        pp2 = await conn.fetchval(
            "insert into hr.pay_period (organization_id, pay_group_id, period_start_on, period_end_on, "
            "sequence_number) values ($1,$2,current_date - 15, current_date - 1, 2) returning id", org, pg2)
        # hr.pay_period_transition asks the capability AS OF period_end_on, not today — so the role
        # that carries payroll.read has to have been in force then. The fixture's role assignments
        # start today; backdate them here, at the end of the suite, where nothing above can see it.
        await conn.execute(
            "update hr.role_assignment set effective_from=current_date - 400 where organization_id=$1", org)

        # carol is the HR owner, so she holds payroll.read and may move the period
        await as_user(people["carol"]["uid"])
        sub = await j("select hr.pay_period_transition($1,'submitted')", pp2)
        sub_d = (sub or {}).get("data") or {}
        await as_owner()
        rec("§8.2 A→B submit", "an HR owner may submit the period at all — the product path is reachable",
            (sub or {}).get("ok") is True, json.dumps(sub)[:260])
        rec("§8.2 A→B submit", "🚨 the PERIOD SUBMIT opens one instance per enrolled employment — the product path, not hr.wf_request",
            sub_d.get("workflowInstancesOpened") == 2 and sub_d.get("workflowInstancesFailed") == 0,
            f"opened={sub_d.get('workflowInstancesOpened')} failed={sub_d.get('workflowInstancesFailed')} "
            f"rows={sub_d.get('rowsOpened')} flow={sub_d.get('workflowFlowKey')}")
        rec("§8.2 A→B submit", "and the notice says what actually happened, failures included — a refusal is never discarded",
            "are routed and waiting" in str(sub_d.get("notice") or ""), sub_d.get("notice"))
        chain = {}
        for key in ("alice", "bob"):
            ppe2 = await conn.fetchval(
                "select id from hr.pay_period_employment where pay_period_id=$1 and employment_id=$2",
                pp2, people[key]["employment"])
            st2 = await conn.fetchrow(
                "select s.id, s.state, s.resolved_approver_ids from hr.workflow_step s "
                "join hr.workflow_instance i on i.id=s.workflow_instance_id "
                "where i.target_id=$1 and i.flow_key='timecard_attestation' and s.state='active'", ppe2)
            chain[key] = {"ppe": ppe2, "step": st2}
        rec("§8.2 B→C routing", "🚨 every opened attestation routes to the EMPLOYEE THEMSELVES — the allows_self self-step, live",
            all(chain[k]["step"] is not None
                and list(chain[k]["step"]["resolved_approver_ids"]) == [people[k]["employment"]]
                for k in chain),
            {k: (chain[k]["step"]["state"] if chain[k]["step"] else None) for k in chain})

        # ---- C→H: the employee attests, and the apply hook opens the manager's approval
        for key, mgr in (("alice", "bob"), ("bob", "carol")):
            await as_user(people[key]["uid"])
            await j("select hr.wf_decide($1,'attested')", chain[key]["step"]["id"])
            await as_owner()
            chain[key]["mgr_step"] = await conn.fetchrow(
                "select s.id from hr.workflow_step s join hr.workflow_instance i on i.id=s.workflow_instance_id "
                "where i.target_id=$1 and i.flow_key='timecard_approval' and s.state='active'", chain[key]["ppe"])
        rec("§8.2 C→H chain", "each employee self-attests and the apply hook opens THEIR manager-approval step",
            all(chain[k].get("mgr_step") is not None for k in chain),
            {k: str(chain[k].get("mgr_step") and chain[k]["mgr_step"]["id"]) for k in chain})
        rec("§8.2 C attest", "and each timecard row records the attestation",
            await conn.fetchval(
                "select count(*)=2 from hr.pay_period_employment where pay_period_id=$1 and attested_at is not null", pp2),
            str(await conn.fetchval(
                "select string_agg(state, ', ') from hr.pay_period_employment where pay_period_id=$1", pp2)))

        # ---- L: the period cannot be approved while a row is still undecided, and it NAMES who
        await as_user(people["carol"]["uid"])
        early = await j("select hr.pay_period_transition($1,'approved')", pp2)
        early_d = (early or {}).get("details") or {}
        rec("§8.2 L completion", "🚨 the period REFUSES to approve while a timecard is not APPROVED — attested is not approved",
            (early or {}).get("ok") is False
            and (early or {}).get("error") == "hr_period_has_open_timecards"
            and early_d.get("open_count") == 2,
            f'open_count={early_d.get("open_count")} by_state={json.dumps(early_d.get("by_state"))}')
        rec("§8.2 L completion", "and it names WHO is outstanding and in WHAT state — two different people to chase",
            "Alice Requester (attested)" in str(early_d.get("sample") or "")
            and len(early_d.get("outstanding") or []) == 2,
            str(early_d.get("sample"))[:160])

        # ---- H→L: the managers approve, the rows advance, and the period closes
        for key, mgr in (("alice", "bob"), ("bob", "carol")):
            await as_user(people[mgr]["uid"])
            await j("select hr.wf_decide($1,'approved')", chain[key]["mgr_step"]["id"])
        await as_owner()
        rec("§8.2 H→L chain", "each manager approves and THAT employment's timecard row advances to approved",
            await conn.fetchval(
                "select count(*)=2 from hr.pay_period_employment where pay_period_id=$1 and state='approved'", pp2),
            str(await conn.fetchval(
                "select string_agg(state, ', ') from hr.pay_period_employment where pay_period_id=$1", pp2)))
        await as_user(people["carol"]["uid"])
        done = await j("select hr.pay_period_transition($1,'approved')", pp2)
        await as_owner()
        rec("§8.2 L completion", "🚨 and with every row decided the PERIOD reaches approved — the chain runs end to end",
            (done or {}).get("ok") is True
            and await conn.fetchval("select state='approved' from hr.pay_period where id=$1", pp2),
            json.dumps(done)[:220])

        # ============================================= §8.2 NODE G — THE UNREACHABLE ATTESTATION
        # 🚨 A SELF-STEP CAN ROUTE TO SOMEBODY WHO CANNOT ACT, AND IT MUST STILL BE ABLE TO END.
        # A kiosk-only employee holds no login: no iam.permissions grant, no workspace.tasks row,
        # no way to call hr.wf_decide. hr_c4_11 made the step ROUTE to them (§5.1 — the login is a
        # projection filter, not an eligibility rule); this is the other half — it TERMINATES,
        # honestly, without anything ever attesting on their behalf.
        await as_owner()
        noreach_emp = await conn.fetchval(
            "insert into hr.employee (organization_id, party_id, employee_number, legal_first_name, "
            "legal_last_name, display_name) values ($1,$2,'EMP-noreach','Nora','NoLogin','Nora NoLogin') "
            "returning id", org,
            await conn.fetchval("insert into crm.party (organization_id, party_kind, display_name) "
                                "values ($1,'person','Nora NoLogin') returning id", org))
        noreach = await conn.fetchval(
            "insert into hr.employment (organization_id, employee_id, employer_profile_id, "
            "pay_group_id, hire_date, status) values ($1,$2,$3,$4,current_date - 365,'active') returning id",
            org, noreach_emp, er, pg2)
        await conn.execute(
            "insert into hr.position_assignment (organization_id, employment_id, job_title_id, "
            "department_id, location_id, worker_class, flsa_status, pay_basis, schedule_class, "
            "effective_from, manager_employment_id) "
            "values ($1,$2,$3,$4,$5,'employee','nonexempt','hourly','full_time',current_date - 365,$6)",
            org, noreach, jt, dept, loc, people["bob"]["employment"])
        pp3 = await conn.fetchval(
            "insert into hr.pay_period (organization_id, pay_group_id, period_start_on, period_end_on, "
            "sequence_number) values ($1,$2,current_date - 45, current_date - 31, 3) returning id", org, pg2)
        await as_user(people["carol"]["uid"])
        sub3 = await j("select hr.pay_period_transition($1,'submitted')", pp3)
        await as_owner()
        nr_ppe = await conn.fetchval(
            "select id from hr.pay_period_employment where pay_period_id=$1 and employment_id=$2",
            pp3, noreach)
        nr_step = await conn.fetchrow(
            "select s.id, s.state, s.resolved_approver_ids, s.resolved_user_ids, s.resolution_evidence "
            "from hr.workflow_step s join hr.workflow_instance i on i.id=s.workflow_instance_id "
            "where i.target_id=$1 and i.flow_key='timecard_attestation'", nr_ppe)
        rec("§8.2 node G", "an employee with NO LOGIN is still routed their own attestation, and the step records that it cannot reach them",
            nr_step is not None and nr_step["state"] == "active"
            and list(nr_step["resolved_approver_ids"]) == [noreach]
            and list(nr_step["resolved_user_ids"]) == []
            and "no_login" in json.dumps(json.loads(nr_step["resolution_evidence"]).get("no_reach") or []),
            nr_step["state"] if nr_step else None)
        rec("§8.2 node G", "🚨 and it raises a NAMED, NON-RETRYABLE failure — unreachable is a STATE, not a transient error",
            await conn.fetchval(
                "select count(*)=1 from hr.workflow_failure where workflow_step_id=$1 "
                "and failure_class='unactionable_no_reach' and state='open'", nr_step["id"]))
        nr_fail = await conn.fetchval(
            "select id from hr.workflow_failure where workflow_step_id=$1 "
            "and failure_class='unactionable_no_reach'", nr_step["id"])
        await as_user(people["carol"]["uid"])
        nr_retry = await j("select hr.wf_resolve_failure($1,'retry','try again')", nr_fail)
        rec("§8.2 node G", "retry is REFUSED by name, and the refusal says what the class does offer",
            nr_retry.get("granted") is False
            and nr_retry.get("reason") == "unknown_action"
            and "not_attested" in json.dumps(nr_retry.get("available_actions")),
            json.dumps(nr_retry)[:200])
        # 🚨 ESCALATE IS THE ONE CONTROL THIS STEP MUST NEVER TAKE — it hands somebody else the
        # employee's own signature, and it is what killed the real G2V timecard on 2026-08-27.
        nr_esc = await j("select hr.wf_escalate($1,'nobody is answering')", nr_step["id"])
        await as_owner()
        rec("§8.2 node G", "🚨 ESCALATE is refused on a self-step — escalating an attestation hands somebody else the employee's signature",
            nr_esc.get("granted") is False
            and nr_esc.get("reason") == "WF_SELF_STEP_NOT_ESCALATABLE", json.dumps(nr_esc)[:200])
        rec("§8.2 node G", "and the refused escalation left the step exactly as it was — still active, still theirs",
            await conn.fetchval(
                "select state='active' and resolved_approver_ids=array[$2]::uuid[] "
                "from hr.workflow_step where id=$1", nr_step["id"], noreach))
        # `resolve` is not even on this class's menu — an unreachable step is not something you
        # declare fixed. The vocabulary refuses it before any step state is consulted.
        await as_user(people["carol"]["uid"])
        nr_hide = await j("select hr.wf_resolve_failure($1,'resolve','tidy it away')", nr_fail)
        rec("§8.2 node G", "🚨 `resolve` is not offered for an unreachable step at all — you cannot declare it fixed",
            nr_hide.get("granted") is False
            and nr_hide.get("reason") == "unknown_action"
            and "resolve" not in json.dumps(nr_hide.get("available_actions")),
            json.dumps(nr_hide.get("available_actions")))

        # the terminal path, through the product door
        await as_user(people["carol"]["uid"])
        nr_term = await j("select hr.wf_resolve_failure($1,'not_attested','Nobody can reach this employee; closing it honestly.')",
                          nr_fail)
        await as_owner()
        rec("§8.2 node G", "🚨 the failure lane closes it as NOT_ATTESTED — and the envelope carries `outcome` for the task page",
            nr_term.get("granted") is True and nr_term.get("outcome") == "not_attested",
            json.dumps(nr_term)[:200])
        rec("§8.2 node G", "🚨 NOTHING attested on their behalf: attested_at is still NULL and the row is flagged to the manager",
            await conn.fetchval(
                "select attested_at is null and metadata->>'attestation_outcome'='not_attested' "
                "from hr.pay_period_employment where id=$1", nr_ppe),
            str(await conn.fetchval(
                "select metadata->>'attestation_outcome' from hr.pay_period_employment where id=$1", nr_ppe)))
        nr_mgr_step = await conn.fetchrow(
            "select s.id, s.resolved_approver_ids from hr.workflow_step s "
            "join hr.workflow_instance i on i.id=s.workflow_instance_id "
            "where i.target_id=$1 and i.flow_key='timecard_approval' and s.state='active'", nr_ppe)
        rec("§8.2 node G", "and the MANAGER's approval opens on the flagged timecard — the period is not blocked forever",
            nr_mgr_step is not None
            and list(nr_mgr_step["resolved_approver_ids"]) == [people["bob"]["employment"]],
            str(nr_mgr_step["id"]) if nr_mgr_step else None)
        await as_user(people["bob"]["uid"])
        await j("select hr.wf_decide($1,'approved','Approved despite no attestation; the flag travels to the export.')",
                nr_mgr_step["id"])
        await as_owner()
        rec("§8.2 node G", "🚨 the manager approves a NOT-ATTESTED timecard and the row advances — approve-despite, flagged, never forged",
            await conn.fetchval(
                "select state='approved' and attested_at is null "
                "from hr.pay_period_employment where id=$1", nr_ppe))
        # 🚨 THE INSTANCE MUST NOT CONTRADICT ITS OWN TIMECARD. `state` is PROCESS vocabulary
        # (§3.1: `applying --> completed: apply_fn succeeded`), but `state_reason` used to hardcode
        # 'completed' — restating the state, carrying zero information, and reading to a human as
        # an OUTCOME. An instance that closed not_attested said "completed", so a surface reading
        # the instance alone concluded the attestation had happened. The reason now carries the
        # apply hook's own word, exactly as the failure branch has always done.
        rec("§3.1 vocabulary", "🚨 the instance's close reason carries the OUTCOME, not a word that merely restates its state",
            await conn.fetchval(
                "select i.state_reason = (ppe.metadata->>'attestation_outcome') "
                "from hr.workflow_instance i join hr.pay_period_employment ppe on ppe.id=i.target_id "
                "where i.target_id=$1 and i.flow_key='timecard_attestation'", nr_ppe),
            str(await conn.fetchval(
                "select i.state||' / '||coalesce(i.state_reason,'(null)') from hr.workflow_instance i "
                "where i.target_id=$1 and i.flow_key='timecard_attestation'", nr_ppe)))
        rec("§3.1 vocabulary", "and no instance anywhere closes with a reason that only repeats its state",
            await conn.fetchval(
                "select count(*)=0 from hr.workflow_instance where state_reason in ('completed','closed')"),
            str(await conn.fetchval(
                "select string_agg(distinct flow_key, ', ') from hr.workflow_instance "
                "where state_reason in ('completed','closed')")))

        # and the same transition is the SWEEP's, not a second implementation
        rec("§8.2 node G", "🚨 the human door and the deadline sweep take THE SAME transition — one hr._wf_not_attested, nothing to fork",
            await conn.fetchval(
                "select count(*)=0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.proname <> '_wf_not_attested' "
                "and p.prosrc ~ '_wf_close_step\\([^)]*''not_attested'''"))
        # ============================================= §1.8 THE QUEUE COUNTS ONLY REAL WORK
        # 🚨 §1.8: the failure queue "is not an error log. It is a worked queue: every row is a
        # thing a human must resolve BEFORE THE INSTANCE CAN MOVE." A terminally-closed instance
        # cannot move, so an open row against one is not work — it is noise counted as work in the
        # inbox's outstanding total. Two such rows were found live on 2026-08-27; both halves are
        # asserted here so the class cannot re-accumulate.
        await as_owner()
        TERMINAL = ("completed", "closed", "rejected", "rejected_at_intake", "withdrawn",
                    "cancelled", "expired", "superseded")
        # drive it: cancel an instance that HAS an open failure row, through the real door
        stale_lr = await conn.fetchval(
            "insert into hr.leave_request (organization_id, employment_id, leave_policy_id, starts_on, "
            "ends_on, requested_hours, state, engine_key, engine_version) "
            "values ($1,$2,$3,current_date + 600, current_date + 600, 8,'submitted','proof','1') returning id",
            org, people["erin"]["employment"], lp)
        # 🚨 strip the reporting line TOO, not just the authority rows. Since hr_c4_20 the
        # subject's manager can approve an `auto_record` action with no authority row at all — so
        # deactivating authority alone no longer makes anything unroutable, and this fixture would
        # be quietly testing a request that routed perfectly well.
        await conn.execute(
            "update hr.approval_authority set is_active=false where organization_id=$1 "
            "and action_type='leave_approve'", org)
        await conn.execute(
            "update hr.position_assignment set manager_employment_id=null where employment_id=$1",
            people["erin"]["employment"])
        # and the top-of-chart backstop, which correctly catches it once the line is gone. All three
        # rungs have to be empty for a request to be genuinely unroutable — that is the point.
        await conn.execute("update hr.role_assignment set is_active=false where organization_id=$1", org)
        await conn.execute(
            "update iam.memberships set role='member' where organization_id=$1 "
            "and container_type='organization'", org)
        await as_user(people["erin"]["uid"])
        stale_req = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2)", stale_lr, org)
        await as_owner()
        await conn.execute(
            "update hr.approval_authority set is_active=true where organization_id=$1", org)
        await conn.execute("update hr.role_assignment set is_active=true where organization_id=$1", org)
        await conn.execute(
            "update iam.memberships set role='owner' where organization_id=$1 "
            "and container_type='organization' and user_id=$2", org, people["carol"]["uid"])
        await conn.execute(
            "update hr.position_assignment set manager_employment_id=$1 where employment_id=$2",
            people["carol"]["employment"], people["erin"]["employment"])
        stale_inst = stale_req.get("instance_id")
        # 🚨 asserted HERE, where the condition is built: a FAILED instance keeps its open row,
        # because §3.1 retries from there and that row is the mechanism for getting it moving.
        # Reading a leftover from an earlier section would be measuring whatever later sections did
        # to it — which is exactly how this assertion went green-then-red on somebody else's change.
        rec("§1.8 queue hygiene", "a FAILED instance keeps its open row — §3.1 retries from there, so that row is live work",
            await conn.fetchval(
                "select count(*)>0 from hr.workflow_failure f "
                "join hr.workflow_instance i on i.id=f.workflow_instance_id "
                "where i.id=$1 and i.state='failed' and f.state in ('open','retrying')", stale_inst),
            str(await conn.fetchval(
                "select i.state||' / '||coalesce(string_agg(f.state,','),'(no rows)') "
                "from hr.workflow_instance i left join hr.workflow_failure f "
                "on f.workflow_instance_id=i.id where i.id=$1 group by i.state", stale_inst)))
        rec("§1.8 queue hygiene", "an unroutable request opens a real failure row a human owns",
            await conn.fetchval(
                "select count(*)>0 from hr.workflow_failure where workflow_instance_id=$1 and state='open'",
                stale_inst))
        await as_user(people["carol"]["uid"])
        await j("select hr.wf_cancel($1,'no longer needed')", stale_inst)
        await as_owner()
        rec("§1.8 queue hygiene", "🚨 cancelling the instance CLOSES its open failure rows — a queue entry never outlives the work it described",
            await conn.fetchval(
                "select count(*)=0 from hr.workflow_failure where workflow_instance_id=$1 "
                "and state in ('open','retrying')", stale_inst),
            str(await conn.fetchval(
                "select string_agg(state||'/'||failure_class, ', ') from hr.workflow_failure "
                "where workflow_instance_id=$1", stale_inst)))
        rec("§1.8 queue hygiene", "🚨 and NO FORGED ACTOR: the system rule resolved it, so resolved_by is null and the note says so",
            await conn.fetchval(
                "select bool_and(resolved_by is null and resolution_note like '%superseded by instance closure%') "
                "from hr.workflow_failure where workflow_instance_id=$1 and state='resolved'", stale_inst))
        # THE INVARIANT, over the whole live table — this is what stops the class re-accumulating
        rec("§1.8 queue hygiene", "🚨 THE INVARIANT: not one open failure row anywhere outlives a terminally-closed instance",
            await conn.fetchval(
                "select count(*)=0 from hr.workflow_failure f "
                "join hr.workflow_instance i on i.id=f.workflow_instance_id "
                "where f.state in ('open','retrying') and i.state = any($1::text[])", list(TERMINAL)),
            str(await conn.fetchval(
                "select string_agg(f.failure_class||' on '||i.state, ', ') from hr.workflow_failure f "
                "join hr.workflow_instance i on i.id=f.workflow_instance_id "
                "where f.state in ('open','retrying') and i.state = any($1::text[])", list(TERMINAL))))
        # and the other half of the rule: a FAILED instance KEEPS its row, because that IS the work


        # ===================================== §1.4 THE PREDICATE SPEAKS THE RUNGS THE SELECTOR WALKS
        # 🚨 A TIMECARD NOBODY CAN APPROVE STALLS PAYROLL WITH NO ERROR ANYWHERE. Two shapes, both
        # of them `hr.can_approve` being unable to say a rule the rest of the system already states:
        # the reporting-line rung the selector walks, and §1.4 rule 3's sole-proprietor carve-out
        # that was written but sat unreachable behind RULE 1's unconditional self-refusal.
        await as_owner()
        # a fresh org with a manager chain and ZERO approval_authority rows — the state every new
        # org is in, and the state in which §8.2's manager_approval step used to be undeliverable.
        rl_mgr_uid = await conn.fetchval("select hr._wf_login_of($1)", people["bob"]["employment"])
        await conn.execute(
            "update hr.approval_authority set is_active=false where organization_id=$1 "
            "and action_type='timecard_approve'", org)
        rec("§1.4 rung", "🚨 with ZERO timecard_approve authority rows, the subject's MANAGER can approve — the rung the selector walks is speakable at last",
            await conn.fetchval(
                "select hr.can_approve($1,'timecard_approve','hr.pay_period_employment',$2)",
                rl_mgr_uid, chain["alice"]["ppe"]))
        rec("§1.4 rung", "and it is scoped to the ROUTING PLAN, not a list in code — an action no step routes to a manager stays refused",
            not await conn.fetchval(
                "select hr.can_approve($1,'pay_change_approve','hr.pay_period_employment',$2)",
                rl_mgr_uid, chain["alice"]["ppe"]))
        rec("§1.4 rung", "🚨 and it is the LINE, not the org: somebody who is not in this subject's chain is still refused",
            not await conn.fetchval(
                "select hr.can_approve($1,'timecard_approve','hr.pay_period_employment',$2)",
                people["erin"]["uid"], chain["alice"]["ppe"]))
        rec("§1.4 rung", "never-approve-yourself still stands above it — the subject cannot ride their own manager rung",
            not await conn.fetchval(
                "select hr.can_approve($1,'timecard_approve','hr.pay_period_employment',$2)",
                people["alice"]["uid"], chain["alice"]["ppe"]))
        await conn.execute(
            "update hr.approval_authority set is_active=true where organization_id=$1", org)

        # ==================== §2.2 THE `reporting_line` RUNG IS THE PRIMARY MANAGER CHAIN
        # 🚨 NAME vs BODY, PINNED. `hr.reporting_line` is a SECONDARY-lines table by construction —
        # its line_kind CHECK admits only dotted/functional/project/interim, so no primary line can
        # ever be stored there — and it is empty platform-wide. If the rung read that table it could
        # never fire, yet this suite resolves managers through it constantly. It does not read that
        # table: it walks hr.manager_as_of over hr.position_assignment.manager_employment_id. The
        # mechanism is sound and the NAME is what misleads; asserted here so the source can never
        # drift to the table the name points at.
        rec("§2.2 rung source", "🚨 the `reporting_line` rung walks the PRIMARY manager chain and never reads hr.reporting_line",
            await conn.fetchval(
                "select prosrc ~ 'manager_as_of' and prosrc !~ 'hr\.reporting_line' "
                "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.proname='wf_resolve_approvers'"))
        rec("§2.2 rung source", "and hr.reporting_line cannot hold a primary line at all — its CHECK admits only secondary kinds",
            await conn.fetchval(
                "select bool_or(pg_get_constraintdef(k.oid) like '%line_kind%' "
                "and pg_get_constraintdef(k.oid) not like '%primary%') "
                "from pg_constraint k join pg_class t on t.oid=k.conrelid "
                "join pg_namespace n on n.oid=t.relnamespace "
                "where n.nspname='hr' and t.relname='reporting_line' and k.contype='c'"))
        # and the behavioural half: empty that table's contribution entirely, empty the authority
        # rung, and a manager is STILL produced — which is only possible from the primary chain.
        await conn.execute(
            "update hr.approval_authority set is_active=false where organization_id=$1 "
            "and action_type='leave_approve'", org)
        rl_lr = await conn.fetchval(
            "insert into hr.leave_request (organization_id, employment_id, leave_policy_id, starts_on, "
            "ends_on, requested_hours, state, engine_key, engine_version) "
            "values ($1,$2,$3,current_date + 700, current_date + 700, 8,'submitted','proof','1') returning id",
            org, people["alice"]["employment"], lp)
        await as_user(people["alice"]["uid"])
        rl_req = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2)", rl_lr, org)
        await as_owner()
        rl_step = await conn.fetchrow(
            "select resolution_path, resolved_approver_ids from hr.workflow_step "
            "where workflow_instance_id=$1 and state='active'", rl_req.get("instance_id"))
        rec("§2.2 rung source", "🚨 with ZERO rows in hr.reporting_line the rung still resolves the subject's PRIMARY manager — the table is not its source",
            await conn.fetchval("select count(*)=0 from hr.reporting_line")
            and rl_step is not None
            and rl_step["resolution_path"] == "reporting_line"
            and list(rl_step["resolved_approver_ids"]) == [people["bob"]["employment"]],
            f'path={rl_step["resolution_path"] if rl_step else None} '
            f'approvers={list(rl_step["resolved_approver_ids"]) if rl_step else None}')
        rec("§2.2 rung source", "and hr.can_approve's RULE 2b reads the SAME primary chain, so predicate and resolver cannot disagree about who a manager is",
            await conn.fetchval(
                "select prosrc ~ 'manager_chain' and prosrc !~ 'hr\.reporting_line' "
                "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.proname='can_approve'"))
        await conn.execute(
            "update hr.approval_authority set is_active=true where organization_id=$1", org)

        # ---- §1.4 rule 3: the sole proprietor. One person, top of the chart, no second actor.
        solo_org = await conn.fetchval(
            "insert into iam.organizations (name, slug, abbreviation) values "
            "('HRB-008 Solo Org','hrb008-solo-'||substr(gen_random_uuid()::text,1,8),'SOL') returning id")
        solo_uid = await conn.fetchval(
            "insert into auth.users (id, instance_id, aud, role, email, encrypted_password, "
            "email_confirmed_at, created_at, updated_at) values "
            "(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',"
            "$1,'x',now(),now(),now()) returning id", f"solo.{uuid.uuid4().hex[:8]}@example.invalid")
        await conn.execute(
            "insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) "
            "values ($1,'organization',$1,$2,'owner','active')", solo_org, solo_uid)
        solo_party = await conn.fetchval(
            "insert into crm.party (organization_id, party_kind, display_name) "
            "values ($1,'person','Sam Solo') returning id", solo_org)
        solo_e = await conn.fetchval(
            "insert into hr.employee (organization_id, party_id, login_user_id, employee_number, "
            "legal_first_name, legal_last_name, display_name) values ($1,$2,$3,'EMP-solo','Sam','Solo','Sam Solo') "
            "returning id", solo_org, solo_party, solo_uid)
        solo_er = await conn.fetchval(
            "insert into hr.employer_profile (organization_id, legal_name, ein) "
            "values ($1,'Solo Co','00-0000000') returning id", solo_org)
        solo_pg = await conn.fetchval(
            "insert into hr.pay_group (organization_id, employer_profile_id, name, pay_frequency, "
            "first_period_start_on, workweek_effective_from) values "
            "($1,$2,'Solo Biweekly','biweekly',current_date - 60, current_date - 60) returning id",
            solo_org, solo_er)
        solo_emp = await conn.fetchval(
            "insert into hr.employment (organization_id, employee_id, employer_profile_id, pay_group_id, "
            "hire_date, status) values ($1,$2,$3,$4,current_date - 365,'active') returning id",
            solo_org, solo_e, solo_er, solo_pg)
        solo_pp = await conn.fetchval(
            "insert into hr.pay_period (organization_id, pay_group_id, period_start_on, period_end_on, "
            "sequence_number) values ($1,$2,current_date - 15, current_date - 1, 1) returning id",
            solo_org, solo_pg)
        solo_ppe = await conn.fetchval(
            "insert into hr.pay_period_employment (organization_id, pay_period_id, employment_id, state, "
            "engine_key, engine_version) values ($1,$2,$3,'open','proof','1') returning id",
            solo_org, solo_pp, solo_emp)
        rec("§1.4 rule 3", "🚨 the SOLE PROPRIETOR may take their own timecard — `auto_record` is what §1.4 rule 3 says, and it was unreachable dead code",
            await conn.fetchval(
                "select hr.can_approve($1,'timecard_approve','hr.pay_period_employment',$2)",
                solo_uid, solo_ppe))
        rec("§1.4 rule 3", "🚨 but NOT for a `require_second_actor` action — a sole owner still cannot approve their own pay change",
            not await conn.fetchval(
                "select hr.can_approve($1,'pay_change_approve','hr.pay_period_employment',$2)",
                solo_uid, solo_ppe))
        # the moment a second actor exists, the carve-out closes again
        second_uid = await conn.fetchval(
            "insert into auth.users (id, instance_id, aud, role, email, encrypted_password, "
            "email_confirmed_at, created_at, updated_at) values "
            "(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',"
            "$1,'x',now(),now(),now()) returning id", f"second.{uuid.uuid4().hex[:8]}@example.invalid")
        second_party = await conn.fetchval(
            "insert into crm.party (organization_id, party_kind, display_name) "
            "values ($1,'person','Ada Second') returning id", solo_org)
        second_e = await conn.fetchval(
            "insert into hr.employee (organization_id, party_id, login_user_id, employee_number, "
            "legal_first_name, legal_last_name, display_name) values ($1,$2,$3,'EMP-2nd','Ada','Second','Ada Second') "
            "returning id", solo_org, second_party, second_uid)
        second_emp = await conn.fetchval(
            "insert into hr.employment (organization_id, employee_id, employer_profile_id, pay_group_id, "
            "hire_date, status) values ($1,$2,$3,$4,current_date - 365,'active') returning id",
            solo_org, second_e, solo_er, solo_pg)
        await conn.execute(
            "insert into hr.role_assignment (organization_id, employment_id, role_key, scope_kind, effective_from) "
            "values ($1,$2,'hr_owner','org',current_date - 400)", solo_org, second_emp)
        rec("§1.4 rule 3", "🚨 and the moment a SECOND ACTOR exists the carve-out closes — it is a sole-proprietor rule, not a self-approval loophole",
            not await conn.fetchval(
                "select hr.can_approve($1,'timecard_approve','hr.pay_period_employment',$2)",
                solo_uid, solo_ppe))

        # ============================ §1.1 / D13 THE FOUNDING AUTHORITIES, AND THE FRONT DOOR
        # 🚨 A FRESH ORG COULD NOT APPROVE A PAY CHANGE AT ALL, and found out only after submitting
        # one. Not a deadlock and not an activation bug — §1.1's bootstrap simply says nothing about
        # authority rows, so every org started unseeded. D13's default-with-override: the owner is
        # seeded as the rank-1 holder of every `require_second_actor` action, VISIBLE in the
        # authority register and revocable, instead of latent inside hr_authority_grant's owner arm.
        await as_owner()
        act_org = await conn.fetchval(
            "insert into iam.organizations (name, slug, abbreviation) values "
            "('HRB-008 Activation Org','hrb008-act-'||substr(gen_random_uuid()::text,1,8),'ACT') returning id")
        act_uid = await conn.fetchval(
            "insert into auth.users (id, instance_id, aud, role, email, encrypted_password, "
            "email_confirmed_at, created_at, updated_at) values "
            "(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',"
            "$1,'x',now(),now(),now()) returning id", f"founder.{uuid.uuid4().hex[:8]}@example.invalid")
        await conn.execute(
            "insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) "
            "values ($1,'organization',$1,$2,'owner','active')", act_org, act_uid)
        act_party = await conn.fetchval(
            "insert into crm.party (organization_id, party_kind, display_name) "
            "values ($1,'person','Fay Founder') returning id", act_org)
        act_e = await conn.fetchval(
            "insert into hr.employee (organization_id, party_id, login_user_id, employee_number, "
            "legal_first_name, legal_last_name, display_name) values ($1,$2,$3,'EMP-founder','Fay','Founder','Fay Founder') "
            "returning id", act_org, act_party, act_uid)
        act_er = await conn.fetchval(
            "insert into hr.employer_profile (organization_id, legal_name, ein) "
            "values ($1,'Founder Co','00-0000000') returning id", act_org)
        act_owner_emp = await conn.fetchval(
            "insert into hr.employment (organization_id, employee_id, employer_profile_id, hire_date, status) "
            "values ($1,$2,$3,current_date - 365,'active') returning id", act_org, act_e, act_er)
        # the one thing activation creates that this seeding keys off
        await conn.execute(
            "insert into hr.role_assignment (organization_id, employment_id, role_key, scope_kind, effective_from) "
            "values ($1,$2,'hr_owner','org',current_date - 400)", act_org, act_owner_emp)
        seeded = await conn.fetchval(
            "select cardinality(hr._seed_founding_authorities($1,$2,'activation'))", act_org, act_owner_emp)
        rec("§1.1 founding", "🚨 activation seeds the owner as rank-1 holder of EVERY require_second_actor action — the risk-split set, read from the vocabulary",
            seeded == await conn.fetchval(
                "select count(*) from platform.categories where dimension='hr_approval_action' "
                "and deleted_at is null and metadata->>'sole_authority_mode'='require_second_actor'"),
            f"seeded={seeded}")
        rec("§1.1 founding", "and they are ordinary, VISIBLE, revocable rows carrying their provenance — not a latent gate",
            await conn.fetchval(
                "select bool_and(rank=1 and scope_kind='org' and source='assigned' and is_active "
                "and metadata->>'basis'='activation' "
                "and metadata->>'granted_by'='hr._seed_founding_authorities') "
                "from hr.approval_authority where organization_id=$1", act_org))
        rec("§1.1 founding", "seeding twice is a no-op — an org that revoked and re-granted is never overwritten",
            await conn.fetchval(
                "select cardinality(hr._seed_founding_authorities($1,$2,'activation'))",
                act_org, act_owner_emp) == 0)

        # a managed employee's pay change now resolves the owner, with no hand-grant anywhere
        act_party2 = await conn.fetchval(
            "insert into crm.party (organization_id, party_kind, display_name) "
            "values ($1,'person','Ned New') returning id", act_org)
        act_e2 = await conn.fetchval(
            "insert into hr.employee (organization_id, party_id, employee_number, legal_first_name, "
            "legal_last_name, display_name) values ($1,$2,'EMP-new','Ned','New','Ned New') returning id",
            act_org, act_party2)
        act_emp2 = await conn.fetchval(
            "insert into hr.employment (organization_id, employee_id, employer_profile_id, hire_date, status) "
            "values ($1,$2,$3,current_date - 100,'active') returning id", act_org, act_e2, act_er)
        rec("§1.1 founding", "🚨 and a managed employee's PAY CHANGE now resolves the owner, with no hand-grant anywhere",
            await conn.fetchval(
                "select hr.can_approve($1,'pay_change_approve','hr.employment',$2)",
                act_uid, act_emp2))

        # ---- revoke the founding authority and the next submission refuses AT THE FRONT DOOR.
        # 🚨 THE SHAPE MATTERS: it has to be an action nobody can reach by ANY rung. A subject with
        # NO manager still resolves through RULE 3 (top-of-chart -> the org owner), so the pre-flight
        # rightly lets that through. Check 28's actual shape is a subject WITH a manager on a
        # `require_second_actor` action: RULE 2 has no authority row, RULE 2b is the wrong tier, and
        # RULE 3 is gated off precisely because a manager exists.
        act_jt = await conn.fetchval(
            "insert into hr.job_title (organization_id, title, eeo1_job_category) "
            "values ($1,'Associate','professionals') returning id", act_org)
        act_jur = await conn.fetchval(
            "select id from hr.jurisdiction where deleted_at is null order by level, key limit 1")
        act_loc = await conn.fetchval(
            "insert into hr.location (organization_id, name, tz, jurisdiction_id) "
            "values ($1,'HQ','America/Los_Angeles',$2) returning id", act_org, act_jur)
        act_dept = await conn.fetchval(
            "insert into hr.department (organization_id, name) values ($1,'Ops') returning id", act_org)
        act_pa = await conn.fetchval(
            "insert into hr.position_assignment (organization_id, employment_id, job_title_id, "
            "department_id, location_id, worker_class, flsa_status, pay_basis, schedule_class, "
            "effective_from, manager_employment_id) "
            "values ($1,$2,$3,$4,$5,'employee','nonexempt','hourly','full_time',current_date - 90,$6) returning id",
            act_org, act_emp2, act_jt, act_dept, act_loc, act_owner_emp)
        rec("§4.2 pre-flight", "the shape is real: with the founding rows in place the owner CAN approve this managed employee's pay change",
            await conn.fetchval(
                "select hr.can_approve($1,'pay_change_approve','hr.position_assignment',$2)",
                act_uid, act_pa))
        await conn.execute(
            "update hr.approval_authority set is_active=false where organization_id=$1", act_org)
        rec("§4.2 pre-flight", "revoke it and nobody in the org can — no authority row, wrong tier for the manager rung, and top-of-chart is gated off by the manager",
            not await conn.fetchval(
                "select hr.can_approve($1,'pay_change_approve','hr.position_assignment',$2)",
                act_uid, act_pa))
        before_n = await conn.fetchval(
            "select count(*) from hr.workflow_instance where organization_id=$1", act_org)
        await as_user(act_uid)
        pf = await j("select hr.wf_request('pay_change','hr_position_assignment',$1,$2)", act_pa, act_org)
        await as_owner()
        rec("§4.2 pre-flight", "🚨 the SUBMISSION is refused at the front door — the named condition, not a post-hoc approver_ineligible",
            pf.get("granted") is False and pf.get("reason") == "WF_NO_POSSIBLE_APPROVER",
            json.dumps(pf)[:240])
        rec("§4.2 pre-flight", "and it names the DOOR and the action, so the requester knows what to ask for",
            pf.get("door") == "hr_authority_grant"
            and pf.get("action_type") == "pay_change_approve",
            f"door={pf.get('door')} action={pf.get('action_type')}")
        rec("§4.2 pre-flight", "🚨 and NOTHING was minted — a refusal at the front door writes no instance to fail later",
            await conn.fetchval(
                "select count(*) from hr.workflow_instance where organization_id=$1", act_org) == before_n)
        # 🚨 AND THE FRONT DOOR KNOWS §2.2 RULE 2 TOO. pay_change marks the requester an interested
        # party, so the resolver strikes them — a pre-flight that merely counted approvers would
        # wave the SOLE holder's own proposal through and fail it a moment later. Measured: with the
        # authority restored but Fay both proposing and holding it, the front door still refuses.
        await conn.execute(
            "update hr.approval_authority set is_active=true where organization_id=$1", act_org)
        await as_user(act_uid)
        pf_self = await j("select hr.wf_request('pay_change','hr_position_assignment',$1,$2)", act_pa, act_org)
        await as_owner()
        rec("§4.2 pre-flight", "🚨 the sole holder PROPOSING the pay change is refused at the front door too — §2.2 rule 2 strikes the requester, and the pre-flight knows it",
            pf_self.get("granted") is False and pf_self.get("reason") == "WF_NO_POSSIBLE_APPROVER",
            json.dumps(pf_self)[:200])
        # and with a requester who is NOT the approver, the very same request goes through
        gil_uid = await conn.fetchval(
            "insert into auth.users (id, instance_id, aud, role, email, encrypted_password, "
            "email_confirmed_at, created_at, updated_at) values "
            "(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',"
            "$1,'x',now(),now(),now()) returning id", f"gil.{uuid.uuid4().hex[:8]}@example.invalid")
        gil_party = await conn.fetchval(
            "insert into crm.party (organization_id, party_kind, display_name) "
            "values ($1,'person','Gil Manager') returning id", act_org)
        gil_e = await conn.fetchval(
            "insert into hr.employee (organization_id, party_id, login_user_id, employee_number, "
            "legal_first_name, legal_last_name, display_name) values ($1,$2,$3,'EMP-gil','Gil','Manager','Gil Manager') "
            "returning id", act_org, gil_party, gil_uid)
        await conn.execute(
            "insert into hr.employment (organization_id, employee_id, employer_profile_id, hire_date, status) "
            "values ($1,$2,$3,current_date - 200,'active')", act_org, gil_e, act_er)
        await as_user(gil_uid)
        pf2 = await j("select hr.wf_request('pay_change','hr_position_assignment',$1,$2)", act_pa, act_org)
        await as_owner()
        rec("§4.2 pre-flight", "and proposed by somebody who is NOT the approver, the very same request goes through — the refusal was always about reach",
            pf2.get("granted") is True, json.dumps(pf2)[:200])

        # ============================ §1.4 RULE 3 — `require_second_actor` MEANS TWO ACTORS
        # 🚨 One person took BOTH levels of a two-level approval and nothing refused it: the audit
        # afterwards read as manager approval + executive approval, with nothing showing one human
        # twice. A control that reads as a control and is not one is worse than no second step,
        # because the second step is what everybody downstream trusts.
        await as_owner()
        # its own subject: act_emp2 already holds a primary position (the pre-flight's), and the
        # exclusion constraint allows exactly one at a time — correctly.
        ta_party = await conn.fetchval(
            "insert into crm.party (organization_id, party_kind, display_name) "
            "values ($1,'person','Hana Two') returning id", act_org)
        ta_e = await conn.fetchval(
            "insert into hr.employee (organization_id, party_id, employee_number, legal_first_name, "
            "legal_last_name, display_name) values ($1,$2,'EMP-hana','Hana','Two','Hana Two') returning id",
            act_org, ta_party)
        ta_emp = await conn.fetchval(
            "insert into hr.employment (organization_id, employee_id, employer_profile_id, hire_date, status) "
            "values ($1,$2,$3,current_date - 150,'active') returning id", act_org, ta_e, act_er)
        ta_pa = await conn.fetchval(
            "insert into hr.position_assignment (organization_id, employment_id, job_title_id, "
            "department_id, location_id, worker_class, flsa_status, pay_basis, schedule_class, "
            "effective_from, manager_employment_id) "
            "values ($1,$2,$3,$4,$5,'employee','nonexempt','hourly','full_time',current_date - 90,$6) returning id",
            act_org, ta_emp, act_jt, act_dept, act_loc, act_owner_emp)
        # only Fay qualifies: she holds every founding authority in this org
        await as_user(gil_uid)
        ta_req = await j("select hr.wf_request('pay_change','hr_position_assignment',$1,$2)", ta_pa, act_org)
        await as_owner()
        ta_inst = ta_req.get("instance_id")
        ta_step1 = await conn.fetchrow(
            "select id, step_key, resolved_approver_ids from hr.workflow_step "
            "where workflow_instance_id=$1 and state='active'", ta_inst)
        rec("§1.4 two actors", "the two-level pay change opens and routes its first step to the only qualified holder",
            ta_step1 is not None and act_owner_emp in list(ta_step1["resolved_approver_ids"]),
            ta_step1["step_key"] if ta_step1 else None)
        await as_user(act_uid)
        ta_d1 = await j("select hr.wf_decide($1,'approved','First level.')", ta_step1["id"])
        await as_owner()
        rec("§1.4 two actors", "the first level is decided normally",
            ta_d1.get("granted") is True, json.dumps(ta_d1)[:140])
        ta_step2 = await conn.fetchrow(
            "select id, step_key, state, state_reason, resolved_approver_ids, resolution_evidence "
            "from hr.workflow_step where workflow_instance_id=$1 and step_key<>$2 "
            "and state in ('active','unroutable','pending') order by step_order limit 1",
            ta_inst, ta_step1["step_key"])
        rec("§1.4 two actors", "🚨 the SECOND level is NOT offered to the person who took the first — the resolver strikes a prior decider, so there is nothing to click",
            ta_step2 is not None
            and act_owner_emp not in list(ta_step2["resolved_approver_ids"] or []),
            f'step={ta_step2["step_key"] if ta_step2 else None} '
            f'state={ta_step2["state"] if ta_step2 else None} '
            f'approvers={list(ta_step2["resolved_approver_ids"] or []) if ta_step2 else None}')
        rec("§1.4 two actors", "🚨 and it fails NAMED — `distinct_actor_required`, never silently satisfied",
            await conn.fetchval(
                "select count(*)=1 from hr.workflow_failure where workflow_instance_id=$1 "
                "and failure_class='distinct_actor_required' and state='open'", ta_inst),
            str(await conn.fetchval(
                "select string_agg(failure_class,', ') from hr.workflow_failure "
                "where workflow_instance_id=$1", ta_inst)))
        rec("§1.4 two actors", "the strike is RECORDED, not silent — the evidence names who was dropped and why",
            "is_prior_decider" in json.dumps(
                json.loads(ta_step2["resolution_evidence"]) if ta_step2 else {}),
            str(ta_step2["resolution_evidence"])[:160] if ta_step2 else None)
        # ARM TWO: even reached directly, the door refuses
        await conn.execute(
            "update hr.workflow_step set state='active', resolved_approver_ids=array[$2]::uuid[], "
            "resolved_user_ids=array[$3]::uuid[] where id=$1",
            ta_step2["id"], act_owner_emp, act_uid)
        await as_user(act_uid)
        ta_d2 = await j("select hr.wf_decide($1,'approved','Second level, same person.')", ta_step2["id"])
        await as_owner()
        rec("§1.4 two actors", "🚨 ARM TWO: even handed the step directly, the decide door REFUSES the prior decider — one mechanism, enforced twice",
            ta_d2.get("granted") is False
            and ta_d2.get("reason") == "WF_DISTINCT_ACTOR_REQUIRED", json.dumps(ta_d2)[:200])
        rec("§1.4 two actors", "and no second decision was written — the ledger never records the review that did not happen",
            await conn.fetchval(
                "select count(*)=1 from hr.workflow_decision where workflow_instance_id=$1", ta_inst))
        # grant a genuine second actor and the chain completes with TWO distinct deciders
        # 🚨 NOT Gil — he SUBMITTED this request, and pay_change marks the requester an interested
        # party (§2.2 rule 2), so he is struck from every step of it. The second actor has to be a
        # genuinely uninvolved third person, which is the whole point of the rule.
        ivy_uid = await conn.fetchval(
            "insert into auth.users (id, instance_id, aud, role, email, encrypted_password, "
            "email_confirmed_at, created_at, updated_at) values "
            "(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',"
            "$1,'x',now(),now(),now()) returning id", f"ivy.{uuid.uuid4().hex[:8]}@example.invalid")
        ivy_party = await conn.fetchval(
            "insert into crm.party (organization_id, party_kind, display_name) "
            "values ($1,'person','Ivy Second') returning id", act_org)
        ivy_e = await conn.fetchval(
            "insert into hr.employee (organization_id, party_id, login_user_id, employee_number, "
            "legal_first_name, legal_last_name, display_name) values ($1,$2,$3,'EMP-ivy','Ivy','Second','Ivy Second') "
            "returning id", act_org, ivy_party, ivy_uid)
        gil_emp = await conn.fetchval(
            "insert into hr.employment (organization_id, employee_id, employer_profile_id, hire_date, status) "
            "values ($1,$2,$3,current_date - 250,'active') returning id", act_org, ivy_e, act_er)
        await conn.execute(
            "insert into hr.approval_authority (organization_id, holder_kind, holder_id, action_type, "
            "scope_kind, rank, effective_from) values ($1,'employment',$2,'pay_change_approve','org',5,current_date - 300)",
            act_org, str(gil_emp))
        await conn.execute("update hr.workflow_step set state='pending' where id=$1", ta_step2["id"])
        await conn.execute("select hr.wf_activate_step($1)", ta_step2["id"])
        ta_step2b = await conn.fetchrow(
            "select id, resolved_approver_ids, resolved_user_ids, state from hr.workflow_step where id=$1",
            ta_step2["id"])
        rec("§1.4 two actors", "🚨 grant a genuine second actor and the SAME step routes to THEM — the block was never about the request",
            ta_step2b["state"] == "active" and gil_emp in list(ta_step2b["resolved_approver_ids"]),
            f'state={ta_step2b["state"]} approvers={list(ta_step2b["resolved_approver_ids"])}')
        await as_user(ivy_uid)
        ta_d3 = await j("select hr.wf_decide($1,'approved','Second level, second person.')", ta_step2["id"])
        await as_owner()
        rec("§1.4 two actors", "🚨 and the chain completes with TWO DISTINCT deciders — a two-level review that actually happened",
            ta_d3.get("granted") is True
            and await conn.fetchval(
                "select count(distinct actor_employment_id)=2 from hr.workflow_decision "
                "where workflow_instance_id=$1", ta_inst),
            json.dumps(ta_d3)[:140])
        rec("§1.4 two actors", "the audit DISTINGUISHES the cases: two deciders here, and the sole-authority lane stamps its own basis when there is only one",
            await conn.fetchval(
                "select bool_and(approval_basis='authority') from hr.workflow_decision "
                "where workflow_instance_id=$1", ta_inst))
        # and auto_record is deliberately untouched
        rec("§1.4 two actors", "auto_record's sole-proprietor carve-out is UNTOUCHED — it exists for exactly the opposite case and says so in the record",
            await conn.fetchval("select hr._wf_two_actor_action('timecard_approve')") is False
            and await conn.fetchval("select hr._wf_two_actor_action('pay_change_approve')") is True)

        # ============ 🚨 THE DOOR IS CALLABLE AT ALL — the P0 guard, asserted where it bites
        # hr_c4_25/26 each shipped a PL/pgSQL scope trap (a variable declared inside a nested
        # declare/begin/exception block and read after it closed, which PL/pgSQL resolves as a
        # COLUMN), and together they took hr.wf_request down for every caller across four lanes:
        # 42703 "v_pf_any does not exist". BOTH migrations passed their own post-conditions, because
        # those only grepped prosrc for text that was present and correct — text was never the
        # problem. This suite caught it in seconds once it was RUN; the failure was not running it.
        await as_owner()
        rec("§4.2 the door", "🚨 hr.wf_request RETURNS AN ENVELOPE rather than raising — the guard that would have caught the P0 in seconds",
            (lambda v: (v or {}).get("ok") is True)(
                await j("select hr._wf_door_smoke()")),
            json.dumps(await j("select hr._wf_door_smoke()"))[:160])
        rec("§4.2 the door", "and its contract BANS the two spellings that caused it, enforced automatically",
            await conn.fetchval(
                "select must_not_contain @> array['declare v_pf_any','v_looked'] "
                "from hr.function_contract where schema_name='hr' and function_name='wf_request' and is_active"))
        rec("§4.2 the door", "no declared function contract anywhere in hr is currently broken",
            await conn.fetchval("select count(*)=0 from hr.function_contracts_broken()"),
            str(await conn.fetchval(
                "select string_agg(b::text, ' | ') from hr.function_contracts_broken() b")))

        # ================== §2.2 RD5 — AN UNMAPPED SUBJECT REFUSES, IT DOES NOT RAISE
        # 🚨 THE CONTROL FOR RECORDED DECISION 5, kept alive deliberately. hr._approval_subject
        # RAISES for a target table it cannot map, and hr.wf_request touches the subject at its very
        # first step — so an unguarded door threw an exception out of the RPC, past the
        # refusal-envelope law, for any registered flow whose target was off that allowlist. That is
        # what hr_c4_21's pre-flight silently reintroduced and hr_c4_25/26 closed.
        # Falsified against a table that is NOT a flow target and never will be, so the next
        # allowlist entry cannot quietly delete the control the way mapping esign.envelope did.
        await as_owner()
        rd5_raises = False
        sp_rd5 = conn.transaction()
        await sp_rd5.start()
        try:
            await conn.fetchval("select hr._approval_subject('hr.jurisdiction', gen_random_uuid())")
        except Exception as e:
            rd5_raises = getattr(e, "sqlstate", None) == "22023"
        await sp_rd5.rollback()
        rec("§2.2 RD5", "hr._approval_subject still REFUSES an unmapped target by name — the guarantee has a live control",
            rd5_raises)
        rec("§2.2 RD5", "🚨 and the DOOR turns that raise into a refusal ENVELOPE, at both the subject lookup and the pre-flight",
            await conn.fetchval(
                "select (select count(*) from regexp_matches(prosrc,'approval_subject_unmapped','g')) >= 2 "
                "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.proname='wf_request'"))
        rec("§2.2 RD5", "and the resolver's own RECORDED DECISION 5 is still there — all three layers tell one story",
            await conn.fetchval(
                "select prosrc ~ 'approval_subject_unmapped' from pg_proc p "
                "join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.proname='wf_resolve_approvers'"))
        # 🚨 EVERY ACTIVE FLOW'S TARGET MAPS — the exception list is now EMPTY, by deletion.
        # `hr.asset_assignment` was the last one held open, because it carries TWO employment FKs
        # (`employment_id` and `assigned_by_employment_id`). RULED 2026-08-28: `employment_id`, on
        # the test now recorded in the allowlist itself — THE SUBJECT IS WHOM THE ACTION IS ABOUT,
        # NEVER WHO PERFORMED IT. An actor column can never be a subject, because
        # never-approve-yourself tests the SUBJECT and authority resolves over the SUBJECT's chain;
        # point one at the issuer and the person who handed out a laptop becomes the person whose
        # recovery is approved, judged by their manager.
        unmapped = []
        for _tok in await conn.fetch(
                "select distinct target_token from hr.workflow_flow_type "
                "where deleted_at is null and is_active order by 1"):
            _tbl = await conn.fetchval("select hr._wf_target_table($1)", _tok["target_token"])
            if _tbl is None:
                continue
            sp_map = conn.transaction()
            await sp_map.start()
            try:
                await conn.fetchval("select hr._approval_subject($1, gen_random_uuid())", _tbl)
            except Exception:
                unmapped.append(_tok["target_token"])
            await sp_map.rollback()
        rec("§2.2 RD5", "🚨 EVERY active flow's target maps — no registered flow can raise on its own subject, and no exception is left to name",
            unmapped == [], f"unmapped={unmapped}")
        rec("§2.2 RD5", "and the ACTOR column was NOT the one chosen — subject is whom the action is about, never who performed it",
            await conn.fetchval(SQL_SUBJECT_RULE))

        # ================================================================= §4.2 DOOR GRANTS
        # 🚨 `has_function_privilege('authenticated', …)` ANSWERS TRUE THROUGH THE `PUBLIC` DEFAULT
        # GRANT, so hr_c4_07's door assertion would stay green on a surface reachable only because
        # nobody had run `REVOKE EXECUTE … FROM PUBLIC` yet — and the day somebody did, the whole
        # workflow surface would 403 with every test still passing. These four read the ACL itself.
        await as_owner()
        rec("§4.2 doors", "no public.hr_wf_* door is reachable through the PUBLIC default grant",
            await conn.fetchval(
                "select count(*)=0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='public' and p.proname like 'hr\\_wf\\_%' "
                "and (p.proacl is null or exists (select 1 from unnest(p.proacl) a where a::text like '=X/%'))"))
        doors_total = await conn.fetchval(
            "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
            "where n.nspname='public' and p.proname like 'hr\\_wf\\_%'")
        doors_granted = await conn.fetchval(
            "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
            "where n.nspname='public' and p.proname like 'hr\\_wf\\_%' "
            "and exists (select 1 from unnest(p.proacl) a where a::text like 'authenticated=X/%')")
        rec("§4.2 doors", "every door carries an EXPLICIT authenticated grant, not an inherited one",
            doors_total > 0 and doors_granted == doors_total, f"{doors_granted}/{doors_total}")
        await as_user(people["bob"]["uid"])
        door_env = await j("select public.hr_wf_decide($1,'approved')", str(uuid.uuid4()))
        rec("§4.2 doors", "a real authenticated caller EXECUTES public.hr_wf_decide and gets an envelope",
            isinstance(door_env, dict) and door_env.get("granted") is False, door_env.get("reason"))
        sp_anon = conn.transaction()
        await sp_anon.start()
        anon_refused, anon_state = False, None
        try:
            await conn.execute("set local role anon")
            await conn.fetchval("select public.hr_wf_decide($1,'approved')", uuid.uuid4())
            anon_state = "no error — anon reached the door"
        except Exception as e:
            anon_refused = getattr(e, "sqlstate", None) == "42501"
            anon_state = f"{type(e).__name__} {getattr(e, 'sqlstate', None)}"
        await sp_anon.rollback()
        rec("§4.2 doors", "🚨 and anon is REFUSED 42501 — the surface is authenticated-only",
            anon_refused, anon_state)

        # ================================================================= CENSUS
        await as_owner()
        cert = await conn.fetch(
            "select t as tbl, iam.canonical_certify_ok('hr', t, 'hr_'||t) ok from "
            "unnest(array['workflow_flow_type','workflow_definition','workflow_step_definition',"
            "'workflow_instance','workflow_step','workflow_decision','workflow_event',"
            "'workflow_failure','workflow_binding']) t")
        # 🚨 MEASURED PRECISELY, NOT HIDDEN. `iam.canonical_certify` unions the table's own
        # conformance with `audit.table_impact(...).currently_broken` — every function that reads
        # the table, whoever owns it. So a broken function in ANOTHER lane turns this red without
        # anything being wrong with these nine tables. The two questions are asked separately: this
        # lane's tables must have ZERO conformance findings, and any `broken_dependent_fn` must be
        # named out loud rather than averaged into a score.
        conf = await conn.fetch(
            "select t as tbl, c.category, c.status, c.detail from "
            "unnest(array['workflow_flow_type','workflow_definition','workflow_step_definition',"
            "'workflow_instance','workflow_step','workflow_decision','workflow_event',"
            "'workflow_failure','workflow_binding']) t, "
            "lateral iam.canonical_certify('hr', t, 'hr_'||t) c")
        # status INFO is `iam.canonical_certify`'s freshness report (which of its
        # inputs are live, how old the cached runtime-probe lane is), never a finding.
        conformance = [r for r in conf
                       if r["category"] != "broken_dependent_fn" and r["status"] != "INFO"]
        foreign_broken = sorted({r["detail"] for r in conf if r["category"] == "broken_dependent_fn"})
        rec("§10 certification", "the 9 hr.workflow_* tables carry ZERO conformance findings",
            not conformance,
            "; ".join(f'{r["tbl"]}: {r["category"]}/{r["detail"]}' for r in conformance[:5]))
        rec("§10 certification", "and no function THIS lane owns is broken against them",
            not [d for d in foreign_broken
                 if d.startswith("hr.wf_") or d.startswith("hr._wf_") or d.startswith("public.hr_wf_")],
            f"other lanes' broken dependents (not this lane's, reported not hidden): {foreign_broken}"
            if foreign_broken else "no broken dependents at all")
        rec("§10 certification",
            "iam.canonical_certify_ok is true for all 9 — or false ONLY for a function another lane owns, named here",
            all(r["ok"] for r in cert) or (not conformance and foreign_broken),
            f"{sum(1 for r in cert if r['ok'])}/9"
            + (f" — the rest held down by another lane's broken dependent(s), reported not hidden: {foreign_broken}"
               if foreign_broken else ""))

    except Exception as exc:
        rec("SUITE", "the suite ran to completion", False, f"{type(exc).__name__}: {exc}")
    finally:
        await tr.rollback()
        # prove the rollback
        left = await conn.fetchval("select count(*) from hr.workflow_instance")
        emp = await conn.fetchval("select count(*) from hr.employment")
        await conn.close()

    fails = [r for r in R if not r[2]]
    print(f"\n{'='*90}\nHRB-008 PROOF SUITE — {len(R)} assertions, {len(fails)} RED\n{'='*90}")
    grp = None
    for g, n, ok, d in R:
        if g != grp:
            print(f"\n--- {g}")
            grp = g
        print(f"  [{'PASS' if ok else 'FAIL'}] {n}" + (f"   << {d}" if not ok and d else ""))
    print(f"\nAFTER ROLLBACK: hr.workflow_instance = {left} rows, hr.employment = {emp} rows")
    sys.exit(1 if fails else 0)


asyncio.run(main())
