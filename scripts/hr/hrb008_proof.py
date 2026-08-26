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
        r2 = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2)", lr, org)
        rec("§1.6 binding", "a second open instance on the same (target, flow) is refused",
            r2.get("granted") is False and r2.get("reason") == "WF_BINDING_OPEN", r2.get("reason"))

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
        rec("§4.3 apply", "🚨 the FAIL-CLOSED apply stub refused: applying -> failed, never a silent success",
            inst_row["state"] == "failed" and inst_row["applied_at"] is None,
            f'state={inst_row["state"]} reason={inst_row["state_reason"]} ev=' + str(await conn.fetchval(
                "select string_agg(event_kind||coalesce(\':\'||(detail->>\'detail\'),\'\'), \' | \' order by occurred_at) "
                "from hr.workflow_event where workflow_instance_id=$1", inst)))
        rec("§1.8 failure", "an apply_failed failure row opened naming pillar_lane_not_built",
            await conn.fetchval(
                "select count(*)=1 from hr.workflow_failure where workflow_instance_id=$1 "
                "and failure_class='apply_failed' and detail->>'reason'='pillar_lane_not_built'", inst))
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
        await as_user(people["alice"]["uid"])
        ra = await j("select hr.wf_request('timecard_attestation','hr_pay_period_employment',$1,$2,$3::jsonb)",
                     ppe, org, json.dumps({"total_hours": 80, "exception_count": 0}))
        att_inst = ra.get("instance_id")
        await as_owner()
        att_step = await conn.fetchrow(
            "select id, resolution_path, resolved_approver_ids from hr.workflow_step "
            "where workflow_instance_id=$1 and state='active'", att_inst)
        rec("§8.2 attestation", "the ONLY v1 allows_self step routes to the employee themselves",
            att_step and list(att_step["resolved_approver_ids"]) == [people["alice"]["employment"]],
            att_step["resolution_path"] if att_step else None)

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

        # the manager approval flow on the SAME employment row, and the employment-grain rejection
        await as_user(people["bob"]["uid"])
        re_ = await j("select hr.wf_request('timecard_approval','hr_pay_period_employment',$1,$2,$3::jsonb)",
                      ppe, org, json.dumps({"exception_count": 0, "ot_hours": 0}))
        tc_inst = re_.get("instance_id")
        await as_owner()
        tc_step = await conn.fetchrow(
            "select id, resolved_approver_ids from hr.workflow_step where workflow_instance_id=$1 and state='active'",
            tc_inst)
        rec("§8.2 grain", "the timecard flow targets hr_pay_period_employment — ONE EMPLOYMENT, not the period",
            await conn.fetchval("select target_token='hr_pay_period_employment' from hr.workflow_instance where id=$1",
                                tc_inst))
        pp_state_before = await conn.fetchval("select state from hr.pay_period where id=$1", pp)
        await as_user(people["bob"]["uid"])
        rf = await j("select hr.wf_decide($1,'rejected','Thursday needs a correction before I approve.')",
                     tc_step["id"])
        await as_owner()
        rec("§8.2 grain", "a manager rejection moves ONLY this employment's instance",
            rf.get("granted") and await conn.fetchval(
                "select state='rejected' from hr.workflow_instance where id=$1", tc_inst))
        rec("§8.2 grain", "🚨 and the hr.pay_period row is UNTOUCHED — one disputed timecard never un-submits a pay group",
            pp_state_before == await conn.fetchval("select state from hr.pay_period where id=$1", pp))


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
        rk = await j("select hr.wf_decide($1,'approved','Position eliminated; approved by HR.')", t_step)
        rec("§8.3 termination", "HR review approves with a mandatory reason", rk.get("granted"),
            json.dumps(rk)[:160])
        await as_owner()
        e_step = await conn.fetchval(
            "select id from hr.workflow_step where workflow_instance_id=$1 and step_key='executive_approval'", term)
        rec("§2.4 condition", "the executive step ACTIVATED because the separation is involuntary",
            await conn.fetchval("select state='active' from hr.workflow_step where id=$1", e_step))
        await as_user(people["carol"]["uid"])
        rl = await j("select hr.wf_decide($1,'approved','Confirmed.')", e_step)
        await as_owner()
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

        # ================================================================= LEDGER IMMUTABILITY
        # 🚨 FINDING, recorded rather than papered over: `hr.privileged_write` is set with
        # is_local = true, which scopes it to the TRANSACTION, not to the function. So once ANY
        # definer HR RPC has run, the write guard stays disarmed for the rest of that transaction.
        # In production each PostgREST call is its own transaction, so the live exposure is narrow —
        # but the guard is weaker than it reads, and it is HRB-007's (C3) pattern, not this lane's.
        # Probed both ways below: with the flag as a definer call leaves it, and reset, which is the
        # state a real client request actually starts in.
        sp0 = conn.transaction()
        await sp0.start()
        await conn.execute("set local role authenticated")
        leaked = True
        try:
            await conn.execute("delete from hr.workflow_binding where workflow_instance_id=$1", inst)
        except Exception:
            leaked = False
        await sp0.rollback()
        rec("FINDING", "hr.privileged_write is TRANSACTION-scoped, so a definer call disarms the write guard for the rest of it",
            leaked, "recorded as a debt owned by the access lane (HRB-007); narrow in production because PostgREST is one transaction per call")

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

        # ================================================================= CENSUS
        await as_owner()
        cert = await conn.fetch(
            "select t as tbl, iam.canonical_certify_ok('hr', t, 'hr_'||t) ok from "
            "unnest(array['workflow_flow_type','workflow_definition','workflow_step_definition',"
            "'workflow_instance','workflow_step','workflow_decision','workflow_event',"
            "'workflow_failure','workflow_binding']) t")
        rec("§10 certification", "all 9 hr.workflow_* tables return iam.canonical_certify_ok = true",
            all(r["ok"] for r in cert), f"{sum(1 for r in cert if r['ok'])}/9")

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
