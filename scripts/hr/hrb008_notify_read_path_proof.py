"""HRB-008 — the notify path resolves the address (D3) and carries the read reference (DEFECT-1).

Run:  cd /Users/armanisadeghi/code/aidream && uv run python \
        /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb008_notify_read_path_proof.py

hr._wf_notify used to insert communication.notification directly with to_address NULL and a
notice-less deep link. Two failures with one root — "we cannot prove we reached this person":
  · D3  (§3.2/§3.3): sms/email with no address landed as generic `failed`/`missing_recipient_address`
        instead of `skipped` with the resolver's NAMED reason.
  · D-1 (§5.2): the deep link carried no notice reference, so the read-stamp page had nothing to
        stamp — 498 rows, 0 with notice=, read_at NULL on all.

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
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0, command_timeout=600)
    tr = conn.transaction(); await tr.start()

    async def as_user(uid):
        await conn.execute("set local role authenticated")
        await conn.execute("select set_config('request.jwt.claims',$1,true)",
                           json.dumps({"sub": str(uid), "role": "authenticated"}))
    async def as_owner():
        await conn.execute("reset role")
        await conn.execute("select set_config('request.jwt.claims','',true)")

    async def impersonate(uid):
        # wf_pending's client grant was revoked by the communication.* P0 campaign; it scopes on
        # auth.uid() (the claims GUC), not the DB role, so owner-role + the viewer's claims exercises
        # the identical caller-scoping without the revoked client grant.
        await conn.execute("reset role")
        await conn.execute("select set_config('request.jwt.claims',$1,true)",
                           json.dumps({"sub": str(uid), "role": "authenticated"}))

    try:
        # an active step whose flow does NOT deny sms (pay_change denies it by policy)
        step = await conn.fetchrow(
            "select st.id, i.id inst, i.flow_key, i.organization_id org "
            "  from hr.workflow_step st join hr.workflow_instance i on i.id = st.workflow_instance_id "
            "  left join hr.workflow_flow_type ft on ft.flow_key = i.flow_key and ft.deleted_at is null "
            " where st.state = 'active' and coalesce(ft.channel_policy->>'sms','default') <> 'deny' "
            " order by st.created_at limit 1")
        rec("fixture", "an active step on an sms-allowing flow exists to notify against",
            step is not None, f'flow={step["flow_key"] if step else None}')
        if step is None:
            raise SystemExit

        # a recipient with no phone (sms -> no_contact_point) but a resolvable email
        noreach = await conn.fetchval(
            "select e.login_user_id from hr.employment em join hr.employee e on e.id=em.employee_id "
            "  cross join lateral communication.resolve_channel_address('sms',em.organization_id,'user',"
            "                     e.login_user_id,null,null,null) rs "
            "  cross join lateral communication.resolve_channel_address('email',em.organization_id,'user',"
            "                     e.login_user_id,null,null,null) re "
            " where em.organization_id=$1 and e.login_user_id is not null "
            "   and rs.refusal='no_contact_point' and re.refusal is null limit 1", step["org"])
        rec("fixture", "a recipient with NO phone but a resolvable email exists (the divergence)",
            noreach is not None, f'uid={noreach}')

        # ============ D3: the skip path
        await as_owner()
        await conn.execute(
            "do $b$ begin perform hr._wf_notify("
            f"'{step['inst']}'::uuid, '{step['id']}'::uuid, 'hr.time.attestation_overdue', "
            f"'timeout_warning', '{noreach}'::uuid, null, '{{}}'::jsonb); end $b$;")
        sms = await conn.fetchrow(
            "select status, error_code, to_address, deep_link from communication.notification "
            "where recipient_user_id=$1 and channel='sms' and target_id=$2 order by created_at desc limit 1",
            noreach, step["id"])
        email = await conn.fetchrow(
            "select id, status, error_code, to_address, deep_link from communication.notification "
            "where recipient_user_id=$1 and channel='email' and target_id=$2 order by created_at desc limit 1",
            noreach, step["id"])
        rec("§D3 skip", "🚨 a no-contact-point SMS is `skipped` with the NAMED reason no_contact_point — "
                        "never a generic failed/missing_recipient_address",
            sms is not None and sms["status"] == "skipped" and sms["error_code"] == "no_contact_point",
            dict(sms) if sms else None)
        rec("§D3 skip", "and a skipped row never carries an invented placeholder address",
            sms is not None and sms["to_address"] is None)
        rec("§D3 skip", "🚨 while the SAME recipient's resolvable EMAIL gets a real address and status "
                        "pending — deliverable, not skipped",
            email is not None and email["status"] == "pending" and email["to_address"] is not None,
            dict(email) if email else None)
        rec("§D3 skip", "and NO missing_recipient_address failure was produced by the resolving path",
            await conn.fetchval(
                "select count(*)=0 from communication.notification where target_id=$1 "
                "and status='failed' and error_code='missing_recipient_address' "
                "and recipient_user_id=$2", step["id"], noreach))

        # ============ D-1: the read reference, end to end
        rec("§D-1 read ref", "🚨 the deep link carries `notice=<this row's own id>` — the read-stamp "
                             "page had nothing to stamp before (498 rows, 0 with notice=)",
            email is not None and email["deep_link"] is not None
            and f'notice={email["id"]}' in email["deep_link"], email["deep_link"] if email else None)
        rec("§D-1 read ref", "and the object route is preserved — the notice ref is appended, not a replacement",
            email is not None and email["deep_link"].startswith(f'/hr/tasks/{step["inst"]}'),
            email["deep_link"] if email else None)
        # 🚨 following the link AS THE RECIPIENT stamps read_at + read_channel
        await as_user(noreach)
        hit = await conn.fetchval("select communication.mark_notification_read($1,'email')", email["id"])
        await as_owner()
        stamped = await conn.fetchrow(
            "select read_at, read_channel from communication.notification where id=$1", email["id"])
        rec("§D-1 read ref",
            "🚨 FOLLOWING the notice reference AS THE RECIPIENT stamps read_at AND read_channel — the "
            "read path the verifier proved was dead is now fed by the producer",
            hit is True and stamped["read_at"] is not None and stamped["read_channel"] == "email",
            f'hit={hit} read_at={stamped["read_at"]} channel={stamped["read_channel"]}')

        # ============ the return counts deliverable notices only (D285)
        await as_owner()
        n_ret = await conn.fetchval(
            "select hr._wf_notify($1,$2,'hr.time.attestation_overdue','timeout_warning',$3,null,'{}'::jsonb)",
            step["inst"], step["id"], noreach)
        n_pending = await conn.fetchval(
            "select count(*) from communication.notification where recipient_user_id=$1 "
            "and target_id=$2 and status='pending'", noreach, step["id"])
        n_skipped = await conn.fetchval(
            "select count(*) from communication.notification where recipient_user_id=$1 "
            "and target_id=$2 and status='skipped'", noreach, step["id"])
        rec("§D285 count", "🚨 the return counts only DELIVERABLE notices, never the skipped-no-address "
                           "rows — or hr._wf_not_attested reads a reached recipient where nobody could be",
            n_ret == n_pending and n_skipped > 0,
            f'returned={n_ret} pending={n_pending} skipped={n_skipped}')

        # ============ D-1 (queue): wf_pending/wf_inbox carry the viewer's notice reference too
        await as_owner()
        qstep = await conn.fetchrow(
            "select st.id step, i.id inst, (st.resolved_user_ids)[1] uid "
            "  from hr.workflow_step st join hr.workflow_instance i on i.id=st.workflow_instance_id "
            " where st.state='active' and cardinality(st.resolved_user_ids)>0 order by st.created_at limit 1")
        if qstep is not None:
            await conn.execute(
                "do $b$ begin perform hr._wf_notify("
                f"'{qstep['inst']}'::uuid,'{qstep['step']}'::uuid,'hr.workflow.step_assigned',"
                f"'assigned','{qstep['uid']}'::uuid,null,'{{}}'::jsonb); end $b$;")
            qnotice = await conn.fetchval(
                "select id from communication.notification where recipient_user_id=$1 "
                "and target_id=$2 and channel='in_app' order by created_at desc limit 1",
                qstep["uid"], qstep["step"])
            await impersonate(qstep["uid"])
            pend = json.loads(await conn.fetchval("select hr.wf_pending()::text"))
            await as_owner()
            dl = next((x.get("deep_link") for x in (pend.get("needs_my_decision") or [])
                       if x.get("deep_link") and str(qstep["step"]) in x["deep_link"]), None)
            rec("§D-1 queue",
                "🚨 the INBOX QUEUE deep link carries the VIEWER'S own in-app notice reference — the "
                "second producer the verifier named is fixed too",
                dl is not None and f'notice={qnotice}' in dl, dl)
            # 🚨 keyed to the viewer: another user reading a queue must NOT get someone else's notice ref
            other = await conn.fetchval(
                "select e.login_user_id from hr.employment em join hr.employee e on e.id=em.employee_id "
                "where em.organization_id=(select organization_id from hr.workflow_instance where id=$1) "
                "and e.login_user_id is not null and e.login_user_id <> $2 limit 1",
                qstep["inst"], qstep["uid"])
            if other is not None:
                await impersonate(other)
                pend2 = json.loads(await conn.fetchval("select hr.wf_pending()::text"))
                await as_owner()
                dl2 = next((x.get("deep_link") for x in (pend2.get("needs_my_decision") or [])
                            if x.get("deep_link") and str(qstep["step"]) in x["deep_link"]), None)
                rec("§D-1 queue",
                    "🚨 and a DIFFERENT viewer never gets that notice reference — the ref only ever "
                    "points at a notice the viewer may stamp",
                    dl2 is None or f'notice={qnotice}' not in dl2, dl2)

        rec("§contract", "the hr_c4_47 contract on hr._wf_notify is declared and unbroken",
            (await conn.fetchval(
                "select count(*) from hr.function_contract where home_migration='hr_c4_47' and is_active")) == 1
            and (await conn.fetchval("select count(*)=0 from hr.function_contracts_broken()")))
    except SystemExit:
        pass
    except Exception as exc:
        rec("SUITE", "the proof ran to completion", False, f"{type(exc).__name__}: {exc}")
    finally:
        await tr.rollback()
        left = await conn.fetchval(
            "select count(*) from communication.notification where event_key='hr.test.probe'")
        await conn.close()

    bad = [r for r in R if not r[2]]
    print(f"\n{'='*92}\nNOTIFY READ-PATH PROOF — {len(R)} assertions, {len(bad)} RED\n{'='*92}")
    g = None
    for grp, n, ok, d in R:
        if grp != g:
            print(f"\n--- {grp}"); g = grp
        print(f"  [{'PASS' if ok else 'FAIL'}] {n}" + (f"   << {d}" if not ok and d else ""))
    sys.exit(1 if bad else 0)

asyncio.run(main())
