"""HRB-008 — the not_attested close says WHICH not_attested it was (coordinator ruling A, 2026-08-28).

Run:  cd /Users/armanisadeghi/code/aidream && uv run python \
        /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb008_not_attested_reason_proof.py

`not_attested` STAYS the terminal state for kiosk-only staff — that is ruled, by design. What
hr_c4_41 adds is close EVIDENCE saying which case it was:

  · `no_reach`    — no login, so the ask was never deliverable; nobody asked.
  · `no_response` — the employee had a surface and did not use it.

🚨 THE FALSIFICATION IS THE SAME STEP, TWICE, WITH ONE FACT CHANGED. The no-reach and no-response
runs drive the identical step and the identical function; the only difference is whether the subject
holds a login. Two fixtures that differ in more than the thing under test prove nothing about it.
Everything runs in ONE transaction that is rolled back.
"""
import asyncio, json, os, sys
import asyncpg
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")
R = []
def rec(g, n, ok, d=""):
    R.append((g, n, bool(ok), str(d)[:300]))

async def main():
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0, command_timeout=900)
    tr = conn.transaction(); await tr.start()
    try:
        # ---------- history first: it must survive everything below untouched
        hist = await conn.fetchrow(
            "select ws.id, ws.metadata, ws.state, ws.state_reason, i.subject_employment_id subj, "
            "       (select e.login_user_id from hr.employment em join hr.employee e "
            "          on e.id=em.employee_id where em.id=i.subject_employment_id) uid "
            "  from hr.workflow_step ws join hr.workflow_instance i on i.id=ws.workflow_instance_id "
            " where i.flow_key='timecard_attestation' and ws.step_key='employee_attestation' "
            "   and ws.state='skipped' order by ws.closed_at limit 1")
        rec("§0 history",
            "🚨 the already-closed attestation carries NO new close evidence — history is evidence, "
            "not a migration target",
            hist is None or not (json.loads(hist["metadata"] or "{}")).get("not_attested_reason"),
            f'metadata={hist["metadata"] if hist else None}')
        if hist is not None:
            rec("§0 history",
                "and its subject HELD a login — it is the asked-and-did-not-answer case, correctly closed",
                hist["uid"] is not None, f'uid={hist["uid"]}')

        # ---------- the live login-less step, pinned
        step = await conn.fetchrow(
            "select ws.id, ws.resolved_user_ids ru, i.subject_employment_id subj, "
            "       (select em.employee_id from hr.employment em where em.id=i.subject_employment_id) eid "
            "  from hr.workflow_step ws join hr.workflow_instance i on i.id=ws.workflow_instance_id "
            " where i.flow_key='timecard_attestation' and ws.step_key='employee_attestation' "
            "   and ws.state='active' and coalesce(cardinality(ws.resolved_user_ids),0)=0 "
            " order by ws.created_at limit 1")
        if step is None:
            rec("fixture", "a live login-less attestation step exists to prove this on", False)
            raise SystemExit
        rec("fixture", "pinned on a live attestation step whose subject has NO login — nobody is reachable",
            (step["ru"] or []) == [], f'step={step["id"]} resolved_user_ids={step["ru"]}')

        # ================= CASE 1: no_reach
        sp = conn.transaction(); await sp.start()
        await conn.execute(f"do $b$ begin perform hr._wf_not_attested('{step['id']}'::uuid, null, 'proof'); end $b$;")
        row = await conn.fetchrow("select state, state_reason, metadata from hr.workflow_step where id=$1", step["id"])
        meta = json.loads(row["metadata"] or "{}")
        rec("§1 no_reach", "🚨 closing a step nobody could be reached on records `no_reach`",
            meta.get("not_attested_reason") == "no_reach", json.dumps(meta)[:220])
        rec("§1 no_reach", "and records that ZERO people were reachable at the close",
            meta.get("reachable_user_count_at_close") == 0, str(meta.get("reachable_user_count_at_close")))
        rec("§1 no_reach",
            "🚨 while the TERMINAL VALUE is untouched — still skipped/not_attested, exactly as ruled",
            row["state"] == "skipped" and row["state_reason"] == "not_attested",
            f'{row["state"]}/{row["state_reason"]}')
        # the event's payload column is `detail`, not `metadata` — checked, not guessed
        ev = await conn.fetchval(
            "select detail::text from hr.workflow_event where workflow_step_id=$1 "
            "and event_kind='timeout_applied' order by occurred_at desc limit 1", step["id"])
        ep = json.loads(ev or "{}")
        rec("§1 no_reach",
            "and the durable EVENT carries the reason beside the outcome — the record a reader lands on",
            ep.get("reason") == "no_reach" and ep.get("outcome") == "not_attested",
            json.dumps(ep)[:220])
        # 🚨 CORRECTED, NOT WEAKENED. This assertion pinned D285 as a fact — that the flag emitted
        # NOTHING — which was true until hr_c4_42 gave it a real recipient. It now pins the fix.
        overdue = await conn.fetchval(
            "select count(*) from hr.workflow_notice where workflow_step_id=$1 "
            "and event_key='hr.time.attestation_overdue'", step["id"])
        rec("§1 no_reach",
            "🚨 no_reach defers to the OPEN work item and sends no second notice — one deliberate "
            "signal, not two (hr_c4_43). D285's null recipient is fixed; this case simply is not "
            "the one that notifies",
            overdue == 0 and meta.get("notified_as") == "failure_lane_owns_it"
            and meta.get("notices_sent") == 0,
            f'overdue notices={overdue} notified_as={meta.get("notified_as")}')
        await sp.rollback()

        # ================= CASE 2: no_response — THE SAME STEP, one fact changed
        sp = conn.transaction(); await sp.start()
        auth_uid = await conn.fetchval("select id from auth.users limit 1")
        await conn.execute(
            f"do $b$ begin perform hr.arm_write(); "
            f"update hr.employee set login_user_id='{auth_uid}'::uuid where id='{step['eid']}'::uuid; end $b$;")
        # hr.wf_activate_step only activates a PENDING step ("step is active, not pending"), so the
        # step is returned to pending and re-activated through the engine's own path rather than
        # having resolved_user_ids written by hand.
        await conn.execute(
            f"do $b$ begin perform hr.arm_write(); update hr.workflow_step "
            f"set state='pending', resolved_user_ids='{{}}'::uuid[] where id='{step['id']}'::uuid; end $b$;")
        act = json.loads(await conn.fetchval("select hr.wf_activate_step($1)::text", step["id"]))
        ru = await conn.fetchval("select resolved_user_ids from hr.workflow_step where id=$1", step["id"])
        rec("§2 no_response",
            "the SAME step, with the subject now holding a login, re-resolves to a reachable person",
            (ru or []) != [], f'granted={act.get("granted")} resolved_user_ids={ru}')
        await conn.execute(f"do $b$ begin perform hr._wf_not_attested('{step['id']}'::uuid, null, 'proof'); end $b$;")
        row2 = await conn.fetchrow("select state, state_reason, metadata from hr.workflow_step where id=$1", step["id"])
        meta2 = json.loads(row2["metadata"] or "{}")
        rec("§2 no_response",
            "🚨 and closing it now records `no_response` — asked, and did not answer",
            meta2.get("not_attested_reason") == "no_response", json.dumps(meta2)[:220])
        rec("§2 no_response", "with a non-zero reachable count",
            (meta2.get("reachable_user_count_at_close") or 0) > 0,
            str(meta2.get("reachable_user_count_at_close")))
        rec("§2 no_response", "and the same untouched terminal value — one state, two recorded reasons",
            row2["state"] == "skipped" and row2["state_reason"] == "not_attested",
            f'{row2["state"]}/{row2["state_reason"]}')
        await sp.rollback()

        # ================= the path the panel ACTUALLY reads, end to end
        rec("§2b the panel path",
            "the reason reaches the panel through the timecard row, which is the path L3 renders — "
            "notices are a separate channel and are NOT what the panel reads",
            await conn.fetchval(
                "select prosrc ~ 'attestation_reason' from pg_proc p join pg_namespace n "
                "on n.oid=p.pronamespace where n.nspname='hr' and p.proname='pay_period_get'"))

        # ================= §2c THE FLAG FIRES ON THE CASE THAT OWNS IT (D285 + hr_c4_43/45)
        # 🚨 The flag belongs to `no_response`: nobody has a work item for it, so this notice is the
        # only signal. The same step is used, with a login granted and the standing work item
        # resolved — one fact at a time, each of them the thing under test.
        sp = conn.transaction(); await sp.start()
        auth_uid2 = await conn.fetchval("select id from auth.users limit 1")
        await conn.execute(
            f"do $b$ begin perform hr.arm_write(); update hr.employee set login_user_id="
            f"'{auth_uid2}'::uuid where id='{step['eid']}'::uuid; "
            f"  perform hr.arm_write(); update hr.workflow_failure set state='resolved', "
            f"resolved_at=now() where workflow_step_id='{step['id']}'::uuid; "
            f"  perform hr.arm_write(); update hr.workflow_step set state='pending', "
            f"resolved_user_ids='{{}}'::uuid[] where id='{step['id']}'::uuid; end $b$;")
        await conn.fetchval("select hr.wf_activate_step($1)::text", step["id"])
        n0b = await conn.fetchval(
            "select count(*) from hr.workflow_notice where workflow_step_id=$1 "
            "and event_key='hr.time.attestation_overdue'", step["id"])
        await conn.execute(f"do $b$ begin perform hr._wf_not_attested('{step['id']}'::uuid, null, 'proof'); end $b$;")
        n1b = await conn.fetchval(
            "select count(*) from hr.workflow_notice where workflow_step_id=$1 "
            "and event_key='hr.time.attestation_overdue'", step["id"])
        m3 = json.loads(await conn.fetchval("select metadata::text from hr.workflow_step where id=$1", step["id"]))
        rec("§2c the flag",
            "🚨 the manager flag FIRES for no_response — D285 was a claim the engine never kept, for "
            "a whole lane, because the recipient was hardcoded null",
            n1b > n0b and m3.get("not_attested_reason") == "no_response",
            f'notices {n0b} -> {n1b}, reason={m3.get("not_attested_reason")}')
        rec("§2c the flag",
            "🚨 and the record says who was ACTUALLY reached, read back from the notify result — "
            "not the recipient it intended",
            m3.get("notified_as") in ("manager_of_record", "hr_admin_queue")
            and (m3.get("notices_sent") or 0) > 0
            and m3.get("notified_user_id") is not None, json.dumps(m3)[:260])
        rec("§2c the flag",
            "🚨 and a RESOLVED work item no longer suppresses it — a closed queue item is not in "
            "front of anybody (hr_c4_45)",
            m3.get("notified_as") != "failure_lane_owns_it", f'notified_as={m3.get("notified_as")}')
        await sp.rollback()

        # ================= §2d THE DUPLICATE SIGNAL IS DEAD, AND ONLY FOR THE BY-DESIGN CASE
        sp = conn.transaction(); await sp.start()
        f0 = await conn.fetchval(
            "select count(*) from hr.workflow_failure where failure_class='unactionable_no_reach'")
        for _ in range(2):
            await conn.execute(
                f"do $b$ begin perform hr.arm_write(); update hr.workflow_step set state='pending' "
                f"where id='{step['id']}'::uuid; end $b$;")
            await conn.fetchval("select hr.wf_activate_step($1)::text", step["id"])
        f1 = await conn.fetchval(
            "select count(*) from hr.workflow_failure where failure_class='unactionable_no_reach'")
        rec("§2d one signal",
            "🚨 re-activating a BY-DESIGN self step twice raises NO blocking failure — measured at "
            "1 -> 2 -> 3 before this, i.e. 8 login-less staff x 59 periods x every re-activation",
            f1 == f0, f"unactionable_no_reach {f0} -> {f1}")
        await sp.rollback()
        # 🚨 THE CONTROL — AND MEASURING IT CORRECTED MY MODEL OF THE ENGINE.
        # My first two attempts were wrong. Flipping allows_self off, or moving the subject away from
        # the login-less candidate, does NOT produce an unreachable-but-resolved step: eligible()
        # strikes a login-less candidate with `no_login` in every case EXCEPT a self-step's own
        # subject (hr_c4_11's rule). So `unactionable_no_reach` is structurally reachable only where
        # a self-step keeps its own login-less subject — and the step instead surfaces as
        # `approver_ineligible`, which is a different worked failure a human still sees.
        # The control therefore proves the right thing: nothing is SILENCED by the suppression.
        sp = conn.transaction(); await sp.start()
        sdid = await conn.fetchval("select step_definition_id from hr.workflow_step where id=$1", step["id"])
        inst_id = await conn.fetchval(
            "select workflow_instance_id from hr.workflow_step where id=$1", step["id"])
        other = await conn.fetchval(
            "select em.id from hr.employment em where em.id <> $1 and em.deleted_at is null limit 1",
            step["subj"])
        await conn.execute(
            f"do $b$ begin perform hr.arm_write(); update hr.workflow_failure set state='resolved', "
            f"resolved_at=now() where workflow_step_id='{step['id']}'::uuid; "
            # the step keeps resolving to the SAME login-less person (a fixed list, not `subject`),
            # while the instance's subject moves — so they are a candidate who is not the subject
            f"  perform hr.arm_write(); update hr.workflow_step_definition "
            f"set resolver_config = jsonb_build_object('employment_ids', "
            f"     jsonb_build_array('{step['subj']}')) where id='{sdid}'::uuid; "
            f"  perform hr.arm_write(); update hr.workflow_instance "
            f"set subject_employment_id='{other}'::uuid where id='{inst_id}'::uuid; "
            f"  perform hr.arm_write(); update hr.workflow_step set state='pending' "
            f"where id='{step['id']}'::uuid; end $b$;")
        act2 = json.loads(await conn.fetchval("select hr.wf_activate_step($1)::text", step["id"]))
        openf = await conn.fetch(
            "select failure_class from hr.workflow_failure where workflow_step_id=$1 "
            "and state in ('open','retrying')", step["id"])
        classes = sorted(r["failure_class"] for r in openf)
        rec("§2d one signal",
            "🚨 CONTROL — the same login-less person, no longer the self-step's subject, is NOT "
            "silenced: the step refuses `approver_ineligible` and raises a worked failure a human "
            "still sees. The suppression removes a duplicate, not a safety net",
            act2.get("granted") is False and act2.get("reason") == "approver_ineligible"
            and "approver_ineligible" in classes,
            f'reason={act2.get("reason")} open failure classes={classes}')
        rec("§2d one signal",
            "and eligible() is why: a login-less candidate is struck `no_login` everywhere EXCEPT a "
            "self-step's own subject, so unactionable_no_reach only ever had this one producer",
            any(x.get("why") == "no_login"
                for x in ((act2.get("evidence") or {}).get("refused") or [])),
            json.dumps((act2.get("evidence") or {}).get("refused"))[:200])
        await sp.rollback()

        # ================= the note the timecard carries, per case
        rec("§3 the note",
            "🚨 hr.timecard_wf_apply no longer tells EVERY not_attested timecard that there was "
            "\"no action from the employee\" — that is false and blaming for somebody nobody could ask",
            await conn.fetchval(
                "select prosrc ~ 'never deliverable to them' and prosrc ~ 'attestation_reason' "
                "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.proname='timecard_wf_apply'"))
        rec("§3 the note",
            "and BOTH wordings keep the no-auto-deny sentence — nothing is attested on anybody's behalf",
            (await conn.fetchval(
                "select (length(prosrc) - length(replace(prosrc,'NOTHING here attested on their behalf','')))"
                " / length('NOTHING here attested on their behalf') "
                "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.proname='timecard_wf_apply'")) >= 2)
        rec("§4 the panel", "hr.pay_period_get surfaces attestation_reason on every workflow row",
            await conn.fetchval(
                "select prosrc ~ 'attestation_reason' from pg_proc p join pg_namespace n "
                "on n.oid=p.pronamespace where n.nspname='hr' and p.proname='pay_period_get'"))
        rec("§4 the panel",
            "every attestation contract in this chain is declared, and none is broken",
            (await conn.fetchval(
                "select count(*) from hr.function_contract where home_migration like 'hr_c4_4%' "
                "and is_active")) >= 4
            and (await conn.fetchval("select count(*)=0 from hr.function_contracts_broken()")),
            str(await conn.fetchval(
                "select string_agg(home_migration||':'||function_name, ', ' order by home_migration) "
                "from hr.function_contract where home_migration like 'hr_c4_4%' and is_active")))

        # ================= §5 THE WRITER RUNS BEFORE THE READER (hr_c4_44)
        # The regression guard that matters: hr._wf_close_step triggers _wf_apply, which READS the
        # step's close evidence. With the close written first, the reader ran before the writer and a
        # coalesce handed the panel the BLAMING case for a login-less employee. This asserts the END
        # of the chain — what the panel is actually handed — not the middle.
        sp = conn.transaction(); await sp.start()
        ppe = await conn.fetchval(
            "select i.target_id from hr.workflow_instance i "
            "join hr.workflow_step ws on ws.workflow_instance_id = i.id where ws.id = $1", step["id"])
        await conn.execute(f"do $b$ begin perform hr._wf_not_attested('{step['id']}'::uuid, null, 'proof'); end $b$;")
        panel = await conn.fetchrow(
            "select metadata->>'attestation_reason' r, metadata->>'attestation_note' n "
            "  from hr.pay_period_employment where id = $1", ppe)
        truth = await conn.fetchval(
            "select metadata->>'not_attested_reason' from hr.workflow_step where id=$1", step["id"])
        rec("§5 writer first",
            "the PANEL is handed the same reason the STEP recorded — the reader used to run first "
            "and receive nothing at all",
            panel["r"] == truth == "no_reach", f'panel={panel["r"]} step={truth}')
        rec("§5 writer first",
            "and the note does NOT blame a person nobody could ask",
            "nobody asked, and they did not decline" in (panel["n"] or "")
            and "no action from the employee" not in (panel["n"] or ""),
            (panel["n"] or "")[:200])
        await sp.rollback()
        rec("§5 writer first",
            "the blaming default is BANNED — an absent reason is named `unrecorded`, never guessed",
            await conn.fetchval(
                "select prosrc not like '%coalesce(v_reason, ''no_response'')%' "
                "and prosrc like '%''unrecorded''%' "
                "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.proname='timecard_wf_apply'"))
        rec("§5 writer first",
            "and no derived attestation_reason anywhere disagrees with the evidence it copies",
            await conn.fetchval(
                "select count(*)=0 from hr.workflow_step ws "
                "join hr.workflow_instance i on i.id=ws.workflow_instance_id "
                "join hr.pay_period_employment ppe on ppe.id=i.target_id "
                "where i.flow_key='timecard_attestation' and ws.metadata ? 'not_attested_reason' "
                "and ppe.metadata->>'attestation_reason' is distinct from "
                "    ws.metadata->>'not_attested_reason'"))

        # ================= §6 the sweep acts NOW; never-asked is not `awaiting`
        rec("§6 as-of now",
            "the sweep checks the actor's standing AS OF NOW — as-of period_end left 12 of 64 pay "
            "periods unsweepable by anybody, forever, because every payroll.read holder is recent",
            await conn.fetchval(
                "select prosrc like '%''payroll.read'', null, current_date%' from pg_proc p "
                "join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.proname='timecard_attestation_sweep'"))
        owner_uid = await conn.fetchval(
            "select e.login_user_id from hr.role_assignment ra "
            "join hr.employment em on em.id=ra.employment_id join hr.employee e on e.id=em.employee_id "
            "where ra.role_key='hr_owner' and ra.is_active and e.login_user_id is not null limit 1")
        total_pp = await conn.fetchval("select count(*) from hr.pay_period")
        sweepable = await conn.fetchval(
            "select count(*) from hr.pay_period pp "
            "where hr.capability($1,'payroll.read',null,current_date)", owner_uid)
        rec("§6 as-of now", "so every pay period is sweepable by a current payroll.read holder",
            sweepable == total_pp and total_pp > 0, f"{sweepable}/{total_pp}")
        rec("§6 as-of now",
            "and a row whose live step can reach NOBODY reads `unreachable`, not `awaiting` — the "
            "client renders awaiting as \"Somebody has been asked and the flow is alive\"",
            await conn.fetchval(
                "select prosrc like '%''unreachable''%' and prosrc like '%resolved_user_ids%' "
                "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.proname='pay_period_get'"))
        # ================= §7 `unreachable` MEANS THE ACTIVE STEP (hr_c4_46)
        # 🚨 BOTH WAYS ON TWO LIVE ROWS THAT MUST DISAGREE — no fixture, because the database already
        # holds the pair: one row whose ACTIVE step reaches nobody, and one whose ACTIVE step reaches
        # a manager while a later step sits pending. hr_c4_44 called BOTH unreachable, because a
        # `pending` step has zero resolved users by construction (approvers resolve at activation) —
        # 3 of 3 pending steps database-wide. L3 stopped rather than ship a sentence for that.
        rows = await conn.fetch(
            "select ppe.id ppe, ppe.pay_period_id pp, "
            "       bool_or(ws.state='active' and coalesce(cardinality(ws.resolved_user_ids),0)=0) has_unreachable_active, "
            "       bool_or(ws.state='active' and coalesce(cardinality(ws.resolved_user_ids),0)>0) has_reachable_active, "
            "       bool_or(ws.state='pending') has_pending "
            "  from hr.pay_period_employment ppe "
            "  join hr.workflow_binding b on b.target_id = ppe.id "
            "  join hr.workflow_instance wi on wi.id = b.workflow_instance_id "
            "  join hr.workflow_step ws on ws.workflow_instance_id = wi.id "
            " group by ppe.id, ppe.pay_period_id")
        # hr.pay_period_get reads auth.uid(); as_owner() clears the claims, so the door refuses and
        # returns no workflow block at all. Read it as a real HR owner.
        pp_owner = await conn.fetchval(
            "select e.login_user_id from hr.role_assignment ra "
            "join hr.employment em on em.id=ra.employment_id join hr.employee e on e.id=em.employee_id "
            "where ra.role_key='hr_owner' and ra.is_active and e.login_user_id is not null limit 1")
        await conn.execute("select set_config('request.jwt.claims',$1,true)",
                           json.dumps({"sub": str(pp_owner), "role": "authenticated"}))
        checked, wrong = 0, []
        for row in rows:
            env = json.loads(await conn.fetchval("select hr.pay_period_get($1)::text", row["pp"]))
            body = (env.get("data") or env).get("workflow") or {}
            mine = [x for x in (body.get("rows") or [])
                    if str(x.get("pay_period_employment_id")) == str(row["ppe"])]
            if not mine:
                continue
            checked += 1
            got = mine[0].get("health")
            want_unreachable = row["has_unreachable_active"]
            if (got == "unreachable") != bool(want_unreachable):
                wrong.append((str(row["ppe"]), got, bool(want_unreachable)))
            # and the step is named exactly when the state is claimed
            if (mine[0].get("unreachable_step_key") is not None) != (got == "unreachable"):
                wrong.append((str(row["ppe"]), "step-key mismatch", mine[0].get("unreachable_step_key")))
        rec("§7 unreachable",
            "🚨 a row reads `unreachable` EXACTLY when its ACTIVE step reaches nobody — a queued "
            "`pending` step has zero resolved users by construction and must never trigger it",
            checked > 0 and not wrong, f"{checked} live rows checked; mismatches={wrong[:3]}")
        await as_owner()
        rec("§7 unreachable",
            "🚨 and the payload NAMES the unreachable step — the state is a fact about the STEP's "
            "assignee while the row is keyed by the SUBJECT, so without it the copy blames the wrong person",
            await conn.fetchval(
                "select prosrc like '%unreachable_step_key%' from pg_proc p join pg_namespace n "
                "on n.oid=p.pronamespace where n.nspname='hr' and p.proname='pay_period_get'"))
        rec("§7 unreachable", "and `pending` is gone from the classifier for good",
            await conn.fetchval(
                "select prosrc not like '%ws2.state in (''active'',''pending'')%' "
                "and prosrc like '%ws2.state = ''active''%' "
                "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.proname='pay_period_get'"))

    except SystemExit:
        pass
    except Exception as exc:
        rec("SUITE", "the proof ran to completion", False, f"{type(exc).__name__}: {exc}")
    finally:
        await tr.rollback()
        left = await conn.fetchval("select count(*) from hr.workflow_step where state='skipped'")
        await conn.close()

    bad = [r for r in R if not r[2]]
    print(f"\n{'='*92}\nNOT-ATTESTED REASON PROOF — {len(R)} assertions, {len(bad)} RED\n{'='*92}")
    g = None
    for grp, n, ok, d in R:
        if grp != g:
            print(f"\n--- {grp}"); g = grp
        print(f"  [{'PASS' if ok else 'FAIL'}] {n}" + (f"   << {d}" if not ok and d else ""))
    print(f"\nAFTER ROLLBACK: skipped steps = {left}")
    sys.exit(1 if bad else 0)

asyncio.run(main())
