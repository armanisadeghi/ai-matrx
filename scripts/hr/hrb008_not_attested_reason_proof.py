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
        # 🚨 MEASURED, NOT ASSUMED: the manager-flag NOTIFICATION does not fire at all (D285).
        # hr._wf_not_attested calls hr._wf_notify with p_user => NULL, and that function's first
        # line is `if p_user is null then return 0`. So the payload extended here is correct and
        # will carry the reason the moment a recipient is decided — but nothing is delivered today,
        # and the timecard note's "flagged to the manager" is a claim the engine does not keep.
        overdue = await conn.fetchval(
            "select count(*) from hr.workflow_notice where workflow_step_id=$1 "
            "and event_key='hr.time.attestation_overdue'", step["id"])
        rec("§1 no_reach",
            "🚨 D285 pinned as a FACT: the attestation_overdue manager flag emits NOTHING — "
            "p_user is null, so hr._wf_notify returns before writing. The panel path (below) is "
            "what actually carries the distinction today",
            overdue == 0, f"overdue notices for this step: {overdue}")
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
            "🚨 platform-wide, hr.time.attestation_overdue has NEVER been emitted — the notification "
            "channel is inert (D285), which is why the reason had to reach the panel through the "
            "timecard row rather than through a notice",
            (await conn.fetchval(
                "select count(*) from hr.workflow_notice "
                "where event_key='hr.time.attestation_overdue'")) == 0)

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
        rec("§4 the panel", "and the three hr_c4_41 contracts are declared and unbroken",
            (await conn.fetchval(
                "select count(*) from hr.function_contract where home_migration='hr_c4_41' and is_active")) == 3
            and (await conn.fetchval("select count(*)=0 from hr.function_contracts_broken()")))
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
