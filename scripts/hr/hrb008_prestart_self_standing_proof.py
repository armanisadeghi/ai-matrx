"""HRB-008 / D284 — identity standings are identity facts, not date-scoped ones.

Run:  cd /Users/armanisadeghi/code/aidream && uv run python \
        /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb008_prestart_self_standing_proof.py

`hr.employments_of` filters `hire_date <= p_at`, so a PRE-START hire resolved to `{}` and failed all
five workflow visibility standings — including "subject of it" — on a request about THEMSELVES.
hr_c4_39 routes the two IDENTITY standings ("filed it", "subject of it") through
`hr._employments_of_identity` instead. The capability arm stays date-scoped on `hr.capability`.

Three bars, all of them live and rolled back:
  1. the pre-start hire reads her own request, and her inbox lists it;
  2. she still cannot decide, publish, cancel, reassign, or reach a capability-gated scope;
  3. across every (user, instance) pair, the ONLY visibility delta is pre-start self-standing.

🚨 EVERY FIXTURE HERE IS PINNED BY QUERY, NEVER BY AN UNORDERED `limit 1`. Two probes written while
developing this change picked a different pre-start person than intended and reported a refusal as a
grant. A fixture that drifts turns a proof into a coin flip.
"""
import asyncio, json, os, pathlib, sys
import asyncpg
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")
BASELINE = str(pathlib.Path(__file__).parent / "fixtures" / "hrb008_prestart_visibility_baseline.json")

R = []
def rec(g, n, ok, d=""):
    R.append((g, n, bool(ok), str(d)[:280]))

async def main():
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0, command_timeout=900)
    tr = conn.transaction(); await tr.start()

    async def as_user(uid):
        await conn.execute("set local role authenticated")
        await conn.execute("select set_config('request.jwt.claims',$1,true)",
                           json.dumps({"sub": str(uid), "role": "authenticated"}))

    async def as_owner_keep_claims(uid):
        """Owner DB role, caller identity kept — for the doorless queue of record."""
        await conn.execute("reset role")
        await conn.execute("select set_config('request.jwt.claims',$1,true)",
                           json.dumps({"sub": str(uid), "role": "authenticated"}))

    async def as_owner():
        await conn.execute("reset role")
        await conn.execute("select set_config('request.jwt.claims','',true)")

    try:
        # ---- the fixture, PINNED: a pre-start hire who is the subject of a real instance
        m = await conn.fetchrow(
            "select em.id emp, e.login_user_id uid, em.organization_id org, em.hire_date, "
            "       e.legal_first_name||' '||e.legal_last_name who "
            "  from hr.employment em join hr.employee e on e.id = em.employee_id "
            " where em.deleted_at is null and em.hire_date > current_date "
            "   and e.login_user_id is not null "
            "   and exists (select 1 from hr.workflow_instance i "
            "                where i.subject_employment_id = em.id) "
            " order by em.hire_date, em.id limit 1")
        if m is None:
            rec("fixture", "a pre-start hire who is the subject of a request exists to prove this on",
                False, "no such person live")
            raise SystemExit
        inst = await conn.fetchval(
            "select id from hr.workflow_instance where subject_employment_id=$1 "
            "order by created_at limit 1", m["emp"])
        rec("fixture", f"pinned on {m['who']}, hire_date {m['hire_date']} (pre-start), subject of a real request",
            True, f"emp={m['emp']} inst={inst}")
        rec("fixture", "🚨 and hr.employments_of still returns NOTHING for her — the date window is intact",
            (await conn.fetchval("select hr.employments_of($1)", m["uid"])) == [],
            str(await conn.fetchval("select hr.employments_of($1)", m["uid"])))
        rec("fixture", "while the identity variant returns her employment — that is the whole change",
            m["emp"] in (await conn.fetchval("select hr._employments_of_identity($1)", m["uid"]) or []))

        # ================= BAR 1: she reads her own request, and her inbox lists it
        await as_user(m["uid"])
        door = json.loads(await conn.fetchval("select public.hr_wf_instance($1)::text", inst))
        tok = await conn.fetchrow("select target_token t, target_id i from hr.workflow_instance where id=$1", inst)
        ft = json.loads(await conn.fetchval("select public.hr_wf_for_target($1,$2)::text", tok["t"], tok["i"]))
        await as_owner()
        rec("§1 she reads her own",
            "🚨 the INSTANCE door now grants a pre-start hire her own request — it used to say "
            "\"you have no standing on this request\" about her own profile edit",
            door.get("granted") is True, f'granted={door.get("granted")} reason={door.get("reason")}')
        rec("§1 she reads her own", "and the TARGET door lists it in her history",
            str(inst) in json.dumps(ft.get("history") or []) + json.dumps(ft.get("open") or []),
            json.dumps(ft)[:200])
        # her inbox: waiting_on_others lists in-flight requests, so drive the arm on an in-flight one
        await conn.execute(
            "do $b$ begin perform hr.arm_write(); update hr.workflow_instance set state='active' "
            f"where id='{inst}'::uuid; end $b$;")
        await as_owner_keep_claims(m["uid"])
        pend = json.loads(await conn.fetchval("select hr.wf_pending()::text"))
        await as_owner()
        hers = [x for x in (pend.get("waiting_on_others") or []) if x.get("instance_id") == str(inst)]
        rec("§1 she reads her own",
            "🚨 and her INBOX lists a request she filed — the own-requests arm resolves by identity too",
            len(hers) == 1, json.dumps(hers)[:220])
        rec("§1 she reads her own",
            "with the human flow label, not a raw flow key — she reads what the decider reads",
            bool(hers and hers[0].get("flow_label")), json.dumps(hers[:1])[:160])

        # ================= BAR 2: she gained NOTHING that acts
        for cap in ("workflow.view_queue", "workflow.publish_definition", "workflow.cancel",
                    "workflow.reassign", "workflow.resolve_failure", "workflow.record_result"):
            rec("§2 she cannot act",
                f"hr.capability({cap}) is still FALSE — the capability lane is untouched and date-scoped",
                (await conn.fetchval("select hr.capability($1,$2,null,current_date,$3)",
                                     m["uid"], cap, m["org"])) is False)
        # a draft in HER organization, so a publish refusal can only be about standing
        await conn.execute(f"""do $b$ declare d uuid; begin perform hr.arm_write();
            insert into hr.workflow_definition (organization_id, flow_key, name, definition_version,
                   status, visibility)
            values ('{m['org']}'::uuid,'leave_request','hr_c4_39 prestart probe',96,'draft','internal')
            returning id into d;
            perform hr.arm_write();
            insert into hr.workflow_step_definition (organization_id, workflow_definition_id, step_key,
                   label, step_order, resolver_kind, authority_action)
            values ('{m['org']}'::uuid, d,'manager_approval','Manager',10,'authority','leave_approve');
            perform set_config('matrx.prestart_def', d::text, true); end $b$;""")
        dfn = await conn.fetchval("select current_setting('matrx.prestart_def')")
        # an ACTIVE step she is not on, and an instance she did not file — both pinned
        step = await conn.fetchval(
            "select id from hr.workflow_step where state='active' "
            "and not ($1::uuid = any(resolved_approver_ids)) order by created_at limit 1", m["emp"])
        other_inst = await conn.fetchval(
            "select id from hr.workflow_instance where requester_employment_id is distinct from $1 "
            "and subject_employment_id is distinct from $1 and state not in "
            "('closed','cancelled','completed','superseded') order by created_at limit 1", m["emp"])
        await as_user(m["uid"])
        dec = json.loads(await conn.fetchval(
            "select public.hr_wf_decide($1,'approved','probe',null)::text", step))
        pub = json.loads(await conn.fetchval("select public.hr_wf_publish_definition($1)::text", dfn))
        can = json.loads(await conn.fetchval("select public.hr_wf_cancel($1,'probe')::text", other_inst))
        rea = json.loads(await conn.fetchval(
            "select public.hr_wf_reassign_step($1,$2,'probe')::text", step, m["emp"]))
        que = json.loads(await conn.fetchval("select public.hr_wf_inbox('queue')::text"))
        await as_owner()
        rec("§2 she cannot act", "🚨 she cannot DECIDE an active step she is not on",
            dec.get("granted") is False and dec.get("reason") == "WF_NOT_APPROVER", json.dumps(dec)[:160])
        rec("§2 she cannot act", "🚨 she cannot PUBLISH a routing definition in her own organization",
            pub.get("granted") is False and pub.get("reason") == "no_publish_authority", json.dumps(pub)[:160])
        rec("§2 she cannot act", "and the refusal states the ACTUAL bar, naming no remedy",
            "HR administration standing is not enough" in str(pub.get("detail")), pub.get("detail"))
        rec("§2 she cannot act", "and the draft was NOT published",
            (await conn.fetchval("select status from hr.workflow_definition where id=$1::uuid", dfn)) == "draft")
        rec("§2 she cannot act", "🚨 she cannot CANCEL somebody else's request",
            can.get("granted") is False and can.get("reason") == "no_cancel_authority", json.dumps(can)[:160])
        rec("§2 she cannot act", "she cannot REASSIGN a step",
            rea.get("granted") is False and rea.get("reason") == "no_reassign_authority", json.dumps(rea)[:160])
        rec("§2 she cannot act", "and the HR QUEUE scope refuses her by name",
            que.get("granted") is False and que.get("reason") == "no_queue_authority", json.dumps(que)[:160])
        rec("§2 she cannot act",
            "🚨 and she cannot read a request that is not hers — the widening is SELF-standing only",
            (await conn.fetchval(
                "select count(*)=0 from hr.workflow_instance i "
                " where i.subject_employment_id is distinct from $1 "
                "   and i.requester_employment_id is distinct from $1 "
                "   and hr._wf_instance_visible(i.id, $2)", m["emp"], m["uid"])))

        # ================= BAR 3: the only delta is pre-start self-standing
        if os.path.exists(BASELINE):
            base = json.load(open(BASELINE))
            deltas, foreign = 0, []
            for k, before in base["visible"].items():
                u, i = k.split("|")
                now = await conn.fetchval("select hr._wf_instance_visible($1::uuid,$2::uuid)", i, u)
                if now != before:
                    deltas += 1
                    row = await conn.fetchrow(
                        "select subject_employment_id s, requester_employment_id r "
                        "  from hr.workflow_instance where id=$1::uuid", i)
                    self_standing = (u == str(m["uid"])
                                     and (str(row["s"]) == str(m["emp"]) or str(row["r"]) == str(m["emp"])))
                    if not (self_standing and now and not before):
                        foreign.append((u, i, before, now))
            rec("§3 only self-standing",
                "🚨 across every (caller, instance) pair, the ONLY visibility change is the pre-start "
                "hire gaining HER OWN request — anything else would mean the variant leaked past the predicate",
                deltas > 0 and not foreign,
                f"{deltas} delta(s) of {len(base['visible'])}; foreign={foreign[:3]}")
        else:
            rec("§3 only self-standing", "the pre-change baseline fixture is present", False, BASELINE)

        rec("§4 the guard", "hr.employments_of still carries its date window — write standing untouched",
            await conn.fetchval(
                "select prosrc ~ 'hire_date <= p_at' from pg_proc p join pg_namespace n on "
                "n.oid=p.pronamespace where n.nspname='hr' and p.proname='employments_of'"))
        rec("§4 the guard",
            "and the identity variant has exactly TWO callers, both read paths",
            (await conn.fetchval(
                "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                "where n.nspname='hr' and p.prosrc ~ '_employments_of_identity' "
                "and p.proname <> '_employments_of_identity'")) == 2,
            str(await conn.fetchval(
                "select string_agg(p.proname,', ') from pg_proc p join pg_namespace n on "
                "n.oid=p.pronamespace where n.nspname='hr' and p.prosrc ~ '_employments_of_identity' "
                "and p.proname <> '_employments_of_identity'")))
        rec("§4 the guard", "no declared function contract anywhere in hr is broken",
            await conn.fetchval("select count(*)=0 from hr.function_contracts_broken()"))
    except SystemExit:
        pass
    except Exception as exc:
        rec("SUITE", "the proof ran to completion", False, f"{type(exc).__name__}: {exc}")
    finally:
        await tr.rollback()
        left = await conn.fetchval("select count(*) from hr.workflow_instance")
        await conn.close()

    bad = [r for r in R if not r[2]]
    print(f"\n{'='*92}\nD284 PRE-START SELF-STANDING PROOF — {len(R)} assertions, {len(bad)} RED\n{'='*92}")
    g = None
    for grp, n, ok, d in R:
        if grp != g:
            print(f"\n--- {grp}"); g = grp
        print(f"  [{'PASS' if ok else 'FAIL'}] {n}" + (f"   << {d}" if not ok and d else ""))
    print(f"\nAFTER ROLLBACK: hr.workflow_instance = {left} rows")
    sys.exit(1 if bad else 0)

asyncio.run(main())
