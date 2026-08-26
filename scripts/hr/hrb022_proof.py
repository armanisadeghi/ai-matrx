"""HRB-022 PROOF SUITE — the ONE HR task inbox (lane l10-inbox), proven live.

Run:  cd /Users/armanisadeghi/code/aidream && uv run python \
        /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb022_proof.py

Same discipline as scripts/hr/hrb008_proof.py, which this is modelled on: every assertion runs
against the LIVE platform Postgres, driven as REAL `authenticated` identities (real auth.users
rows, a real org, real hr.employee / hr.employment / authority / role rows), inside ONE
transaction that is ROLLED BACK. Nothing is mocked, nothing is asserted that is not measured,
and no assertion is allowed to pass only because the DB owner ran it.

Acceptance surface (migrations/hr_c4_07_inbox_doors.sql):
  A  the public doors exist and are the ONLY way in (`hr` is not on PostgREST)
  B  the inbox is the ONE queue and DECORATES hr.wf_pending rather than re-querying it
  C  the sensitivity split survives the projection            — target T-L10-5
  D  RECORDED DECISION 2's capability fix is real, both directions
  E  bulk is per-step and refuses where it should             — target T-L10-3
  F  scopes are server-side and refuse honestly
  G  no second inbox, no retired /hr/inbox path

Connection comes from the five SUPABASE_MATRIX_* variables in aidream/.env.
🚨 statement_cache_size=0 is required: the host is pgbouncer in transaction pooling mode.
"""
import asyncio, json, os, re, sys, uuid

import asyncpg
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")

DOORS = [
    "hr_wf_inbox", "hr_wf_instance", "hr_wf_for_target", "hr_wf_decide", "hr_wf_bulk_decide",
    "hr_wf_escalate", "hr_wf_reassign_step", "hr_wf_withdraw", "hr_wf_cancel", "hr_wf_resubmit",
    "hr_wf_record_result", "hr_wf_resolve_failure", "hr_wf_delegate",
]
DEEP_LINK_RE = re.compile(r"^/hr/tasks/[0-9a-f-]{36}\?step=[0-9a-f-]{36}$")
DECORATED = ["title", "flow_label", "step_label", "subject_label",
             "allow_bulk_decide", "workspace_task_id", "notices"]

R = []          # (group, name, ok, detail)
GAPS = []       # (name, why) — legs that could NOT be driven, named rather than skipped


def rec(group, name, ok, detail=""):
    R.append((group, name, bool(ok), str(detail)[:300]))


def gap(name, why):
    GAPS.append((name, str(why)[:300]))


def ids_of(rows):
    return {r.get("step_id") for r in (rows or [])}


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

    async def arm():
        """Re-arm the legacy write-guard literal for the NEXT statement.

        🚨 MEASURED, not assumed (probe below records it as an assertion): C3's hardened guard
        (migrations/hr_c3_00_write_guard.sql) added a statement-scoped token lane, and some hr
        writers now call `hr.arm_write()` mid-statement — `hr.employment`'s `_zzz_derive_grants`
        trigger does. That OVERWRITES the transaction-scoped `'on'` literal with a token keyed to
        `statement_timestamp()`, so the very next top-level statement sees a STALE token, matches
        neither lane, and is refused. Any fixture that writes hr.employment more than once in one
        transaction hits it. So every owner-side write re-arms immediately before it runs.
        """
        await conn.execute("select set_config('hr.privileged_write','on',true)")

    async def as_owner():
        await conn.execute("reset role")
        await conn.execute("select set_config('request.jwt.claims', '', true)")
        await arm()

    async def own(q, *a):
        await arm()
        return await conn.fetchval(q, *a)

    async def own_exec(q, *a):
        await arm()
        return await conn.execute(q, *a)

    async def j(q, *a):
        v = await conn.fetchval(q, *a)
        return json.loads(v) if isinstance(v, str) else v

    deep_links = []

    def harvest(env):
        """collect every deep_link the inbox handed back, for G19."""
        if not isinstance(env, dict):
            return env
        for key in ("needs_my_decision", "scope_rows"):
            for row in env.get(key) or []:
                if isinstance(row, dict) and row.get("deep_link"):
                    deep_links.append(row["deep_link"])
        return env

    # counts taken BEFORE a single fixture row exists — the rollback proof compares against these
    await as_owner()
    n_inst_before = await conn.fetchval("select count(*) from hr.workflow_instance")
    n_emp_before = await conn.fetchval("select count(*) from hr.employment")
    n_notif_before = await conn.fetchval("select count(*) from communication.notification")
    org = None
    n_obj_seen = [-1]     # how many event types were the wrong shape when the run started

    try:
        # ============================================================ A. THE DOORS
        # A1 — the doors exist BECAUSE hr is not reachable from the browser. If that ever changes,
        # this assertion goes red and the whole design decision needs re-reading.
        setcfg = await conn.fetchval(
            "select array_to_string(s.setconfig, e'\\n') from pg_db_role_setting s "
            "join pg_roles r on r.oid = s.setrole where r.rolname = 'authenticator'")
        pgrst_line = next((ln for ln in (setcfg or "").split("\n")
                           if ln.startswith("pgrst.db_schemas=")), None)
        exposed = [s.strip() for s in (pgrst_line or "").split("=", 1)[-1].split(",")] if pgrst_line else []
        rec("A doors", "`hr` is NOT in authenticator's pgrst.db_schemas — which is WHY the public doors exist",
            pgrst_line is not None and "hr" not in exposed,
            f"read {len(exposed)} exposed schemas; hr present={'hr' in exposed}"
            if pgrst_line else "no pgrst.db_schemas setting found on authenticator")

        # A2 — all 13 doors exist and every one of them is executable by `authenticated`
        for name in DOORS:
            row = await conn.fetchrow(
                "select p.oid, has_function_privilege('authenticated', p.oid, 'EXECUTE') ex "
                "from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
                "where n.nspname = 'public' and p.proname = $1", name)
            rec("A doors", f"public.{name} exists and authenticated holds EXECUTE",
                row is not None and row["ex"] is True,
                "missing" if row is None else f"execute={row['ex']}")
        # NOT an exact count of the family: sibling lanes legitimately add doors (hr_wf_request and
        # hr_wf_submit appeared mid-session). The stable invariant is that no door is left exposed
        # without the grant — an unreachable door is the failure this file exists to prevent.
        ungranted = [r["proname"] for r in await conn.fetch(
            "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
            "where n.nspname = 'public' and p.proname like 'hr\\_wf\\_%' "
            "and not has_function_privilege('authenticated', p.oid, 'EXECUTE')")]
        total_doors = await conn.fetchval(
            "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
            "where n.nspname = 'public' and p.proname like 'hr\\_wf\\_%'")
        rec("A doors", "no public.hr_wf_* door is exposed WITHOUT authenticated EXECUTE",
            not ungranted, f"{total_doors} doors live, ungranted={ungranted}")

        # ============================================================ FIXTURES — real identities
        org = await own(
            "insert into iam.organizations (name, slug, abbreviation) "
            "values ('HRB-022 Proof Org','hrb022-proof-'||substr(gen_random_uuid()::text,1,8),'HRB') returning id")

        people = {}
        for key, first, last in [("alice", "Alice", "Requester"), ("bob", "Bob", "Manager"),
                                 ("carol", "Carol", "Owner"), ("dave", "Dave", "Outsider")]:
            uid = await own(
                "insert into auth.users (id, instance_id, aud, role, email, encrypted_password, "
                "email_confirmed_at, created_at, updated_at) values "
                "(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',"
                "$1,'x',now(),now(),now()) returning id", f"{key}.hrb022@example.invalid")
            await own_exec(
                "insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) "
                "values ($1,'organization',$1,$2,$3,'active')", org, uid,
                'owner' if key == 'carol' else 'member')
            party = await own(
                "insert into crm.party (organization_id, party_kind, display_name) "
                "values ($1,'person',$2) returning id", org, f"{first} {last}")
            emp = await own(
                "insert into hr.employee (organization_id, party_id, login_user_id, employee_number, "
                "legal_first_name, legal_last_name, display_name) values ($1,$2,$3,$4,$5,$6,$7) returning id",
                org, party, uid, f"EMP-{key}", first, last, f"{first} {last}")
            people[key] = {"uid": uid, "employee": emp, "name": f"{first} {last}"}

        er = await own(
            "insert into hr.employer_profile (organization_id, legal_name, ein) "
            "values ($1,'HRB022 Proof Employer','00-0000000') returning id", org)
        jur = await conn.fetchval(
            "select id from hr.jurisdiction where deleted_at is null order by level, key limit 1")
        loc = await own(
            "insert into hr.location (organization_id, name, tz, jurisdiction_id) "
            "values ($1,'HQ','America/Los_Angeles',$2) returning id", org, jur)
        dept = await own(
            "insert into hr.department (organization_id, name) values ($1,'Operations') returning id", org)
        jt = await own(
            "insert into hr.job_title (organization_id, title, eeo1_job_category) "
            "values ($1,'Associate','professionals') returning id", org)
        pg = await own(
            "insert into hr.pay_group (organization_id, employer_profile_id, name, pay_frequency, "
            "first_period_start_on, workweek_effective_from) "
            "values ($1,$2,'Biweekly','biweekly',current_date - 30, current_date - 30) returning id", org, er)

        # 🚨 the finding the harness had to be built around, measured rather than asserted from
        # a comment: writing hr.employment leaves the write-guard flag holding a STALE
        # statement-scoped token, so a second hr.* write in the same transaction is refused
        # unless the caller re-arms. Recorded here as evidence for the C3/C4 guard owners.
        people["alice"]["employment"] = await own(
            "insert into hr.employment (organization_id, employee_id, employer_profile_id, "
            "pay_group_id, hire_date, status) values ($1,$2,$3,$4,current_date - 365,'active') returning id",
            org, people["alice"]["employee"], er, pg)
        flag_after = await conn.fetchval("select current_setting('hr.privileged_write', true)")
        stale_refused = False
        sp_probe = conn.transaction()
        await sp_probe.start()
        try:
            await conn.execute(
                "insert into hr.department (organization_id, name) values ($1,'Probe')", org)
        except Exception:
            stale_refused = True
        await sp_probe.rollback()
        rec("FINDING", "writing hr.employment overwrites the transaction-scoped write-guard literal "
                       "with a STALE statement-scoped token, refusing the next hr.* write until re-armed",
            flag_after not in ("on", "true", "1", "yes") and stale_refused,
            f"flag after the write = {flag_after!r}; next unarmed hr write refused = {stale_refused}. "
            "hr.employment's _zzz_derive_grants trigger calls hr.arm_write() (C3 hr_c3_00_write_guard.sql); "
            "any fixture writing hr.employment twice in one transaction hits it. Owned by the C3 access lane.")

        for key in ("bob", "carol", "dave"):
            people[key]["employment"] = await own(
                "insert into hr.employment (organization_id, employee_id, employer_profile_id, "
                "pay_group_id, hire_date, status) values ($1,$2,$3,$4,current_date - 365,'active') returning id",
                org, people[key]["employee"], er, pg)

        # the chart: alice -> bob -> carol ; dave -> carol (deliberately OUTSIDE bob's chain)
        pos = {}
        for key, mgr in [("alice", "bob"), ("bob", "carol"), ("dave", "carol")]:
            pos[key] = await own(
                "insert into hr.position_assignment (organization_id, employment_id, job_title_id, "
                "department_id, location_id, worker_class, flsa_status, pay_basis, schedule_class, "
                "effective_from, manager_employment_id) "
                "values ($1,$2,$3,$4,$5,'employee','nonexempt','hourly','full_time',current_date - 365,$6) "
                "returning id",
                org, people[key]["employment"], jt, dept, loc, people[mgr]["employment"])
        pos["carol"] = await own(
            "insert into hr.position_assignment (organization_id, employment_id, job_title_id, "
            "department_id, location_id, worker_class, flsa_status, pay_basis, schedule_class, effective_from) "
            "values ($1,$2,$3,$4,$5,'employee','nonexempt','salary','full_time',current_date - 365) returning id",
            org, people["carol"]["employment"], jt, dept, loc)

        # carol is the HR owner (the `hr_owner` builtin is what carries workflow.view_queue);
        # bob holds leave/timecard authority over his direct reports only.
        await own_exec(
            "insert into hr.role_assignment (organization_id, employment_id, role_key, scope_kind) "
            "values ($1,$2,'hr_owner','org')", org, people["carol"]["employment"])
        for act in ["leave_approve", "timecard_approve", "timecard_attest"]:
            await own_exec(
                "insert into hr.approval_authority (organization_id, holder_kind, holder_id, action_type, "
                "scope_kind, rank, effective_from) values ($1,'employment',$2,$3,'direct_reports',10,current_date - 300)",
                org, str(people["bob"]["employment"]), act)
        acts = [r["slug"] for r in await conn.fetch(
            "select slug from platform.categories where dimension='hr_approval_action' "
            "and deleted_at is null order by slug")]
        for act in acts:
            await own_exec(
                "insert into hr.approval_authority (organization_id, holder_kind, holder_id, action_type, "
                "scope_kind, rank, effective_from) values ($1,'employment',$2,$3,'org',90,current_date - 300)",
                org, str(people["carol"]["employment"]), act)

        lp = await own(
            "insert into hr.leave_policy (organization_id, name, leave_kind, accrual_method, accrual_rate) "
            "values ($1,'PTO','pto','unlimited',null) returning id", org)

        async def leave_row(emp, day):
            return await own(
                "insert into hr.leave_request (organization_id, employment_id, leave_policy_id, starts_on, "
                "ends_on, requested_hours, state, engine_key, engine_version) "
                "values ($1,$2,$3,current_date + $4::integer, current_date + $4::integer, 8,'submitted','proof','1') returning id",
                org, emp, lp, day)

        lr1 = await leave_row(people["alice"]["employment"], 30)
        lr2 = await leave_row(people["alice"]["employment"], 60)
        lr3 = await leave_row(people["alice"]["employment"], 90)
        lr_dave = await leave_row(people["dave"]["employment"], 45)
        rec("fixtures", "org, 4 real logins, chart, hr_owner role, authorities and targets created",
            True, f"org={org}")

        # ============================================== CROSS-LANE PRECONDITION, MEASURED
        # `communication.notification_event_type.default_channels` is a JSON OBJECT
        # ({"in_app": true}) and a CHECK constraint enforces that shape. hr._wf_notify originally
        # read it with `jsonb_array_elements_text`, which requires an ARRAY, so every hr.wf_submit
        # raised 22023 and the whole C4 engine was dead on submit — found by this suite at 23:27 and
        # fixed at source by the owning lane in hr_l10_02_notify_channel_readers.sql (23:33), which
        # routes every reader through hr._notify_channels(event_key, org) -> text[]. Asserted here
        # because the inbox's notice evidence depends on it: if it ever regresses, this goes red
        # BEFORE the inbox assertions confuse anyone about why.
        n_obj = await conn.fetchval(
            "select count(*) from communication.notification_event_type "
            "where deleted_at is null and jsonb_typeof(default_channels) = 'object'")
        n_obj_seen[0] = n_obj
        notify_src = await conn.fetchval(
            "select pg_get_functiondef('hr._wf_notify(uuid,uuid,text,text,uuid,uuid,jsonb)'::regprocedure)")
        rec("precondition", "hr._wf_notify reads default_channels in the OBJECT shape the column "
                            "actually holds — not the stale array reader that killed every submit",
            "jsonb_array_elements_text(v_channels)" not in notify_src
            and "_notify_channels" in notify_src,
            f"{n_obj} event types hold the object shape; reader = "
            + ("hr._notify_channels()" if "_notify_channels" in notify_src else "STALE ARRAY READER"))

        # the roster is read LIVE — no flow key or target token is invented here
        restricted = await conn.fetchrow(
            "select flow_key, label, target_token from hr.workflow_flow_type "
            "where deleted_at is null and is_active and sensitivity_tier = 'restricted' "
            "and target_token = 'hr_position_assignment' limit 1")
        if restricted is None:
            gap("C sensitivity split",
                "no ACTIVE restricted-tier flow whose target this fixture can build exists in "
                "hr.workflow_flow_type — the restricted leg could not be driven")

        # ============================================================ B. THE ONE QUEUE
        # B3 — a real request driven through wf_request(draft) + wf_submit, as the real employee
        await as_user(people["alice"]["uid"])
        draft = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2,$3::jsonb,null,true)",
                        lr1, org, json.dumps({"total_hours": 8, "notice_days": 30,
                                              "leave_type": "pto", "coverage_pct": 100}))
        leave1 = draft.get("instance_id")
        rec("B queue", "hr.wf_request opened a real draft instance on a target that actually exists",
            draft.get("granted") is True and draft.get("state") == "draft", json.dumps(draft)[:200])
        sub = await j("select hr.wf_submit($1)", leave1)
        rec("B queue", "hr.wf_submit routed the draft to an ACTIVE step",
            sub.get("granted") is True and sub.get("state") == "active", json.dumps(sub)[:200])

        await as_owner()
        lstep1 = await conn.fetchval(
            "select id from hr.workflow_step where workflow_instance_id=$1 and state='active'", leave1)
        rec("B queue", "the active step resolved to the manager who holds leave_approve",
            await conn.fetchval(
                "select resolved_user_ids @> array[$2]::uuid[] from hr.workflow_step where id=$1",
                lstep1, people["bob"]["uid"]))

        # B4 — the approver's own inbox, through the PUBLIC door, as the approver
        await as_user(people["bob"]["uid"])
        bob_mine = harvest(await j("select public.hr_wf_inbox('mine')"))
        rec("B queue", "public.hr_wf_inbox('mine') is granted for the approver",
            bob_mine.get("granted") is True, bob_mine.get("reason"))
        bob_rows = bob_mine.get("needs_my_decision") or []
        row1 = next((r for r in bob_rows if r.get("step_id") == str(lstep1)), None)
        rec("B queue", "needs_my_decision carries the step that is actually waiting on this approver",
            row1 is not None, f"{len(bob_rows)} row(s) returned")
        if row1 is not None:
            missing = [f for f in DECORATED if f not in row1]
            rec("B queue", "the row is DECORATED: title, flow_label, step_label, subject_label, "
                           "allow_bulk_decide, workspace_task_id, notices",
                not missing, f"missing={missing}" if missing else json.dumps(
                    {k: row1.get(k) for k in DECORATED})[:220])
            rec("B queue", "the decorated fields carry real values, not placeholders",
                bool(row1.get("title")) and bool(row1.get("flow_label"))
                and bool(row1.get("step_label")) and row1.get("workspace_task_id") is not None,
                f"title={row1.get('title')!r} task={row1.get('workspace_task_id')}")
            rec("B queue", "`notices` is the delivery/read evidence from hr.workflow_notice, not a copy",
                isinstance(row1.get("notices"), list) and len(row1["notices"]) > 0,
                json.dumps(row1.get("notices"))[:200])
        else:
            gap("B decorated fields", "the approver's step never appeared in needs_my_decision")

        # B5 — the door DECORATES: identical step-id set to the queue of record, same caller
        pending = await j("select hr.wf_pending()")
        p_ids = ids_of(pending.get("needs_my_decision"))
        i_ids = ids_of(bob_rows)
        rec("B queue", "🚨 the door's needs_my_decision step ids are EXACTLY hr.wf_pending's — "
                       "it adds fields, it never adds or drops rows",
            p_ids == i_ids and len(i_ids) > 0,
            f"door={sorted(i_ids)} pending={sorted(p_ids)}")

        # B6 — a colleague with no standing sees it nowhere at all
        await as_user(people["dave"]["uid"])
        dave_mine = harvest(await j("select public.hr_wf_inbox('mine')"))
        rec("B queue", "a colleague with no standing does not see that step ANYWHERE in their inbox",
            dave_mine.get("granted") is True and str(lstep1) not in json.dumps(dave_mine),
            f"granted={dave_mine.get('granted')} rows={len(dave_mine.get('needs_my_decision') or [])}")

        # ============================================================ C. THE SENSITIVITY SPLIT
        pay_step = None
        if restricted is not None:
            await as_user(people["bob"]["uid"])
            payr = await j("select hr.wf_request($1,$2,$3,$4,$5::jsonb)",
                           restricted["flow_key"], restricted["target_token"], pos["alice"], org,
                           json.dumps({"new_rate": 42.0}))
            await as_owner()
            pay_inst = payr.get("instance_id")
            pay_step = await conn.fetchval(
                "select id from hr.workflow_step where workflow_instance_id=$1 and state='active'",
                pay_inst) if pay_inst else None
            rec("C sensitivity", f"a restricted-tier instance ({restricted['flow_key']}) is open with an active step",
                payr.get("granted") is True and pay_step is not None, json.dumps(payr)[:220])

        if pay_step is not None:
            await as_user(people["carol"]["uid"])
            carol_mine = harvest(await j("select public.hr_wf_inbox('mine')"))
            prow = next((r for r in (carol_mine.get("needs_my_decision") or [])
                         if r.get("step_id") == str(pay_step)), None)
            rec("C sensitivity", "the restricted step reaches its approver's inbox at all",
                prow is not None, f"{len(carol_mine.get('needs_my_decision') or [])} row(s)")
            if prow is not None:
                title = prow.get("title") or ""
                rec("C sensitivity", "🚨 T-L10-5: the restricted-tier title ENDS WITH ' — 1 item'",
                    title.endswith(" — 1 item"), repr(title))
                rec("C sensitivity", "🚨 T-L10-5: the restricted-tier title names NO employee",
                    all(n not in title for n in
                        [people["alice"]["name"], "Alice", "Requester"]), repr(title))
                rec("C sensitivity", "subject_label is JSON null — redacted, not omitted",
                    "subject_label" in prow and prow["subject_label"] is None,
                    f"present={'subject_label' in prow} value={prow.get('subject_label')!r}")

                await as_owner()
                mirror = await conn.fetchval(
                    "select t.title from workspace.tasks t join hr.workflow_step s "
                    "on s.workspace_task_id = t.id where s.id = $1", pay_step)
                rec("C sensitivity", "🚨 the workspace.tasks mirror title is the IDENTICAL STRING — "
                                     "both surfaces read hr._wf_display",
                    mirror is not None and mirror == title,
                    f"inbox={title!r} mirror={mirror!r}")
                if mirror is None:
                    gap("C mirror comparison",
                        "no workspace.tasks row is linked to the restricted step (workspace_task_id null)")
        elif restricted is not None:
            gap("C restricted projection",
                "the restricted-tier instance did not produce an active step, so its title could not be read")

        # C9 — a NON-restricted instance carries the subject's display name, in both places
        if row1 is not None:
            await as_owner()
            mirror1 = await conn.fetchval(
                "select t.title from workspace.tasks t join hr.workflow_step s "
                "on s.workspace_task_id = t.id where s.id = $1", lstep1)
            rec("C sensitivity", "a NON-restricted title DOES carry the subject's display name",
                people["alice"]["name"] in (row1.get("title") or ""), repr(row1.get("title")))
            rec("C sensitivity", "and the mirror carries the IDENTICAL non-restricted string",
                mirror1 is not None and mirror1 == row1.get("title"),
                f"inbox={row1.get('title')!r} mirror={mirror1!r}")
            rec("C sensitivity", "subject_label on the non-restricted row is the subject, not null",
                row1.get("subject_label") == people["alice"]["name"], repr(row1.get("subject_label")))

        # ============================================================ D. RECORDED DECISION 2
        await as_owner()
        cap_carol = await conn.fetchval(
            "select hr.capability($1,'workflow.view_queue',$2)",
            people["carol"]["uid"], people["alice"]["employment"])
        cap_dave = await conn.fetchval(
            "select hr.capability($1,'workflow.view_queue',$2)",
            people["dave"]["uid"], people["alice"]["employment"])
        rec("D capability fix", "the capability predicate itself answers true for the holder and "
                                "false for the bystander, over the SAME employment",
            cap_carol is True and cap_dave is False, f"holder={cap_carol} bystander={cap_dave}")

        await as_user(people["carol"]["uid"])
        d_yes = harvest(await j("select public.hr_wf_inbox('mine',$1)", people["alice"]["employment"]))
        rec("D capability fix", "🚨 a holder of workflow.view_queue CAN read another person's queue "
                                "(the RECORDED DECISION 2 fix, proven)",
            d_yes.get("granted") is True,
            f"granted={d_yes.get('granted')} reason={d_yes.get('reason')}")
        rec("D capability fix", "and the queue it returns is scoped to that OTHER employment",
            (d_yes.get("employment_ids") or []) == [str(people["alice"]["employment"])],
            json.dumps(d_yes.get("employment_ids"))[:120])

        await as_user(people["dave"]["uid"])
        d_no = await j("select public.hr_wf_inbox('mine',$1)", people["alice"]["employment"])
        rec("D capability fix", "a caller WITHOUT the capability is refused with no_queue_authority — "
                                "a refusal, never someone else's rows",
            d_no.get("granted") is False and d_no.get("reason") == "no_queue_authority",
            f"granted={d_no.get('granted')} reason={d_no.get('reason')}")

        # ============================================================ F. SCOPES ARE SERVER-SIDE
        # (driven before E, because the bulk leg closes steps these scopes must still see)
        await as_user(people["dave"]["uid"])
        q_no = await j("select public.hr_wf_inbox('queue')")
        rec("F scopes", "🚨 the `queue` scope without workflow.view_queue REFUSES — it does not "
                        "return an empty list that reads as 'nothing is waiting'",
            q_no.get("granted") is False and q_no.get("reason") == "no_queue_authority",
            f"granted={q_no.get('granted')} reason={q_no.get('reason')} "
            f"rows={q_no.get('scope_rows')}")

        await as_user(people["carol"]["uid"])
        q_yes = harvest(await j("select public.hr_wf_inbox('queue')"))
        q_rows = q_yes.get("scope_rows") or []
        rec("F scopes", "the `queue` scope WITH the capability returns rows",
            q_yes.get("granted") is True and len(q_rows) > 0,
            f"granted={q_yes.get('granted')} rows={len(q_rows)}")
        bad_q = [r.get("step_id") for r in q_rows
                 if not all(f in r for f in ("title", "flow_label", "step_label", "sensitivity_tier"))]
        rec("F scopes", "and EVERY queue row carries the decorated display fields",
            len(q_rows) > 0 and not bad_q, f"{len(q_rows)} rows, undecorated={bad_q[:3]}")

        # dave's own request gives bob's `team` scope something it must NOT return
        await as_user(people["dave"]["uid"])
        dr = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2,$3::jsonb)",
                     lr_dave, org, json.dumps({"total_hours": 8}))
        await as_owner()
        dstep = await conn.fetchval(
            "select id from hr.workflow_step where workflow_instance_id=$1 and state='active'",
            dr.get("instance_id"))
        rec("F scopes", "a step exists for someone OUTSIDE the manager's chain, to test `team` against",
            dstep is not None and await conn.fetchval(
                "select subject_employment_id = $2 from hr.workflow_instance where id = $1",
                dr.get("instance_id"), people["dave"]["employment"]),
            f"dave step={dstep}")

        await as_user(people["bob"]["uid"])
        t_env = harvest(await j("select public.hr_wf_inbox('team')"))
        t_rows = t_env.get("scope_rows") or []
        t_ids = {r.get("step_id") for r in t_rows}
        if pay_step is not None:
            rec("F scopes", "the `team` scope returns a step whose instance subject reports to this manager",
                t_env.get("granted") is True and str(pay_step) in t_ids,
                f"rows={len(t_rows)} ids={sorted(t_ids)[:4]}")
        else:
            gap("F team positive leg",
                "no restricted instance existed to supply a step on a report of this manager")
        rec("F scopes", "🚨 and the `team` scope does NOT return a step for someone outside that chain",
            dstep is not None and str(dstep) not in t_ids,
            f"dave step={dstep} in team rows={str(dstep) in t_ids}")

        bad_scope = await j("select public.hr_wf_inbox('nonsense')")
        rec("F scopes", "an unknown scope is refused with bad_scope, server-side",
            bad_scope.get("granted") is False and bad_scope.get("reason") == "bad_scope",
            f"granted={bad_scope.get('granted')} reason={bad_scope.get('reason')}")

        # ============================================================ E. BULK
        # E12 first: the forbidden-flow refusal needs its step still open.
        await as_owner()
        bulk_max = await conn.fetchval(
            "select (hr._knob('hr.workflow','inbox_bulk_max') #>> '{}')::integer")
        if pay_step is not None:
            forbids = await conn.fetchval(
                "select not d.allow_bulk_decide from hr.workflow_definition d "
                "join hr.workflow_instance i on i.workflow_definition_id = d.id "
                "join hr.workflow_step s on s.workflow_instance_id = i.id where s.id = $1", pay_step)
            rec("E bulk", f"the {restricted['flow_key']} definition really does set allow_bulk_decide = false "
                          "(read live, not assumed)", forbids is True, f"allow_bulk_decide false={forbids}")
            await as_user(people["carol"]["uid"])
            bf = await j("select public.hr_wf_bulk_decide(array[$1]::uuid[],'approved','x')", pay_step)
            rec("E bulk", "🚨 T-L10-3: bulk on a step whose definition forbids it refuses the WHOLE "
                          "batch with WF_BULK_FORBIDDEN",
                bf.get("granted") is False and bf.get("reason") == "WF_BULK_FORBIDDEN",
                f"granted={bf.get('granted')} reason={bf.get('reason')} detail={bf.get('detail')}")
        else:
            gap("E bulk-forbidden leg",
                "no active flow with allow_bulk_decide=false could be instantiated in this fixture org")

        # E13 — the ceiling
        await as_user(people["bob"]["uid"])
        too_many = [uuid.uuid4() for _ in range(int(bulk_max) + 1)]
        bl = await j("select public.hr_wf_bulk_decide($1::uuid[],'approved')", too_many)
        rec("E bulk", f"exceeding hr.workflow.inbox_bulk_max ({bulk_max}) returns WF_BULK_LIMIT",
            bl.get("granted") is False and bl.get("reason") == "WF_BULK_LIMIT",
            f"sent={len(too_many)} granted={bl.get('granted')} reason={bl.get('reason')}")

        # E11 — two real steps, per-step outcomes
        await as_user(people["alice"]["uid"])
        b1 = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2,$3::jsonb)",
                     lr2, org, json.dumps({"total_hours": 8}))
        b2 = await j("select hr.wf_request('leave_request','hr_leave_request',$1,$2,$3::jsonb)",
                     lr3, org, json.dumps({"total_hours": 8}))
        await as_owner()
        s1 = await conn.fetchval(
            "select id from hr.workflow_step where workflow_instance_id=$1 and state='active'",
            b1.get("instance_id"))
        s2 = await conn.fetchval(
            "select id from hr.workflow_step where workflow_instance_id=$1 and state='active'",
            b2.get("instance_id"))
        if s1 and s2:
            await as_user(people["bob"]["uid"])
            bulk = await j("select public.hr_wf_bulk_decide(array[$1,$2]::uuid[],'approved')", s1, s2)
            results = bulk.get("results") or []
            named = {r.get("step_id"): r for r in results if isinstance(r, dict)}
            rec("E bulk", "🚨 T-L10-3: bulk returns a PER-STEP outcome naming each step it was given",
                bulk.get("granted") is True and set(named) == {str(s1), str(s2)}
                and all("granted" in v for v in named.values()),
                json.dumps(bulk)[:260])
            rec("E bulk", "and both real steps were actually approved by the holder",
                all(v.get("granted") is True for v in named.values()),
                json.dumps([{k: v.get("granted"), "reason": v.get("reason")}
                            for k, v in named.items()])[:220])
        else:
            gap("E bulk two-step leg", f"could not open two approvable steps (s1={s1}, s2={s2})")

        # ============================================================ G. NO SECOND INBOX
        await as_owner()
        offenders = await conn.fetch(
            "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
            "where n.nspname = 'hr' and pg_get_functiondef(p.oid) like '%/hr/inbox%'")
        rec("G one inbox", "🚨 no function in the `hr` schema emits the retired '/hr/inbox' path",
            len(offenders) == 0, f"offenders={[o['proname'] for o in offenders]}")

        bad_links = [d for d in deep_links if not DEEP_LINK_RE.match(d)]
        rec("G one inbox", "every deep_link the inbox returned points at /hr/tasks/<instance>?step=<step>",
            len(deep_links) > 0 and not bad_links,
            f"{len(deep_links)} links checked, bad={bad_links[:3]}")

        # ============================================================ NOBODY IS EMAILED
        n_org = await conn.fetchval(
            "select count(*) from communication.notification where organization_id = $1", org)
        unsent = await conn.fetchval(
            "select count(*) from communication.notification where organization_id = $1 "
            "and status in ('pending','queued','skipped') and sent_at is null "
            "and provider_message_id is null", org)
        rec("no email", "🚨 every notification this run enqueued is still queued/skipped — ZERO were sent",
            n_org > 0 and unsent == n_org,
            f"{n_org} enqueued for the fixture org, {unsent} unsent; "
            f"statuses=" + str([dict(r) for r in await conn.fetch(
                "select status, count(*) from communication.notification where organization_id=$1 "
                "group by status", org)]))

    except Exception as exc:
        rec("SUITE", "the suite ran to completion", False, f"{type(exc).__name__}: {exc}")
    finally:
        await tr.rollback()
        n_inst_after = await conn.fetchval("select count(*) from hr.workflow_instance")
        n_emp_after = await conn.fetchval("select count(*) from hr.employment")
        n_notif_after = await conn.fetchval("select count(*) from communication.notification")
        left_org = await conn.fetchval(
            "select count(*) from iam.organizations where id = $1", org) if org else 0
        await conn.close()
        rec("rollback", "🚨 the database is byte-identical: hr.workflow_instance and hr.employment "
                        "row counts are exactly what they were before the run",
            n_inst_after == n_inst_before and n_emp_after == n_emp_before,
            f"instances {n_inst_before}->{n_inst_after}, employments {n_emp_before}->{n_emp_after}")
        rec("rollback", "the fixture organization no longer exists, and no notification survived",
            left_org == 0 and n_notif_after == n_notif_before,
            f"org rows={left_org}, notifications {n_notif_before}->{n_notif_after}")

    fails = [r for r in R if not r[2]]
    print(f"\n{'='*94}\nHRB-022 PROOF SUITE — the ONE HR task inbox — "
          f"{len(R)} assertions, {len(fails)} RED\n{'='*94}")
    grp = None
    for g, n, ok, d in R:
        if g != grp:
            print(f"\n--- {g}")
            grp = g
        print(f"  [{'PASS' if ok else 'FAIL'}] {n}" + (f"   << {d}" if not ok and d else ""))
    if GAPS:
        print(f"\n--- NAMED GAPS ({len(GAPS)}) — legs that could not be driven, reported not faked")
        for n, why in GAPS:
            print(f"  [GAP ] {n}: {why}")
    print(f"\n{len(R)} assertions, {len(fails)} RED")
    sys.exit(1 if fails else 0)


asyncio.run(main())
