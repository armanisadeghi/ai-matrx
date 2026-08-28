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
            "🚨 D285 CLOSED: the close now emits a real attestation_overdue flag — it emitted zero, "
            "platform-wide and forever, while claiming a manager had been flagged",
            overdue > 0, f"overdue notices for this step: {overdue}")
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
            "no attestation_overdue notice is left standing outside a transaction — every one this "
            "proof fires is rolled back, so the live record stays exactly as it was",
            (await conn.fetchval(
                "select count(*) from hr.workflow_notice "
                "where event_key='hr.time.attestation_overdue'")) == 0)

        # ================= §2c ONE FLAG, WITH A REAL RECIPIENT (D285 ruling, hr_c4_42)
        sp = conn.transaction(); await sp.start()
        n0 = await conn.fetchval(
            "select count(*) from hr.workflow_notice where event_key='hr.time.attestation_overdue'")
        await conn.execute(f"do $b$ begin perform hr._wf_not_attested('{step['id']}'::uuid, null, 'proof'); end $b$;")
        n1 = await conn.fetchval(
            "select count(*) from hr.workflow_notice where event_key='hr.time.attestation_overdue'")
        m3 = json.loads(await conn.fetchval("select metadata::text from hr.workflow_step where id=$1", step["id"]))
        rec("§2c the flag",
            "🚨 the manager flag now FIRES — D285 was a claim the engine never kept, for a whole lane",
            n1 > n0, f"attestation_overdue notices {n0} -> {n1}")
        rec("§2c the flag",
            "🚨 and the record says who was ACTUALLY reached, read back from the notify result — "
            "not the recipient it intended",
            m3.get("notified_as") in ("manager_of_record", "hr_admin_queue")
            and (m3.get("notices_sent") or 0) > 0
            and m3.get("notified_user_id") is not None, json.dumps(m3)[:260])
        rec("§2c the flag",
            "this subject has no manager of record, so the flag went to the HR admin queue — the "
            "program's standing fallback, resolved with the same query hr._wf_failure uses",
            m3.get("notified_as") == "hr_admin_queue"
            if await conn.fetchval("select hr.manager_as_of($1, current_date) is null", step["subj"])
            else m3.get("notified_as") == "manager_of_record",
            f'notified_as={m3.get("notified_as")}')
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
            "the attestation contracts across hr_c4_41/42 are declared and NONE is broken",
            (await conn.fetchval(
                "select count(*) from hr.function_contract "
                "where home_migration in ('hr_c4_41','hr_c4_42') and is_active")) == 5
            and (await conn.fetchval("select count(*)=0 from hr.function_contracts_broken()")),
            str(await conn.fetchval(
                "select string_agg(home_migration||':'||function_name, ', ' order by home_migration) "
                "from hr.function_contract where home_migration in ('hr_c4_41','hr_c4_42') and is_active")))
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
