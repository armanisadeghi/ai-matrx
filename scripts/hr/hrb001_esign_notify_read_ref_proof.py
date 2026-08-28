"""HRB-001 / D286 — esign._notify carries the read reference for internal signers, not outsiders.

Run:  cd /Users/armanisadeghi/code/aidream && uv run python \
        /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb001_esign_notify_read_ref_proof.py

esign._notify wrote a notice-less deep link for internal (user) signers — /sign/e/<envelope> with no
notice reference, so following it stamped nothing (§5.2). The esign twin of hr_c4_47's DEFECT-1 fix:
for `user` rows only, fold the returned notice id into the link AFTER insert. Outsider (actor_token)
rows are left untouched — their secret rides the URL FRAGMENT (§5.4) and they read via the
esign.envelope_event ledger, not spine read_at.

Everything runs in ONE rolled-back transaction.
"""
import asyncio, json, os, sys, uuid
import asyncpg
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")
R = []
def rec(n, ok, d=""):
    R.append((n, bool(ok), str(d)[:300]))

async def main():
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0, command_timeout=600)
    tr = conn.transaction(); await tr.start()
    try:
        org = await conn.fetchval("select id from iam.organizations limit 1")
        signer_user = await conn.fetchval(
            "select id from auth.users where coalesce(is_anonymous,false)=false limit 1")
        await conn.execute("select set_config('hr.privileged_write','on',true)")
        env = await conn.fetchval(
            "insert into esign.envelope (title, consumer_key, expires_at, organization_id) "
            "values ('D286 proof', 'esign.signer', now()+interval '7 days', $1) returning id", org)

        # ---- an INTERNAL (user) signer notice: the /sign/e/<env> link + folded notice ref ----
        user_nid = await conn.fetchval(
            "select esign._notify($1,'esign.signature_requested',$2, p_to_user => $3, "
            "p_deep_link => $4, p_channel => 'email')", env, uuid.uuid4(), signer_user,
            f"/sign/e/{env}")
        user_link = await conn.fetchval(
            "select deep_link from communication.notification where id=$1", user_nid)
        rec("🚨 the INTERNAL signer's deep link carries `?notice=<its own id>` on the /sign/e route — "
            "it stamped nothing before (a third notice-less producer, D286)",
            user_link == f"/sign/e/{env}?notice={user_nid}", user_link)
        rec("and the recipient is the internal signer (so the notice ref points at their OWN row)",
            (await conn.fetchval("select recipient_user_id from communication.notification where id=$1",
                                 user_nid)) == signer_user)
        # 🚨 following the link AS THE SIGNER stamps read_at
        await conn.execute("set local role authenticated")
        await conn.execute("select set_config('request.jwt.claims',$1,true)",
                           json.dumps({"sub": str(signer_user), "role": "authenticated"}))
        hit = await conn.fetchval("select communication.mark_notification_read($1,'in_app')", user_nid)
        await conn.execute("reset role")
        await conn.execute("select set_config('hr.privileged_write','on',true)")
        stamped = await conn.fetchrow(
            "select read_at, read_channel from communication.notification where id=$1", user_nid)
        rec("🚨 FOLLOWING the notice reference AS THE SIGNER stamps read_at — the read path §5.2 "
            "requires is now fed for internal signers",
            hit is True and stamped["read_at"] is not None,
            f'hit={hit} read_at={stamped["read_at"]} channel={stamped["read_channel"]}')

        # ---- an OUTSIDER (actor_token) notice: the fragment secret is UNTOUCHED ----
        frag = "/x/sign#t=SECRET_STAYS_IN_THE_FRAGMENT"
        tok_nid = await conn.fetchval(
            "select esign._notify($1,'esign.signature_requested',$2, p_actor_token_id => $3, "
            "p_to_address => 'outsider@example.invalid', p_deep_link => $4, p_channel => 'email')",
            env, uuid.uuid4(), uuid.uuid4(), frag)
        tok_link = await conn.fetchval(
            "select deep_link from communication.notification where id=$1", tok_nid)
        rec("🚨 the OUTSIDER (actor_token) fragment link is UNCHANGED — the secret stays in the "
            "fragment (§5.4), no query param appended",
            tok_link == frag, tok_link)
        rec("and no notice reference was added to the outsider link (its read signal is the "
            "envelope_event ledger, not spine read_at)",
            tok_link is not None and "notice=" not in tok_link,
            f'recipient_kind={await conn.fetchval("select recipient_kind from communication.notification where id=$1", tok_nid)}')

        # ---- the # guard: a user row with a fragment (defensive) would also be left alone ----
        guard_nid = await conn.fetchval(
            "select esign._notify($1,'esign.signature_requested',$2, p_to_user => $3, "
            "p_deep_link => '/sign/e/x#frag', p_channel => 'email')", env, uuid.uuid4(), signer_user)
        guard_link = await conn.fetchval(
            "select deep_link from communication.notification where id=$1", guard_nid)
        rec("the #-guard holds: even a user link containing a fragment is never given a query param "
            "(structural §5.4 protection)",
            guard_link == "/sign/e/x#frag", guard_link)

        rec("the hr_c4_51 contract on esign._notify is declared and unbroken",
            (await conn.fetchval("select count(*) from hr.function_contract "
                                 "where home_migration='hr_c4_51' and schema_name='esign' and is_active")) == 1
            and (await conn.fetchval("select count(*)=0 from hr.function_contracts_broken()")))
    except Exception as exc:
        rec("the proof ran to completion", False, f"{type(exc).__name__}: {exc}")
    finally:
        await tr.rollback()
        await conn.close()

    bad = [r for r in R if not r[1]]
    print(f"\n{'='*92}\nD286 ESIGN NOTIFY READ-REF PROOF — {len(R)} assertions, {len(bad)} RED\n{'='*92}")
    for n, ok, d in R:
        print(f"  [{'PASS' if ok else 'FAIL'}] {n}" + (f"   << {d}" if not ok and d else ""))
    sys.exit(1 if bad else 0)

asyncio.run(main())
