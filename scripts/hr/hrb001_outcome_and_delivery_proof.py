"""HRB-001 COMPLETENESS PROOF — the `outcome` door has producers, and `delivered_at` gets stamped.

Run:  cd /Users/armanisadeghi/code/aidream && uv run python \
        /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb001_outcome_and_delivery_proof.py

🚨 WHY THIS EXISTS. Two doors were BUILT AND UNUSED — the failure a door-count audit cannot see,
because the door itself passes every test you point at it.

  ITEM 1. `communication.record_notification_outcome` worked, refused bad values, and had ZERO
  producers: 504 of 505 notices had `outcome IS NULL`. The root cause was not a forgotten call but
  an AUTHORIZATION SHAPE — the public door authorizes on
  `recipient_user_id = auth.uid() OR created_by = auth.uid() OR is_platform_admin()`, and three of
  SPEC-NOTIFICATIONS §5.2's five outcomes (`ignored`, `superseded`, `undeliverable`) are the ENGINE
  speaking about somebody ELSE's notice. There was no door those producers could walk through.
  `hr_c4_52` adds the internal writer and wires the four real events.

  ITEM 2. `delivered_at` was 0/142 on email — and the Resend webhook pipe ALREADY EXISTED.
  `app/api/webhooks/resend/route.ts` verifies its Svix HMAC and switches over every Resend event;
  `handleEmailDelivered` was a stub that called `console.log` and dropped the event on the floor.
  `hr_c4_53` adds the stamping function; the route now calls it.

WHAT IS LOAD-BEARING HERE. §1C, §1F, §1H and §2K are REAL-EVENT nodes: they drive the actual engine
— `public.hr_wf_decide` on unmodified live steps, `hr._wf_target_changed`,
`communication.finalize_notification` — and then read the outcome back off the notice. They never
call the new helper directly; that would only prove the helper works, which was never in doubt. If
a later edit drops a producer's call, the door keeps passing its own tests and these nodes go red.

🚨 TWO HONEST LIMITS, STATED RATHER THAN PAPERED OVER.
  * `acknowledged` has no real-event node. It is the SAME call site as `decided` inside
    `hr.wf_decide`, differing only by a CASE on `p_decision`, and no live attestation step is
    decidable: both active `employee_attestation` subjects are no-login employees, and
    `wf_decide` authorizes against `resolved_approver_ids` FROZEN at activation. Granting one a
    login inside the fixture does not help — the frozen array is what the door reads. §1B-exact
    therefore asserts the mapping expression against the live catalog, and hrb008_proof §8.2
    exercises the real attested path against a fixture it builds from scratch.
  * `ignored` likewise has no real-event node, for a reason worth keeping: both live attestation
    steps close as `no_reach`, not `no_response`. §1G asserts the thing that actually matters
    there — that a no-reach close does NOT stamp `ignored`, because an employee must never be
    recorded as having ignored a message nobody could send them (hr_c4_43/44).

Everything runs inside ONE transaction that is ALWAYS ROLLED BACK, so the database is left
byte-identical. Assertions are FIXTURE-SCOPED, never global row counts — a global count read after
rollback prints an unreproducible red the moment a concurrent lane commits (measured three times on
hrb022 before it was root-caused).

Connection comes from the five SUPABASE_MATRIX_* variables in aidream/.env.
🚨 statement_cache_size=0 is required: the host is pgbouncer in transaction pooling mode.
"""
import asyncio, datetime, json, pathlib, re, sys
import asyncpg

cfg = {}
for line in pathlib.Path("/Users/armanisadeghi/code/aidream/.env").read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        cfg[k.strip()] = v.strip().strip('"').strip("'")

DSN = dict(host=cfg["SUPABASE_MATRIX_HOST"], port=int(cfg.get("SUPABASE_MATRIX_PORT") or 5432),
           user=cfg["SUPABASE_MATRIX_USER"], password=cfg["SUPABASE_MATRIX_PASSWORD"],
           database=cfg.get("SUPABASE_MATRIX_DATABASE_NAME") or "postgres", statement_cache_size=0)

ROUTE = pathlib.Path("/Users/armanisadeghi/code/matrx-frontend/app/api/webhooks/resend/route.ts")
VOCAB = ["decided", "acknowledged", "ignored", "superseded", "undeliverable"]

results = []
def rec(node, claim, ok, detail=""):
    results.append((node, claim, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  [{node}] {claim}" + (f"  -- {detail}" if detail else ""))


async def main():
    conn = await asyncpg.connect(**DSN)
    tx = conn.transaction()
    await tx.start()

    async def as_owner():
        await conn.execute("select set_config('request.jwt.claims','',true)")

    async def as_user(uid):
        # The engine doors scope on auth.uid() (the claims GUC), not the DB role. Several client
        # grants were revoked by the check-33 campaign, so owner-role + the caller's real claims
        # exercises the identical caller-scoping without the revoked grant.
        await conn.execute("select set_config('request.jwt.claims',$1,true)",
                           json.dumps({"sub": str(uid), "role": "authenticated"}))

    async def refusal(sql, *args):
        """Run something we EXPECT to be refused, inside a savepoint.

        A refusal aborts the enclosing transaction, and every later probe would then report a
        meaningless red. The savepoint keeps a deliberate failure from poisoning the run.
        Returns the refusal message, or None if the call was wrongly ACCEPTED.
        """
        await conn.execute("savepoint expect_refusal")
        try:
            await conn.fetchval(sql, *args)
            await conn.execute("release savepoint expect_refusal")
            return None
        except Exception as e:
            await conn.execute("rollback to savepoint expect_refusal")
            return str(e).split("\n")[0]

    async def notify(inst, step, uid):
        # do-blocks take no bind parameters; these are uuids read straight out of the catalog.
        await conn.execute(
            f"do $b$ begin perform hr._wf_notify('{inst}'::uuid, '{step}'::uuid, "
            f"'hr.time.attestation_overdue', 'timeout_warning', '{uid}'::uuid, null, '{{}}'::jsonb); end $b$;")

    async def notices_for(step, uid=None):
        if uid:
            return await conn.fetch(
                "select id, status, outcome, outcome_at from communication.notification "
                " where target_kind='hr_workflow_step' and target_id=$1 and recipient_user_id=$2",
                step, uid)
        return await conn.fetch(
            "select id, status, outcome, outcome_at from communication.notification "
            " where target_kind='hr_workflow_step' and target_id=$1", step)

    try:
        # =====================================================================================
        # ITEM 1 — THE OUTCOME DOOR NOW HAS PRODUCERS
        # =====================================================================================
        print("\n=== ITEM 1: the outcome door's producers (SPEC-NOTIFICATIONS §5.2) ===")

        # ---- §1A  the door still refuses a value outside the five-word vocabulary
        writer = await conn.fetchval(
            "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
            " where n.nspname='communication' and p.proname='_set_notification_outcome'")
        missing = [w for w in VOCAB if f"'{w}'" not in (writer or "")]
        rec("§1A", "the internal writer carries the SAME five-word §5.2 vocabulary as the public door",
            writer is not None and not missing, f"missing={missing}")

        probe_n = await conn.fetchrow(
            "select id, recipient_user_id from communication.notification "
            " where recipient_user_id is not null and outcome is null order by created_at desc limit 1")
        rec("fixture", "a notice with a recipient and no outcome exists to aim the door at",
            probe_n is not None)
        if probe_n is None:
            raise SystemExit
        await as_user(probe_n["recipient_user_id"])
        bad = await refusal("select communication.record_notification_outcome($1,'read_it_i_guess')",
                            probe_n["id"])
        rec("§1A", "the door REFUSES an outcome outside the vocabulary (the door still works)",
            bad is not None, bad or "🚨 ACCEPTED a bogus outcome")
        await as_owner()

        # ---- §1B  the four producers are wired in the LIVE catalog
        async def src_of(sch, fn):
            return await conn.fetchval(
                "select string_agg(pg_get_functiondef(p.oid), E'\n') from pg_proc p "
                "  join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2",
                sch, fn)

        for fq, needle in {"hr.wf_decide": "_wf_notice_outcome",
                           "hr._wf_not_attested": "_wf_notice_outcome",
                           "hr._wf_target_changed": "_wf_notice_outcome",
                           "communication.finalize_notification": "undeliverable"}.items():
            sch, fn = fq.split(".")
            s = await src_of(sch, fn)
            rec("§1B", f"{fq} calls the outcome producer in the live catalog",
                s is not None and needle in s, f"needle={needle}")

        # §1B-exact: the `acknowledged` branch has no real-event node (see the docstring), so the
        # mapping itself is asserted against the live catalog rather than assumed.
        dec_src = await src_of("hr", "wf_decide")
        rec("§1B-exact", "wf_decide maps an ATTESTATION to 'acknowledged' and any other decision to 'decided'",
            dec_src is not None and "'acknowledged'" in dec_src and "'decided'" in dec_src
            and "attested" in dec_src,
            "the acknowledged/decided CASE is present in hr.wf_decide")

        # ---- §1C  🚨 THE REAL EVENT: real approvers decide real live steps
        steps = await conn.fetch(
            "select st.id step, st.resolved_approver_ids ids, i.id inst, i.flow_key, st.step_key "
            "  from hr.workflow_step st join hr.workflow_instance i on i.id = st.workflow_instance_id "
            " where st.state='active' order by st.created_at")
        decided_ok, superseded_ok, examined, skipped_seen, skipped_clean = [], [], 0, 0, 0
        e1_done = False   # §1E must run ONCE, and INSIDE the savepoint that owns its notice

        for r in steps:
            uid = await conn.fetchval(
                "select e.login_user_id from hr.employment em join hr.employee e on e.id=em.employee_id "
                " where em.id = any($1::uuid[]) and e.login_user_id is not null limit 1",
                list(r["ids"] or []))
            if uid is None:
                continue                      # no decidable approver — nothing real to drive here
            await conn.execute("savepoint one_step")
            try:
                await notify(r["inst"], r["step"], uid)
                before = await notices_for(r["step"], uid)
                if not before or any(n["outcome"] is not None for n in before):
                    await conn.execute("rollback to savepoint one_step")
                    continue                  # only start from a clean, outcome-free notice set

                await as_user(uid)            # 🚨 THE REAL EVENT, through the real public door
                verdict = json.loads(await conn.fetchval(
                    "select public.hr_wf_decide($1,'approved')::text", r["step"]))
                await as_owner()
                after = await notices_for(r["step"], uid)
                live = [n for n in after if n["status"] != "skipped"]
                skipped = [n for n in after if n["status"] == "skipped"]
                skipped_seen += len(skipped)
                skipped_clean += sum(1 for n in skipped if n["outcome"] is None)
                got = {n["outcome"] for n in live}

                if verdict.get("granted") is False and verdict.get("reason") == "WF_TARGET_CHANGED":
                    # the engine took the supersede path instead — a real `superseded` event
                    if live and got == {"superseded"}:
                        superseded_ok.append(f'{r["flow_key"]}/{r["step_key"]}')
                    examined += 1
                elif live and got == {"decided"}:
                    decided_ok.append(f'{r["flow_key"]}/{r["step_key"]}')
                    examined += 1
                    if not e1_done:
                        # ---- §1E  first-outcome-wins, checked HERE because the notice it names
                        # only exists until this savepoint unwinds a few lines below.
                        e1_done = True
                        nid = live[0]["id"]
                        await conn.execute(
                            f"do $b$ begin perform communication._set_notification_outcome("
                            f"'{nid}'::uuid, 'ignored', now()); end $b$;")
                        still = await conn.fetchval(
                            "select outcome from communication.notification where id=$1", nid)
                        rec("§1E", "first outcome WINS — a later producer cannot rewrite what happened",
                            still == "decided", f"outcome after a second write = {still}")
                elif verdict.get("granted") is not False:
                    rec("§1C", f'{r["flow_key"]}/{r["step_key"]}: a granted decision left an outcome behind',
                        False, f"outcomes={sorted(str(g) for g in got)}")
                    examined += 1
            except Exception as e:
                rec("§1C", f'{r["flow_key"]}/{r["step_key"]}: the real decide path ran without error',
                    False, str(e).split("\n")[0])
            finally:
                await conn.execute("rollback to savepoint one_step")
                await as_owner()

        rec("§1C", "🚨 REAL approvals through public.hr_wf_decide stamp outcome='decided' on live notices",
            len(decided_ok) >= 2, f"{len(decided_ok)} step(s): {decided_ok}")
        rec("§1C", "every live step with a decidable approver produced an outcome — none left silent",
            examined >= 3 and examined == len(decided_ok) + len(superseded_ok),
            f"examined={examined} decided={len(decided_ok)} superseded={len(superseded_ok)}")
        rec("§1D", "a `skipped` notice is EXCLUDED — it was never in front of anybody to act on",
            skipped_seen > 0 and skipped_clean == skipped_seen,
            f"{skipped_clean}/{skipped_seen} skipped notices left with outcome NULL")

        # ---- §1F  🚨 THE REAL EVENT: the object changed underneath -> `superseded`
        tgt = await conn.fetchrow(
            "select st.id step, i.id inst, st.resolved_approver_ids ids "
            "  from hr.workflow_step st join hr.workflow_instance i on i.id = st.workflow_instance_id "
            " where st.state='active' order by st.created_at limit 1")
        if tgt is not None:
            uid = await conn.fetchval(
                "select e.login_user_id from hr.employment em join hr.employee e on e.id=em.employee_id "
                " where em.id = any($1::uuid[]) and e.login_user_id is not null limit 1", list(tgt["ids"] or []))
            uid = uid or probe_n["recipient_user_id"]
            await conn.execute("savepoint sup")
            await notify(tgt["inst"], tgt["step"], uid)
            # 🚨 The BEFORE set is what makes this node mean anything. `_wf_target_changed` does two
            # things in one breath: it supersedes the stale asks AND re-routes, sending fresh ones.
            # Asserting "every notice on this step is superseded" would be FALSE and would be
            # asserting the wrong thing — the re-routed notices are the NEW ask and must carry no
            # outcome at all. Only the notices that existed BEFORE the change were superseded.
            before_ids = {n["id"] for n in await notices_for(tgt["step"]) if n["status"] != "skipped"}
            await conn.execute(
                f"do $b$ begin perform hr._wf_target_changed('{tgt['inst']}'::uuid, "
                f"'hrb001-proof-digest-the-target-moved'); end $b$;")
            after = await notices_for(tgt["step"])
            stale = [n for n in after if n["id"] in before_ids]
            fresh = [n for n in after if n["id"] not in before_ids]
            rec("§1F", "🚨 a REAL target change stamps outcome='superseded' on the now-stale notices",
                len(stale) > 0 and all(n["outcome"] == "superseded" for n in stale),
                f"{len(stale)} stale -> " + ",".join(sorted({str(n["outcome"]) for n in stale})))
            rec("§1F", "the RE-ROUTED notices carry NO outcome — they are the new ask, not a closed one",
                all(n["outcome"] is None for n in fresh), f"{len(fresh)} freshly routed notice(s)")
            rec("§1F", "outcome_at is stamped with the outcome (§6.1: the row carries its whole life)",
                all(n["outcome_at"] is not None for n in stale if n["outcome"]))
            await conn.execute("rollback to savepoint sup")

        # ---- §1G  a NO-REACH close must NOT blame the employee (hr_c4_43/44)
        na = await conn.fetchrow(
            "select st.id step, i.id inst, em.employee_id, e.login_user_id uid "
            "  from hr.workflow_step st join hr.workflow_instance i on i.id = st.workflow_instance_id "
            "  join hr.employment em on em.id = i.subject_employment_id "
            "  join hr.employee e on e.id = em.employee_id "
            " where st.state='active' and i.flow_key='timecard_attestation' order by st.created_at limit 1")
        if na is not None:
            await conn.execute("savepoint na")
            await conn.execute(f"do $b$ begin perform hr._wf_not_attested('{na['step']}'::uuid); end $b$;")
            rows = await notices_for(na["step"])
            outs = {str(n["outcome"]) for n in rows if n["status"] != "skipped"}
            reachable = na["uid"] is not None
            rec("§1G", "an unreachable subject is NOT recorded as having 'ignored' a message nobody could send",
                reachable or "ignored" not in outs,
                f"subject has login={reachable}; outcomes={sorted(outs) or '[]'}")
            await conn.execute("rollback to savepoint na")

        # ---- §1H  🚨 THE REAL EVENT: every channel dead-lettered -> an outcome, not silence
        #
        # Two things this node had to learn the hard way, both worth stating:
        #  1. `finalize_notification` only acts on a CLAIMED row (`status='in_progress'` AND
        #     `claimed_by = p_worker_id`). Calling it on an unclaimed notice returns early and
        #     changes nothing — a proof that skips the claim proves nothing in either direction.
        #  2. §5.2 says `undeliverable` means "every channel DEAD-LETTERED". `failed_terminal` is a
        #     different, weaker state — the spine keeps `failed` and `dead_letter` apart, and so
        #     does the outcome. Both directions are asserted below, because the distinction is the
        #     whole point: recording a merely-failed notice as `undeliverable` would be a lie.
        async def finalize(nid, outcome_word):
            await conn.execute(
                f"do $b$ begin perform hr.arm_write(); update communication.notification "
                f"set status='in_progress', claimed_by='hrb001-proof' where id='{nid}'::uuid; end $b$;")
            await conn.execute(
                f"do $b$ begin perform communication.finalize_notification('{nid}'::uuid, "
                f"'hrb001-proof', '{outcome_word}', 'resend', null, 'proof_dead_letter', "
                f"'proof: the dispatcher gave up'); end $b$;")
            return await conn.fetchrow(
                "select status, outcome, outcome_at from communication.notification where id=$1", nid)

        dl = await conn.fetchval(
            "select id from communication.notification where outcome is null "
            "   and status in ('pending','failed') order by created_at desc limit 1")
        if dl is not None:
            await conn.execute("savepoint dlq")
            dead = await finalize(dl, "failed")          # -> dead_letter
            rec("§1H", "🚨 a REAL dead-letter records outcome='undeliverable' instead of leaving it silent",
                dead["status"] == "dead_letter" and dead["outcome"] == "undeliverable",
                f"status={dead['status']} outcome={dead['outcome']}")
            rec("§1H", "outcome_at is stamped when the dead-letter outcome is",
                dead["outcome_at"] is not None)
            await conn.execute("rollback to savepoint dlq")

            await conn.execute("savepoint dlq2")
            term = await finalize(dl, "failed_terminal")  # -> failed, NOT dead
            rec("§1H", "a merely-FAILED notice is NOT called undeliverable — §5.2 reserves that for dead-lettered",
                term["status"] == "failed" and term["outcome"] is None,
                f"status={term['status']} outcome={term['outcome']}")
            await conn.execute("rollback to savepoint dlq2")

        # ---- §1I  the internal writer is reachable by NOBODY outside the definer chain
        g1 = await conn.fetchrow(
            "select has_function_privilege('anon',p.oid,'execute') anon, "
            "       has_function_privilege('authenticated',p.oid,'execute') auth, "
            "       has_function_privilege('service_role',p.oid,'execute') svc "
            "  from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
            " where n.nspname='communication' and p.proname='_set_notification_outcome'")
        rec("§1I", "the internal outcome writer is NOT executable by anon/authenticated/service_role",
            not (g1["anon"] or g1["auth"] or g1["svc"]), dict(g1))

        # =====================================================================================
        # ITEM 2 — THE DELIVERY STAMP
        # =====================================================================================
        print("\n=== ITEM 2: delivered_at from the EXISTING Resend webhook (SPEC-NOTIFICATIONS §6.1) ===")

        g2 = await conn.fetchrow(
            "select has_function_privilege('anon',p.oid,'execute') anon, "
            "       has_function_privilege('authenticated',p.oid,'execute') auth, "
            "       has_function_privilege('service_role',p.oid,'execute') svc "
            "  from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
            " where n.nspname='communication' and p.proname='record_provider_delivery'")
        rec("§2J", "the delivery stamp is service_role ONLY — no signed-in client can forge a delivery",
            g2["svc"] and not g2["anon"] and not g2["auth"], dict(g2))

        row = await conn.fetchrow(
            "select id, provider_message_id from communication.notification "
            " where channel='email' and provider_message_id is not null limit 1")
        rec("fixture", "an email notice carrying a real provider_message_id exists to stamp",
            row is not None)
        if row is not None:
            await conn.execute(
                f"do $b$ begin perform hr.arm_write(); update communication.notification "
                f"set delivered_at = null where id = '{row['id']}'::uuid; end $b$;")
            first_report = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
            n1 = await conn.fetchval("select communication.record_provider_delivery($1,$2::timestamptz)",
                                     row["provider_message_id"], first_report)
            d1 = await conn.fetchval("select delivered_at from communication.notification where id=$1",
                                     row["id"])
            rec("§2K", "🚨 a delivery webhook for a real message STAMPS delivered_at",
                n1 >= 1 and d1 is not None, f"rows={n1} delivered_at={d1}")

            await conn.fetchval("select communication.record_provider_delivery($1)",
                                row["provider_message_id"])
            d2 = await conn.fetchval("select delivered_at from communication.notification where id=$1",
                                     row["id"])
            rec("§2L", "a REDELIVERED webhook does not move delivered_at — the first report is the truth",
                d1 == d2 and d1 is not None, f"{d1} -> {d2}")

            n_sms = await conn.fetchval(
                "select communication.record_provider_delivery($1, now(), 'sms')",
                row["provider_message_id"])
            rec("§2N", "the stamp is channel-scoped — an email report cannot stamp an sms notice",
                n_sms == 0, f"rows touched on channel='sms': {n_sms}")

        n0 = await conn.fetchval(
            "select communication.record_provider_delivery('resend_id_this_platform_never_sent')")
        rec("§2M", "a webhook for mail we did not send stamps NOTHING and returns 0 (a no-op, not an error)",
            n0 == 0, f"rows={n0}")

        # ---- §2O  🚨 the ROUTE actually calls it — this is exactly what was broken
        src = ROUTE.read_text() if ROUTE.exists() else ""
        m = re.search(r"async function handleEmailDelivered\(.*?\n\}", src, re.S)
        body = m.group(0) if m else ""
        rec("§2O", "🚨 handleEmailDelivered CALLS record_provider_delivery (it was a console.log stub)",
            "record_provider_delivery" in body, ROUTE.name)
        rec("§2O", "it passes Resend's email_id as the provider message id — the frozen join key",
            "p_provider_message_id: data.email_id" in body)
        rec("§2O", "the receiver still verifies its Svix HMAC before any of this runs",
            "RESEND_WEBHOOK_SECRET" in src and "crypto" in src)

        mo = re.search(r"async function handleEmailOpened\(.*?\n\}", src, re.S)
        rec("§2P", "`opened` does NOT stamp read state — §5.2 rules out tracking pixels as read",
            mo is None or ("read_at" not in mo.group(0)
                           and "record_provider_delivery" not in mo.group(0)))

        # ---- contracts
        broken = await conn.fetch("select * from hr.function_contracts_broken()")
        rec("§contract", "every function contract is intact, including hr_c4_52's and hr_c4_53's",
            len(broken) == 0, f"{len(broken)} broken")
        declared = await conn.fetchval(
            "select count(*) from hr.function_contract where home_migration in ('hr_c4_52','hr_c4_53')")
        rec("§contract", "hr_c4_52 and hr_c4_53 declared contracts on the functions they touched",
            declared >= 5, f"{declared} contract row(s)")

    finally:
        await tx.rollback()          # the database is left byte-identical
        # read AFTER rollback, on a fresh snapshot: nothing this proof did may survive
        left = await conn.fetchval(
            "select count(*) from communication.notification "
            " where outcome is not null and outcome_at > now() - interval '5 minutes'")
        rec("§hermetic", "the proof left NOTHING behind — every write was rolled back",
            left == 0, f"{left} outcome(s) stamped in the last 5 minutes")
        await conn.close()

    fails = [r for r in results if not r[2]]
    print(f"\n{'='*80}\n  {len(results)-len(fails)} PASS / {len(fails)} FAIL")
    for n, c, _, d in fails:
        print(f"  RED  [{n}] {c}  -- {d}")
    print("="*80)
    sys.exit(1 if fails else 0)


asyncio.run(main())
