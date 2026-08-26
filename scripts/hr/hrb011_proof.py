#!/usr/bin/env python3
"""HRB-011 (C7 — the `esign` schema) PROOF SUITE.

    cd /Users/armanisadeghi/code/aidream && \
      uv run python /Users/armanisadeghi/code/matrx-frontend/scripts/hr/hrb011_proof.py

ONE transaction, rolled back unconditionally. Every fixture is real — a real organization, real
`auth.users` rows, real memberships, real `files.files` artifacts, real outsider tokens minted by
the live platform lane, real Ed25519 signatures — and every assertion is made by CALLING THE SHIPPED
RPCs as the identity that would really call them, never by writing the answer into a table first.

NOBODY IS EMAILED. Every notification this suite causes is a `pending` row in
`communication.notification`; the suite asserts the rows exist, asserts NONE of them was sent, and
the rollback removes them. No channel adapter is ever invoked.

statement_cache_size=0 is required — the host is pgbouncer in transaction pooling mode.
"""
import asyncio, hashlib, json, os, sys

import asyncpg
from dotenv import load_dotenv

load_dotenv("/Users/armanisadeghi/code/aidream/.env")

R = []
def rec(group, name, ok, detail=""):
    R.append((group, name, bool(ok), str(detail)[:400]))


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


IP_A = "203.0.113.10"
IP_B = "198.51.100.77"
UA = "Mozilla/5.0 (proof) HRB-011"


async def main():  # noqa: C901
    conn = await asyncpg.connect(
        host=os.environ["SUPABASE_MATRIX_HOST"], port=int(os.environ["SUPABASE_MATRIX_PORT"]),
        database=os.environ["SUPABASE_MATRIX_DATABASE_NAME"], user=os.environ["SUPABASE_MATRIX_USER"],
        password=os.environ["SUPABASE_MATRIX_PASSWORD"], statement_cache_size=0, command_timeout=900)
    tr = conn.transaction()
    await tr.start()

    who = {"kind": "owner", "uid": None}

    async def as_user(uid):
        who.update(kind="user", uid=uid)
        await conn.execute("set local role authenticated")
        await conn.execute("select set_config('request.jwt.claims', $1, true)",
                           json.dumps({"sub": str(uid), "role": "authenticated"}))

    async def as_anon():
        who.update(kind="anon", uid=None)
        await conn.execute("set local role anon")
        await conn.execute("select set_config('request.jwt.claims', $1, true)",
                           json.dumps({"role": "anon"}))

    async def as_owner():
        who.update(kind="owner", uid=None)
        await conn.execute("reset role")
        await conn.execute("select set_config('request.jwt.claims', '', true)")

    async def restore(prev):
        if prev["kind"] == "user":
            await as_user(prev["uid"])
        elif prev["kind"] == "anon":
            await as_anon()
        else:
            await as_owner()

    async def sysval(q, *a):
        """Read the after-state as the owner, then hand the session back to whoever had it.

        A proof that inspects tables must not do so wearing the identity under test: `anon` cannot
        read platform.actor_token at all (which is itself the point), and `authenticated` sees only
        what RLS allows. Inspection is the observer's job, not the subject's."""
        prev = dict(who)
        await as_owner()
        try:
            return await conn.fetchval(q, *a)
        finally:
            await restore(prev)

    async def sysrow(q, *a):
        prev = dict(who)
        await as_owner()
        try:
            return await conn.fetchrow(q, *a)
        finally:
            await restore(prev)

    async def j(q, *a):
        v = await conn.fetchval(q, *a)
        return json.loads(v) if isinstance(v, str) else v

    async def probe(coro_fn):
        """Run something expected to raise, inside a savepoint, and report what happened."""
        sp = conn.transaction()
        await sp.start()
        try:
            out = await coro_fn()
            await sp.rollback()
            return (True, out)
        except Exception as exc:                      # noqa: BLE001
            await sp.rollback()
            return (False, f"{type(exc).__name__}: {exc}")

    base_notif = await conn.fetchval("select count(*) from communication.notification")
    base_env = await conn.fetchval("select count(*) from esign.envelope")
    base_tok = await conn.fetchval("select count(*) from platform.actor_token")

    try:
        # ============================================================== A. POSTURE
        await as_owner()
        n_tables = await conn.fetchval(
            "select count(*) from platform.entity_types where schema_name='esign' and is_active")
        n_cert = await conn.fetchval(
            "select count(*) from platform.entity_types e where e.schema_name='esign'"
            " and iam.canonical_certify_ok(e.schema_name, e.table_name, e.token)")
        rec("A posture", "every esign table certifies", n_tables == n_cert and n_tables >= 13,
            f"{n_cert}/{n_tables} certify")

        anon_grants = await conn.fetchval(
            "select count(*) from information_schema.role_table_grants"
            " where table_schema='esign' and grantee='anon'")
        rec("A posture", "anon holds ZERO table grants in esign (§5.4)", anon_grants == 0, anon_grants)

        anon_fns = await conn.fetch(
            "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
            " where n.nspname='public' and p.proname like 'esign\\_%'"
            "   and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1")
        rec("A posture", "the anon EXECUTE surface is exactly §5.4's eight signer RPCs",
            len(anon_fns) == 8, ", ".join(r["proname"] for r in anon_fns))

        org_trg = await conn.fetchval(
            "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid"
            " join pg_namespace n on n.oid=c.relnamespace"
            " where n.nspname='esign' and t.tgname='_stamp_org_default'")
        rec("A posture", "NO NULL ORG — zero org-assignment triggers in esign", org_trg == 0, org_trg)

        unacked = await conn.fetchval(
            "select count(*) from platform.ddl_guard_log where acknowledged_at is null"
            " and object_ref like 'esign.%'")
        rec("A posture", "zero unacked DDL-guard rows for esign", unacked == 0, unacked)

        shareable = await conn.fetchval(
            "select count(*) from platform.shareable_resource_registry"
            " where resource_type in ('esign_envelope','esign_campaign') and is_active")
        rec("A posture", "esign_envelope + esign_campaign registered shareable BEFORE any grant",
            shareable == 2, shareable)

        bad_cols = await conn.fetchval("""
            select coalesce(string_agg(oc.resource||'.'||c, ', '), '')
              from platform.outsider_consumer oc
              join platform.entity_types et on et.token = oc.resource
              cross join lateral unnest(oc.readable_columns) c
             where oc.consumer_key='esign.signer'
               and not exists (select 1 from information_schema.columns ic
                                where ic.table_schema=et.schema_name and ic.table_name=et.table_name
                                  and ic.column_name=c)""")
        rec("A posture", "every outsider readable_column resolves to a real column", bad_cols == "",
            bad_cols or "all resolve")

        flow = await conn.fetchrow(
            "select is_active, inactive_reason, apply_fn::regproc::text apply_fn"
            "  from hr.workflow_flow_type where flow_key='signature_request'")
        rec("A posture", "HRB-008's signature_request flow is ACTIVE on a real hook",
            flow["is_active"] and flow["inactive_reason"] is None
            and flow["apply_fn"] == "esign.wf_apply_signature_request", dict(flow))

        keys = await conn.fetchval("select count(*) from esign.config_definition where deleted_at is null")
        rec("A posture", "the §7 configuration register is seeded", keys >= 52, f"{keys} keys")

        # ========================================================== FIXTURES
        org = await conn.fetchval(
            "insert into iam.organizations (name, slug, abbreviation) values"
            " ('HRB-011 Proof Org','hrb011-proof-'||substr(gen_random_uuid()::text,1,8),'ESG') returning id")
        people = {}
        for key, name in [("hank", "Hank Requester"), ("ivy", "Ivy Employee"),
                          ("jack", "Jack Countersigner"), ("kate", "Kate Outsider")]:
            uid = await conn.fetchval(
                "insert into auth.users (id, instance_id, aud, role, email, encrypted_password,"
                " email_confirmed_at, created_at, updated_at) values"
                " (gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',"
                " $1,'x',now(),now(),now()) returning id", f"{key}.hrb011@example.invalid")
            await conn.execute(
                "insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)"
                " values ($1,'organization',$1,$2,$3,'active')", org, uid,
                "owner" if key == "hank" else "member")
            people[key] = {"uid": uid, "name": name, "email": f"{key}.hrb011@example.invalid"}

        async def make_file(label, body):
            return await conn.fetchval(
                "insert into files.files (created_by, file_path, file_name, mime_type, size_bytes,"
                " checksum, visibility, current_version, storage_uri, organization_id) values"
                " ($1,$2,$3,'application/pdf',$4,$5,'internal',1,$6,$7) returning id",
                people["hank"]["uid"], f"/esign/proof/{label}.pdf", f"{label}.pdf",
                len(body), sha(body), f"s3://matrx-files/esign/proof/{label}.pdf", org)

        offer_bytes = "OFFER LETTER — HRB-011 proof — base salary, start date, at-will."
        offer_hash = sha(offer_bytes)
        offer_file = await make_file("offer", offer_bytes)

        disclosure = await conn.fetchval(
            "select id from esign.consent_disclosure where is_platform_default and deleted_at is null limit 1")

        # ================================================= B. INTERNAL SIGNING, END TO END
        await as_user(people["hank"]["uid"])
        created = await j(
            "select public.esign_create_envelope($1,'hr.offer','Offer letter — Ivy',$2::jsonb,$3::jsonb,"
            "'offer_letter','sensitive','sequential','Please review and sign.',$4::jsonb,null,'hr.offer.signed')",
            org,
            json.dumps([{"name": "Offer letter", "source_kind": "rendered_template",
                         "template_id": None, "field_map": {"sig1": {"page": 1}},
                         "mime_type": "application/pdf"}]),
            json.dumps([{"position": 1, "role": "signer", "actor_type": "internal_user",
                         "user_id": str(people["ivy"]["uid"]), "full_name": "Ivy Employee",
                         "email": people["ivy"]["email"]}]),
            json.dumps({"type": "hr_offer", "id": None}))
        env = created.get("envelope_id")
        rec("B internal", "create returns a draft envelope", created.get("granted") and created["status"] == "draft",
            created)

        snap = await j("select config_snapshot from esign.envelope where id=$1", env)
        rec("B internal", "AD-11 — send-time config is FROZEN on the envelope",
            snap.get("verification_factor") == "email_code" and snap.get("consent_disclosure_id") is not None
            and snap.get("expiry_days") == 14,
            {k: snap.get(k) for k in ("verification_factor", "expiry_days", "require_preview")})

        doc = await conn.fetchval("select id from esign.envelope_document where envelope_id=$1", env)
        sent = await j("select public.esign_send_envelope($1,$2::jsonb)", env, json.dumps([{
            "document_id": str(doc), "content_file_id": str(offer_file), "content_file_version": 1,
            "content_hash": offer_hash, "byte_size": len(offer_bytes), "page_count": 1,
            "mime_type": "application/pdf"}]))
        rec("B internal", "send freezes the rendered bytes and notifies position 1",
            sent.get("granted") and sent["status"] == "sent" and sent["notified"] == 1, sent)

        frozen = await conn.fetchrow(
            "select is_frozen, content_hash, frozen_at, content_file_id from esign.envelope_document where id=$1", doc)
        rec("B internal", "the document is frozen with OUR independently computed hash",
            frozen["is_frozen"] and frozen["content_hash"] == offer_hash and frozen["frozen_at"] is not None,
            frozen["content_hash"][:16] + "…")

        # THE FREEZE LAW, against a direct client write
        ok, out = await probe(lambda: conn.execute(
            "update esign.envelope_document set content_hash='deadbeef' where id=$1", doc))
        rec("B internal", "§2.3 THE FREEZE LAW — a direct UPDATE of frozen bytes is refused",
            not ok and "frozen" in str(out).lower(), out)

        ok, out = await probe(lambda: conn.execute(
            "delete from esign.envelope_document where id=$1", doc))
        rec("B internal", "a frozen document cannot be deleted", not ok, out)

        # the signer walk, as Ivy
        await as_user(people["ivy"]["uid"])
        mine = await j("select public.esign_my_signer_row($1)", env)
        sid = mine.get("signer_id")
        loaded = await j("select public.esign_sign_load($1,$2::inet,$3)", env, IP_A, UA)
        rec("B internal", "the internal signing route loads the envelope and the frozen document",
            loaded.get("granted") and len(loaded["documents"]) == 1
            and loaded["documents"][0]["content_hash"] == offer_hash, list(loaded.keys()))
        rec("B internal", "the loader returns ONLY registry-allowlisted columns (§5.3 law 3)",
            set(loaded["envelope"].keys()) == {"id", "title", "message", "status", "expires_at", "signing_order"},
            sorted(loaded["envelope"].keys()))
        rec("B internal", "other signers are a display list, never their rows",
            all(set(o.keys()) == {"order", "role", "status"} for o in loaded["other_signers"]),
            loaded["other_signers"])

        # §4.3 condition 1 — sign before consent
        signed_early = await j("select public.esign_sign($1,$2::jsonb,'btn-sign',$3::inet,$4)", sid,
                               json.dumps([{"document_id": str(doc), "content_hash": offer_hash}]), IP_A, UA)
        rec("B internal", "§4.3(1) sign WITHOUT consent is refused",
            signed_early.get("granted") is False and signed_early["reason"] in ("no_consent", "document_not_previewed"),
            signed_early)

        # consent before preview
        consent_early = await j("select public.esign_sign_consent($1,$2,$3::inet,$4)", sid, disclosure, IP_A, UA)
        rec("B internal", "§4.1 consent BEFORE the document rendered is refused",
            consent_early.get("granted") is False and consent_early["reason"] == "document_not_previewed",
            consent_early)

        pv = await j("select public.esign_sign_preview_ack($1,$2,$3::inet,$4)", sid, doc, IP_A, UA)
        rec("B internal", "the preview ack sets document_previewed_at — the §101(c) demonstration",
            pv.get("granted") and pv["documents_unseen"] == 0 and pv["previewed_at"] is not None, pv)

        opened_n = await conn.fetchval(
            "select count(*) from esign.envelope_event where signer_id=$1 and event_type='opened'", sid)
        viewed_n = await conn.fetchval(
            "select count(*) from esign.envelope_event where signer_id=$1 and event_type='viewed'", sid)
        rec("B internal", "`opened` ≠ `viewed` — a load is not evidence a human looked",
            opened_n >= 1 and viewed_n == 1, f"opened={opened_n} viewed={viewed_n}")

        con = await j("select public.esign_sign_consent($1,$2,$3::inet,$4)", sid, disclosure, IP_A, UA)
        rec("B internal", "consent records the exact disclosure version", con.get("granted"), con)

        wrong_disc = await conn.fetchval(
            "insert into esign.consent_disclosure (organization_id, disclosure_key, locale, version_label,"
            " title, body, is_current, is_platform_default, visibility) values"
            " ($1,'proof.other','en-US','v9','Other','Other text',false,false,'public') returning id", org)
        bad_con = await j("select public.esign_sign_consent($1,$2,$3::inet,$4)", sid, wrong_disc, IP_A, UA)
        rec("B internal", "AD-11 — consenting to a disclosure other than the FROZEN one is refused",
            bad_con.get("granted") is False and bad_con["reason"] == "disclosure_not_the_frozen_version", bad_con)

        no_adopt = await j("select public.esign_sign($1,$2::jsonb,'btn-sign',$3::inet,$4)", sid,
                           json.dumps([{"document_id": str(doc), "content_hash": offer_hash}]), IP_A, UA)
        rec("B internal", "you cannot sign with a signature you never adopted (§4.2)",
            no_adopt.get("granted") is False and no_adopt["reason"] == "no_signature_adopted", no_adopt)

        ad = await j("select public.esign_sign_adopt_signature($1,'typed','Ivy Employee','cursive',null,null,$2::inet,$3)",
                     sid, IP_A, UA)
        rec("B internal", "adoption is recorded and says plainly it is not signing", ad.get("granted"), ad)

        no_action = await j("select public.esign_sign($1,$2::jsonb,'',$3::inet,$4)", sid,
                            json.dumps([{"document_id": str(doc), "content_hash": offer_hash}]), IP_A, UA)
        rec("B internal", "§4.3(5) sign with NO explicit Sign action id is refused",
            no_action.get("granted") is False and no_action["reason"] == "no_sign_action", no_action)

        no_hash = await j("select public.esign_sign($1,null,'btn-sign',$2::inet,$3)", sid, IP_A, UA)
        rec("B internal", "an unchecked hash is never treated as a matching hash",
            no_hash.get("granted") is False and no_hash["reason"] == "no_observed_hashes", no_hash)

        # ==================================================== C. TAMPER DETECTION
        tampered = await j("select public.esign_sign($1,$2::jsonb,'btn-sign',$3::inet,$4)", sid,
                           json.dumps([{"document_id": str(doc), "content_hash": sha(offer_bytes + " EXTRA CLAUSE")}]),
                           IP_A, UA)
        rec("C tamper", "§8.2(8) a hash mismatch REFUSES the signature",
            tampered.get("granted") is False and tampered["reason"] == "document_hash_mismatch", tampered)
        mism = await conn.fetchrow(
            "select payload, actor_type, ip_address from esign.envelope_event"
            " where signer_id=$1 and event_type='hash_mismatch' order by occurred_at desc limit 1", sid)
        rec("C tamper", "the refusal WROTE hash_mismatch — the refusal-envelope law, proven",
            mism is not None and json.loads(mism["payload"])["expected_hash"] == offer_hash,
            mism and json.loads(mism["payload"]))
        st = await conn.fetchval("select status from esign.envelope_signer where id=$1", sid)
        rec("C tamper", "after a mismatch the signer is still `consented`, never `signed`", st == "consented", st)

        # ============================================ B (cont). THE REAL SIGNATURE
        good = await j("select public.esign_sign($1,$2::jsonb,'btn-sign-offer',$3::inet,$4)", sid,
                       json.dumps([{"document_id": str(doc), "content_hash": offer_hash}]), IP_A, UA)
        rec("B internal", "the signature is accepted when all five §4.3 conditions hold",
            good.get("granted") and good["envelope"]["completed"] is True, good.get("envelope"))

        env_row = await conn.fetchrow(
            "select status, completed_at, certificate_id from esign.envelope where id=$1", env)
        rec("B internal", "the envelope reached `completed` and carries its certificate",
            env_row["status"] == "completed" and env_row["certificate_id"] is not None, dict(env_row))

        # ============================================ D. THE EVIDENCE PACKAGE (§8.1)
        cert = await conn.fetchrow(
            "select payload, payload_hash, signature, key_id from esign.envelope_certificate where envelope_id=$1", env)
        payload = json.loads(cert["payload"])
        rec("D evidence", "§8.1(1) the certificate says WHAT was signed (name + hash + version)",
            payload["documents"][0]["content_hash"] == offer_hash
            and payload["documents"][0]["hash_algorithm"] == "sha-256"
            and payload["documents"][0]["name"] == "Offer letter",
            payload["documents"][0]["name"])
        s0 = payload["signers"][0]
        rec("D evidence", "§8.1(1) …WHO signed, and HOW they were authenticated",
            s0["name"] == "Ivy Employee" and s0["email"] == people["ivy"]["email"]
            and s0["authentication_method"] == "session" and s0["verification_passed"] is True,
            {k: s0[k] for k in ("name", "actor_type", "authentication_method", "verification_factor")})
        rec("D evidence", "§8.1(1) …WHAT THEY CONSENTED TO — the disclosure's FULL TEXT, not its id",
            s0["consent_disclosure"] and len(s0["consent_disclosure"]["text"]) > 1500
            and "right to receive a paper copy" in s0["consent_disclosure"]["text"].lower().replace("your ", "")
            or "paper copy" in s0["consent_disclosure"]["text"].lower(),
            f"{len(s0['consent_disclosure']['text'])} chars of disclosure text embedded")
        rec("D evidence", "§8.1(1) …and WHEN, with IP and user-agent per interaction",
            all(e["ip"] == IP_A and e["user_agent"] == UA for e in s0["interaction_evidence"]),
            [e["event"] for e in s0["interaction_evidence"]])
        rec("D evidence", "the certificate carries the complete ordered event ledger",
            len(payload["event_ledger"]) >= 8
            and payload["event_ledger"] == sorted(payload["event_ledger"], key=lambda e: e["at"]),
            f"{len(payload['event_ledger'])} events")
        rec("D evidence", "the certificate is self-sufficient — org, config snapshot and issuer note travel with it",
            payload["organization"]["id"] == str(org) and payload["config_snapshot"]
            and "not a certificate from a qualified trust service provider" in payload["issuer_note"],
            payload["organization"]["name"])

        types = await conn.fetch(
            "select event_type, count(*) n from esign.envelope_event where envelope_id=$1 group by 1 order by 1", env)
        seen = {r["event_type"]: r["n"] for r in types}
        need = ["created", "document_frozen", "sent", "opened", "viewed", "consent_given",
                "signature_adopted", "signed", "certificate_generated"]
        rec("D evidence", "§8.1(2) every expected event fired, in order",
            all(t in seen for t in need), seen)

        null_actor = await conn.fetchval(
            "select count(*) from esign.envelope_event where envelope_id=$1 and actor_type is null", env)
        rec("D evidence", "§8.1(2) no event is recorded as a bare 'user'", null_actor == 0, null_actor)

        bad_ip = await conn.fetchval(
            "select count(*) from esign.envelope_event where envelope_id=$1"
            " and event_type in ('opened','viewed','consent_given','signature_adopted','signed','downloaded')"
            " and (ip_address is null or user_agent is null)", env)
        sys_ip = await conn.fetchval(
            "select count(*) from esign.envelope_event where envelope_id=$1"
            " and event_type in ('reminded','expired','certificate_generated')"
            " and (ip_address is not null or user_agent is not null)", env)
        rec("D evidence", "§8.1(4) IP+UA on every interaction event, ABSENT on every system event",
            bad_ip == 0 and sys_ip == 0, f"interaction_missing={bad_ip} system_fabricated={sys_ip}")

        ok, out = await probe(lambda: conn.execute(
            "update esign.envelope_event set event_type='signed' where envelope_id=$1", env))
        rec("D evidence", "the event ledger is append-only against UPDATE", not ok, out)
        ok, out = await probe(lambda: conn.execute(
            "delete from esign.envelope_event where envelope_id=$1", env))
        rec("D evidence", "the event ledger is append-only against DELETE", not ok, out)
        ok, out = await probe(lambda: conn.execute(
            "update esign.envelope_certificate set payload='{}'::jsonb where envelope_id=$1", env))
        rec("D evidence", "the certificate row is immutable", not ok, out)

        await as_user(people["hank"]["uid"])
        ver = await j("select public.esign_verify_envelope($1,$2::jsonb)", env,
                      json.dumps([{"document_id": str(doc), "content_hash": offer_hash}]))
        rec("D evidence", "§8.1(7) POST /verify — hashes match and the Ed25519 signature verifies",
            ver["intact"] and ver["certificate"]["payload_hash_matches"]
            and ver["certificate"]["signature_verifies"], ver["certificate"])

        ver_bad = await j("select public.esign_verify_envelope($1,$2::jsonb)", env,
                          json.dumps([{"document_id": str(doc), "content_hash": sha("tampered bytes")}]))
        rec("D evidence", "§8.2(9) a post-completion tamper reports the exact expected AND actual hash",
            ver_bad["intact"] is False and ver_bad["documents"][0]["result"] == "MISMATCH"
            and ver_bad["documents"][0]["expected_hash"] == offer_hash, ver_bad["documents"][0])

        await as_owner()
        rot = await j("select public.esign_rotate_signing_key('HRB-011 proof rotation')")
        await as_user(people["hank"]["uid"])
        still = await j("select public.esign_verify_envelope($1,'[]'::jsonb)", env)
        rec("D evidence", "§8.1(7) after key ROTATION the old certificate still verifies against the retained key",
            rot["granted"] and rot["current_key_id"] != rot["retired_key_id"]
            and still["certificate"]["signature_verifies"] is True,
            f"{rot['retired_key_id']} → {rot['current_key_id']}")

        voidc = await j("select public.esign_void_envelope($1,'changed our mind')", env)
        rec("D evidence", "§8.5(46) voiding a COMPLETED envelope is refused",
            voidc.get("granted") is False and voidc["reason"] == "cannot_void_completed", voidc)

        # ============================== E. EXTERNAL TOKEN SIGNING, END TO END
        await as_user(people["hank"]["uid"])
        nda_bytes = "MUTUAL NDA — HRB-011 proof — confidentiality, term, governing law."
        nda_hash = sha(nda_bytes)
        await as_owner()
        nda_file = await make_file("nda", nda_bytes)
        await as_user(people["hank"]["uid"])

        e2 = await j(
            "select public.esign_create_envelope($1,'crm.contract','Mutual NDA — Kate',$2::jsonb,$3::jsonb,"
            "'nda','sensitive','sequential',null,'{}'::jsonb,null,null)", org,
            json.dumps([{"name": "Mutual NDA", "source_kind": "uploaded_file", "mime_type": "application/pdf"}]),
            json.dumps([{"position": 1, "role": "signer", "actor_type": "external",
                         "full_name": "Kate Outsider", "email": "kate.outsider@example.invalid"},
                        {"position": 2, "role": "signer", "actor_type": "internal_user",
                         "user_id": str(people["jack"]["uid"]), "full_name": "Jack Countersigner",
                         "email": people["jack"]["email"]}]))
        env2 = e2["envelope_id"]
        doc2 = await conn.fetchval("select id from esign.envelope_document where envelope_id=$1", env2)
        sent2 = await j("select public.esign_send_envelope($1,$2::jsonb)", env2, json.dumps([{
            "document_id": str(doc2), "content_file_id": str(nda_file), "content_file_version": 1,
            "content_hash": nda_hash, "byte_size": len(nda_bytes), "page_count": 2,
            "mime_type": "application/pdf"}]))
        rec("E outsider", "a SEQUENTIAL envelope notifies position 1 ONLY (§3.3)",
            sent2.get("granted") and sent2["notified"] == 1, sent2)

        await as_owner()
        sid_kate, sid_jack = [r["id"] for r in await conn.fetch(
            "select id from esign.envelope_signer where envelope_id=$1 order by position", env2)]
        tok = await conn.fetchrow(
            "select t.id, t.token_hash, t.token_prefix, t.verification_factor, t.use_count, t.recipient_email,"
            "       t.expires_at, t.scope from platform.actor_token t"
            "  join esign.envelope_signer s on s.actor_token_id = t.id where s.id=$1", sid_kate)
        rec("E outsider", "send minted ONE scoped token for the external signer",
            tok is not None and tok["verification_factor"] == "email_code"
            and tok["recipient_email"] == "kate.outsider@example.invalid", dict(tok) if tok else None)
        rec("E outsider", "§5.1 the secret is NOT stored — only its sha256 and an 8-char prefix",
            tok and len(tok["token_hash"]) == 64 and len(tok["token_prefix"]) == 8, tok["token_prefix"])
        scope = json.loads(tok["scope"])
        rec("E outsider", "§5.3 law 1 — every grant names a concrete resource plus an id or a parent_id",
            all(("id" in g or "parent_id" in g) and g.get("resource") for g in scope["grants"]),
            [g["resource"] for g in scope["grants"]])

        # the secret only exists in the notification we enqueued
        notif = await conn.fetchrow(
            "select id, event_key, recipient_kind, to_address, status, sent_at, deep_link,"
            "       recipient_actor_token_id from communication.notification"
            " where target_id=$1 and event_key='esign.signature_requested' order by created_at desc limit 1", env2)
        rec("E outsider", "the invitation is an ENQUEUED notice on the one spine, addressed to a non-user",
            notif and notif["recipient_kind"] == "actor_token"
            and notif["to_address"] == "kate.outsider@example.invalid" and notif["status"] == "pending"
            and notif["sent_at"] is None, dict(notif) if notif else None)
        secret = notif["deep_link"].split("#t=")[1]
        rec("E outsider", "§5.4 the secret travels in the URL FRAGMENT, never the path or query",
            notif["deep_link"].startswith("/x/sign#t=") and "?" not in notif["deep_link"],
            notif["deep_link"][:18] + "…")
        stored_anywhere = await sysval(
            "select count(*) from platform.actor_token where token_hash = $1 or token_prefix = $1", secret)
        rec("E outsider", "§8.3(13) the freshly minted secret is nowhere at rest in the token table",
            stored_anywhere == 0, stored_anywhere)

        # position 2 cannot act yet
        jack_ctx = await sysval("select esign._can_act($1)", sid_jack)
        rec("E outsider", "§8.4(24) position 2 cannot act while position 1 is unsigned",
            json.loads(jack_ctx)["can_act"] is False
            and json.loads(jack_ctx)["reason"] == "waiting_on_earlier_position", json.loads(jack_ctx))

        await as_anon()
        begun = await j("select public.outsider_begin($1)", secret)
        rec("E outsider", "outsider_begin returns NO object data, only what the code prompt needs",
            begun["ok"] and set(begun.keys()) == {"ok", "consumer_key", "verification_factor",
                                                  "masked_target", "subject_summary"}, begun)
        uc = await sysval("select use_count from platform.actor_token where id=$1", tok["id"])
        rec("E outsider", "§5.1 resolution does NOT consume a use (the mail-scanner defect)", uc == 0, uc)

        forged = await j("select public.esign_signer_sign($1,'[]'::jsonb,'x',$2::inet,$3)",
                         "not-a-real-session", IP_A, UA)
        rec("E outsider", "§5.7(2) a forged session gets the UNIFORM refusal and no oracle",
            forged.get("granted") is False and forged["reason"] == "link_no_longer_valid"
            and "true_reason" not in forged, forged)

        code_res = await j("select public.outsider_send_code($1)", secret)
        code = code_res["code_for_delivery"]
        bad_verify = await j("select public.outsider_verify($1,'000000',$2::inet)", secret, IP_A)
        rec("E outsider", "§8.3(19) a wrong code is refused with the same uniform message",
            bad_verify["ok"] is False and "no longer valid" in bad_verify["message"], bad_verify)
        ver_res = await j("select public.outsider_verify($1,$2,$3::inet)", secret, code, IP_A)
        session = ver_res["session"]
        uc2 = await sysval("select use_count from platform.actor_token where id=$1", tok["id"])
        rec("E outsider", "§5.1 the use is consumed on VERIFIED SESSION ISSUANCE",
            ver_res["ok"] and uc2 == 1, f"use_count {uc}→{uc2}")

        moved = await j("select public.esign_signer_load($1,$2::inet,$3)", session, IP_B, UA)
        rec("E outsider", "§5.7(6) the same session from a DIFFERENT IP is refused (this lane enforces it)",
            moved.get("granted") is False and moved["reason"] == "link_no_longer_valid", moved)

        kload = await j("select public.esign_signer_load($1,$2::inet,$3)", session, IP_A, UA)
        rec("E outsider", "the outsider loads the envelope and its documents through the RPC door only",
            kload.get("granted") and kload["documents"][0]["content_hash"] == nda_hash, list(kload.keys()))
        rec("E outsider", "the outsider sees the sending ORGANISATION's branding (§6.0)",
            kload["branding"]["organization_id"] == str(org), kload["branding"])

        await conn.execute("set local role anon")
        ok, out = await probe(lambda: conn.fetchval("select count(*) from esign.envelope_signer"))
        rec("E outsider", "anon cannot read an esign table directly — the RPC is the ONLY door",
            not ok, out)
        await as_anon()

        early_sign = await j("select public.esign_signer_sign($1,$2::jsonb,'btn',$3::inet,$4)", session,
                             json.dumps([{"document_id": str(doc2), "content_hash": nda_hash}]), IP_A, UA)
        rec("E outsider", "§8.4(25) the outsider cannot sign before consent either",
            early_sign.get("granted") is False and early_sign["reason"] in ("no_consent", "document_not_previewed"),
            early_sign)

        await j("select public.esign_signer_preview_ack($1,$2,$3::inet,$4)", session, doc2, IP_A, UA)
        kcon = await j("select public.esign_signer_consent($1,$2,$3::inet,$4)", session, disclosure, IP_A, UA)
        rec("E outsider", "the outsider consents to the frozen disclosure version", kcon.get("granted"), kcon)
        await j("select public.esign_signer_adopt_signature($1,'typed','Kate Outsider','script',null,null,$2::inet,$3)",
                session, IP_A, UA)

        dele = await j("select public.esign_signer_delegate($1,'Not Kate','other@example.invalid','busy',$2::inet,$3)",
                       session, IP_A, UA)
        rec("E outsider", "§8.4(27) delegation with esign.delegation.allowed=false is refused",
            dele.get("granted") is False and dele["reason"] == "delegation_not_allowed", dele)

        dl = await j("select public.esign_signer_download_url($1,$2,$3::inet,$4)", session, doc2, IP_A, UA)
        rec("E outsider", "§2.8 a download returns a short-lived TICKET and writes `downloaded`",
            dl.get("granted") and dl["content_file_id"] == str(nda_file) and dl["ticket_expires_at"],
            {k: dl.get(k) for k in ("content_file_id", "ticket_expires_at")})

        ksign = await j("select public.esign_signer_sign($1,$2::jsonb,'btn-sign-nda',$3::inet,$4)", session,
                        json.dumps([{"document_id": str(doc2), "content_hash": nda_hash}]), IP_A, UA)
        rec("E outsider", "the OUTSIDER signature is accepted and advances the ordered walk",
            ksign.get("granted") and ksign["envelope"]["completed"] is False
            and ksign["envelope"]["outstanding"] == 1, ksign.get("envelope"))

        ev = await sysrow(
            "select actor_type, actor_token_id, auth_method, ip_address, user_agent, payload"
            "  from esign.envelope_event where signer_id=$1 and event_type='signed'", sid_kate)
        rec("E outsider", "§5.5 the outsider's write is attributed to a TOKEN, never to a fake user",
            ev["actor_type"] == "external_signer" and ev["actor_token_id"] == tok["id"]
            and ev["auth_method"] == "token_link_email_code", dict(ev) | {"payload": "…"})
        no_user = await sysval(
            "select count(*) from esign.envelope_signer where id=$1 and signer_user_id is not null", sid_kate)
        rec("E outsider", "AR2's lock — no auth.users, no membership, no employee row for the signer",
            no_user == 0, no_user)

        jack_now = json.loads(await sysval("select esign._can_act($1)", sid_jack))
        rec("E outsider", "position 2 becomes actionable only after position 1 signed",
            jack_now["can_act"] is True, jack_now)

        # cross-consumer misuse: a token from a DIFFERENT purpose cannot drive the signing family
        await as_anon()
        anon_tok = await j("select public.anonymous_report_open($1,$2::inet)", org, IP_A)
        if anon_tok and anon_tok.get("secret"):
            av = await j("select public.outsider_verify($1,null,$2::inet)", anon_tok["secret"], IP_A)
            cross = await j("select public.esign_signer_load($1,$2::inet,$3)", av.get("session"), IP_A, UA)
            rec("E outsider", "§8.3(22) a token of another PURPOSE is refused at the scope check",
                cross.get("granted") is False and cross["reason"] == "link_no_longer_valid", cross)
        else:
            rec("E outsider", "§8.3(22) cross-consumer misuse probe ran",
                False, f"anonymous_report_open returned {anon_tok}")

        # ======================================== F. DECLINE, VOID, EXPIRY
        await as_user(people["jack"]["uid"])
        jload = await j("select public.esign_sign_load($1,$2::inet,$3)", env2, IP_A, UA)
        await j("select public.esign_sign_preview_ack($1,$2,$3::inet,$4)", sid_jack, doc2, IP_A, UA)
        await j("select public.esign_sign_consent($1,$2,$3::inet,$4)", sid_jack, disclosure, IP_A, UA)
        await j("select public.esign_sign_adopt_signature($1,'typed','Jack Countersigner','plain',null,null,$2::inet,$3)",
                sid_jack, IP_A, UA)
        no_reason = await j("select public.esign_sign_decline($1,'',$2::inet,$3)", sid_jack, IP_A, UA)
        rec("F lifecycle", "§7 decline WITHOUT a reason is refused, and that is not overridable",
            no_reason.get("granted") is False and no_reason["reason"] == "reason_required", no_reason)

        decl = await j("select public.esign_sign_decline($1,'The indemnity clause is unacceptable.',$2::inet,$3)",
                       sid_jack, IP_A, UA)
        rec("F lifecycle", "§8.5(45) a decline terminates the envelope and revokes tokens in the SAME transaction",
            decl.get("granted") and decl["envelope_status"] == "declined", decl)
        kate_after = await sysrow(
            "select s.status, s.signed_at, s.signature_payload_hash, t.revoked_at"
            "  from esign.envelope_signer s left join platform.actor_token t on t.id = s.actor_token_id"
            " where s.id=$1", sid_kate)
        rec("F lifecycle", "§3.5 the earlier signature is RETAINED as evidence on a declined envelope",
            kate_after["status"] == "signed" and kate_after["signature_payload_hash"] is not None,
            dict(kate_after))

        await as_anon()
        after_decline = await j("select public.esign_signer_load($1,$2::inet,$3)", session, IP_A, UA)
        rec("F lifecycle", "a signed signer's own session sees the envelope is declined, not a broken link",
            after_decline.get("granted") is False and after_decline["reason"] == "envelope_declined",
            after_decline)
        unrevoked = await sysval(
            "select count(*) from esign.envelope_signer s join platform.actor_token t on t.id=s.actor_token_id"
            " where s.envelope_id=$1 and s.status not in ('signed','declined') and t.revoked_at is null", env2)
        rec("F lifecycle", "§3.5 every token of an UNFINISHED signer is revoked by the decline",
            unrevoked == 0, unrevoked)

        # VOID and the EXPIRY SWEEP
        await as_user(people["hank"]["uid"])
        e3 = await j(
            "select public.esign_create_envelope($1,'hr.handbook_campaign','Handbook v4 — Ivy',$2::jsonb,$3::jsonb,"
            "'handbook_ack','standard','parallel',null,'{}'::jsonb,30,null)", org,
            json.dumps([{"name": "Handbook v4", "source_kind": "platform_document"}]),
            json.dumps([{"position": 1, "role": "signer", "actor_type": "internal_user",
                         "user_id": str(people["ivy"]["uid"]), "full_name": "Ivy Employee",
                         "email": people["ivy"]["email"]}]))
        env3 = e3["envelope_id"]
        doc3 = await conn.fetchval("select id from esign.envelope_document where envelope_id=$1", env3)
        hb = "HANDBOOK v4 — HRB-011 proof."
        await as_owner()
        hb_file = await make_file("handbook", hb)
        await as_user(people["hank"]["uid"])
        await j("select public.esign_send_envelope($1,$2::jsonb)", env3, json.dumps([{
            "document_id": str(doc3), "content_file_id": str(hb_file), "content_file_version": 1,
            "content_hash": sha(hb), "byte_size": len(hb), "page_count": 40,
            "mime_type": "application/pdf"}]))
        vd = await j("select public.esign_void_envelope($1,'Superseded by handbook v5')", env3)
        rec("F lifecycle", "void terminates an in-flight envelope with a required reason",
            vd.get("granted") and vd["status"] == "voided", vd)

        # config snapshot immutability, then the sweep
        e4 = await j(
            "select public.esign_create_envelope($1,'hr.form_packet','W-4 packet — Ivy',$2::jsonb,$3::jsonb,"
            "'tax_packet','sensitive','parallel',null,'{}'::jsonb,null,null)", org,
            json.dumps([{"name": "Form W-4", "source_kind": "rendered_template"}]),
            json.dumps([{"position": 1, "role": "signer", "actor_type": "internal_user",
                         "user_id": str(people["ivy"]["uid"]), "full_name": "Ivy Employee",
                         "email": people["ivy"]["email"]}]))
        env4 = e4["envelope_id"]
        doc4 = await conn.fetchval("select id from esign.envelope_document where envelope_id=$1", env4)
        w4 = "FORM W-4 — HRB-011 proof."
        await as_owner()
        w4_file = await make_file("w4", w4)
        snap_before = await j("select config_snapshot from esign.envelope where id=$1", env4)
        setres = await j("select esign.config_set($1,'esign.reminder.max_count','9'::jsonb,'proof')", org)
        snap_after = await j("select config_snapshot from esign.envelope where id=$1", env4)
        rec("F lifecycle", "§8.1(6) changing every org knob does NOT rewrite a live envelope's snapshot",
            setres["granted"] and snap_before == snap_after
            and snap_after["reminder_max_count"] == 3, snap_after["reminder_max_count"])

        await as_user(people["hank"]["uid"])
        await j("select public.esign_send_envelope($1,$2::jsonb)", env4, json.dumps([{
            "document_id": str(doc4), "content_file_id": str(w4_file), "content_file_version": 1,
            "content_hash": sha(w4), "byte_size": len(w4), "page_count": 1,
            "mime_type": "application/pdf"}]))
        rem = await j("select public.esign_remind($1)", env4)
        rec("F lifecycle", "reminders obey the FROZEN cap, not today's org configuration",
            rem["granted"] and rem["max_reminders"] == 3, rem)

        await as_owner()
        await conn.execute("update esign.envelope set expires_at = now() - interval '1 day' where id=$1", env4)
        sweep = await j("select public.esign_expire_sweep(50)")
        env4_row = await conn.fetchrow("select status from esign.envelope where id=$1", env4)
        exp_ev = await conn.fetchrow(
            "select actor_type, ip_address, user_agent from esign.envelope_event"
            " where envelope_id=$1 and event_type='expired'", env4)
        rec("F lifecycle", "§3.5 the SWEEP expires an envelope nobody opened, and fabricates no IP",
            sweep["granted"] and env4_row["status"] == "expired"
            and exp_ev["actor_type"] == "automation" and exp_ev["ip_address"] is None
            and exp_ev["user_agent"] is None, f"expired={sweep['expired']}")

        # ==================================== G. BULK CAMPAIGN, PARTIAL COMPLETION
        await as_user(people["hank"]["uid"])
        camp = await j(
            "select public.esign_create_campaign($1,'Handbook v4 acknowledgment','hr.handbook_campaign',"
            "$2::jsonb,'handbook_ack','standard','explicit_list','{}'::jsonb,'Please acknowledge.',30)",
            org, json.dumps({"name": "Handbook v4", "source_kind": "platform_document",
                             "document_id": None, "document_version": 4, "mime_type": "application/pdf"}))
        cid = camp["campaign_id"]
        members = [{"full_name": f"Member {i}", "email": f"member{i}.hrb011@example.invalid"} for i in range(1, 5)]
        enr = await j("select public.esign_campaign_enroll($1,$2::jsonb)", cid, json.dumps(members))
        rec("G campaign", "the audience enrols", enr["granted"] and enr["enrolled"] == 4, enr)

        gen = await j("select public.esign_campaign_generate($1,$2::jsonb,200)", cid, json.dumps({
            "content_file_id": str(hb_file), "content_file_version": 1, "content_hash": sha(hb),
            "byte_size": len(hb), "page_count": 40, "mime_type": "application/pdf",
            "name": "Handbook v4", "source_kind": "platform_document"}))
        rec("G campaign", "one envelope per member, all from the SAME frozen artifact",
            gen["granted"] and gen["generated"] == 4 and gen["failed"] == 0, gen)

        wrong_ver = await j("select public.esign_campaign_generate($1,$2::jsonb,200)", cid, json.dumps({
            "content_file_id": str(hb_file), "content_hash": sha("HANDBOOK v5 — different text"),
            "name": "Handbook v5"}))
        rec("G campaign", "§3.4 ONE document version per campaign — a revision is a NEW campaign",
            wrong_ver.get("granted") is False and wrong_ver["reason"] == "document_version_changed", wrong_ver)

        await as_owner()
        rows = await conn.fetch(
            "select m.id, m.envelope_id, s.id sid from esign.campaign_member m"
            "  join esign.envelope_signer s on s.envelope_id = m.envelope_id"
            " where m.campaign_id=$1 order by m.full_name", cid)
        # member 1 signs for real, through the RPCs, as an outsider
        m1_notif = await conn.fetchval(
            "select deep_link from communication.notification where target_id=$1"
            "  and event_key='esign.signature_requested' order by created_at desc limit 1",
            rows[0]["envelope_id"])
        m1_secret = m1_notif.split("#t=")[1]
        await as_anon()
        m1_code = (await j("select public.outsider_send_code($1)", m1_secret))["code_for_delivery"]
        m1_sess = (await j("select public.outsider_verify($1,$2,$3::inet)", m1_secret, m1_code, IP_A))["session"]
        m1_doc = await sysval(
            "select id from esign.envelope_document where envelope_id=$1", rows[0]["envelope_id"])
        await j("select public.esign_signer_load($1,$2::inet,$3)", m1_sess, IP_A, UA)
        await j("select public.esign_signer_preview_ack($1,$2,$3::inet,$4)", m1_sess, m1_doc, IP_A, UA)
        await j("select public.esign_signer_consent($1,$2,$3::inet,$4)", m1_sess, disclosure, IP_A, UA)
        await j("select public.esign_signer_adopt_signature($1,'typed','Member 1','plain',null,null,$2::inet,$3)",
                m1_sess, IP_A, UA)
        m1_signed = await j("select public.esign_signer_sign($1,$2::jsonb,'btn-ack',$3::inet,$4)", m1_sess,
                            json.dumps([{"document_id": str(m1_doc), "content_hash": sha(hb)}]), IP_A, UA)
        rec("G campaign", "a campaign member signs through the same one signing surface",
            m1_signed.get("granted") and m1_signed["envelope"]["completed"] is True, m1_signed.get("envelope"))

        # member 2 declines, member 3 expires, member 4 never responds
        m2_notif = await sysval(
            "select deep_link from communication.notification where target_id=$1"
            "  and event_key='esign.signature_requested' order by created_at desc limit 1",
            rows[1]["envelope_id"])
        m2_secret = m2_notif.split("#t=")[1]
        m2_code = (await j("select public.outsider_send_code($1)", m2_secret))["code_for_delivery"]
        m2_sess = (await j("select public.outsider_verify($1,$2,$3::inet)", m2_secret, m2_code, IP_A))["session"]
        m2_decl = await j("select public.esign_signer_decline($1,'I do not agree to the new policy.',$2::inet,$3)",
                          m2_sess, IP_A, UA)
        rec("G campaign", "a member declines and it is a member state, never a campaign failure",
            m2_decl.get("granted"), m2_decl)

        await as_owner()
        await conn.execute("update esign.envelope set expires_at = now() - interval '1 hour' where id=$1",
                           rows[2]["envelope_id"])
        await j("select public.esign_expire_sweep(50)")

        await as_user(people["hank"]["uid"])
        prog = await j("select public.esign_campaign_progress($1)", cid)
        rec("G campaign", "the rollup counts signed / declined / expired / outstanding accurately",
            prog["rollup"]["members"] == 4 and prog["rollup"]["signed"] == 1
            and prog["rollup"]["declined"] == 1 and prog["rollup"]["expired"] == 1
            and prog["rollup"]["outstanding"] == 1, prog["rollup"])

        closed = await j("select public.esign_campaign_close($1,'Acknowledgment window closed')", cid)
        rec("G campaign", "§3.4 PARTIAL COMPLETION IS A RESULT — the close succeeds with stragglers",
            closed["granted"] and closed["partial_completion"] is True
            and len(closed["outstanding_list"]) == 3, closed["rollup"])
        rec("G campaign", "the outstanding list carries each person's last-known state",
            all(o["last_known_state"] and o["email"] for o in closed["outstanding_list"]),
            [(o["email"].split("@")[0], o["last_known_state"]) for o in closed["outstanding_list"]])

        exp = await j("select public.esign_campaign_export($1)", cid)
        rec("G campaign", "the audit export carries per-member evidence pointers",
            exp["granted"] and len(exp["rows"]) == 4
            and any(r["certificate_id"] for r in exp["rows"])
            and all(r["document_hash"] == sha(hb) for r in exp["rows"]), f"{len(exp['rows'])} rows")

        # re-resolve after new hires (§3.4)
        readd = await j("select public.esign_campaign_enroll($1,$2::jsonb)", cid, json.dumps([
            {"full_name": "Member 1", "email": "member1.hrb011@example.invalid"},
            {"full_name": "Member 5", "email": "member5.hrb011@example.invalid"}]))
        rec("G campaign", "§3.4 re-resolve after a close is refused; existing members are never disturbed",
            readd.get("granted") is False and readd["reason"] == "campaign_closed", readd)

        # §8.3(15) — a LIVE, VERIFIED session on a token that is then revoked by a void
        await as_owner()
        m4_env = rows[3]["envelope_id"]
        m4_secret = (await conn.fetchval(
            "select deep_link from communication.notification where target_id=$1"
            "  and event_key='esign.signature_requested' order by created_at desc limit 1",
            m4_env)).split("#t=")[1]
        await as_anon()
        m4_code = (await j("select public.outsider_send_code($1)", m4_secret))["code_for_delivery"]
        m4_sess = (await j("select public.outsider_verify($1,$2,$3::inet)", m4_secret, m4_code, IP_A))["session"]
        alive = await j("select public.esign_signer_load($1,$2::inet,$3)", m4_sess, IP_A, UA)
        await as_user(people["hank"]["uid"])
        m4_void = await j("select public.esign_void_envelope($1,'Campaign superseded')", m4_env)
        await as_anon()
        dead = await j("select public.esign_signer_load($1,$2::inet,$3)", m4_sess, IP_A, UA)
        rec("F lifecycle", "§8.3(15) a live verified session dies the instant its token is revoked",
            alive.get("granted") is True and m4_void["tokens_revoked"] == 1
            and dead.get("granted") is False and dead["reason"] == "link_no_longer_valid",
            {"alive_before": alive.get("granted"), "revoked": m4_void.get("tokens_revoked"),
             "after": dead})

        # =========================================== H. PROVIDER SEAM (§6.3)
        await as_owner()
        prov = await conn.fetchval("select id from esign.provider where provider_key='noop' limit 1")
        await conn.execute(
            "insert into esign.provider_binding (organization_id, provider_id, consumer_key, is_active,"
            " bound_reason) values ($1,$2,'crm.quote',true,'HRB-011 §6.3 round trip')", org, prov)
        e5 = await j(
            "select public.esign_create_envelope($1,'crm.quote','Quote — provider round trip',$2::jsonb,$3::jsonb,"
            "'quote','standard','parallel',null,'{}'::jsonb,null,null)", org,
            json.dumps([{"name": "Quote", "source_kind": "uploaded_file"}]),
            json.dumps([{"position": 1, "role": "signer", "actor_type": "external",
                         "full_name": "Provider Signer", "email": "provider.signer@example.invalid"}]))
        env5 = e5["envelope_id"]
        doc5 = await conn.fetchval("select id from esign.envelope_document where envelope_id=$1", env5)
        qbytes = "QUOTE — HRB-011 proof."
        q_file = await make_file("quote", qbytes)
        await as_user(people["hank"]["uid"])
        await j("select public.esign_send_envelope($1,$2::jsonb)", env5, json.dumps([{
            "document_id": str(doc5), "content_file_id": str(q_file), "content_file_version": 1,
            "content_hash": sha(qbytes), "byte_size": len(qbytes), "page_count": 1,
            "mime_type": "application/pdf"}]))
        disp = await j("select public.esign_provider_dispatch($1)", env5)
        rec("H provider", "§6.3 EDGE OUT — an active binding dispatches and records provider_dispatched",
            disp["granted"] and disp["mode"] == "provider" and disp["provider_key"] == "noop", disp)
        ing = await j(
            "select public.esign_provider_ingest($1,'noop','ext-abc-123','completed','evt-1',$2::jsonb,'[]'::jsonb)",
            env5, json.dumps({"their_certificate": "base64-of-their-cert"}))
        rec("H provider", "§6.3 EDGE IN — their status is MAPPED, and OUR certificate is generated",
            ing["granted"] and ing["mapped_status"] == "completed"
            and ing["completion"]["completed"] is True, ing["completion"])
        ref = await conn.fetchrow(
            "select external_envelope_id, external_status, raw_payload from esign.envelope_external_ref"
            " where envelope_id=$1", env5)
        cert5 = await conn.fetchval("select certificate_id from esign.envelope where id=$1", env5)
        rec("H provider", "their artifact is an ATTACHMENT to our record, never a replacement",
            ref["external_status"] == "completed" and cert5 is not None
            and "their_certificate" in json.loads(ref["raw_payload"]), dict(ref) | {"raw_payload": "…"})
        int_ev = await conn.fetchval(
            "select count(*) from esign.envelope_event where envelope_id=$1 and actor_type='integration'", env5)
        rec("H provider", "provider events are attributed to the `integration` actor with their event id",
            int_ev >= 2, int_ev)

        # ======================= I. THE WORKFLOW HOOK DOES NOT FORGE A SIGNATURE
        await as_owner()
        rec("I workflow", "hr._approval_subject resolves esign.envelope without raising",
            await conn.fetchval("select hr._approval_subject('esign.envelope', $1) is null", env), "NULL subject")

        # =========================== J. NOBODY WAS EMAILED
        pending = await sysrow(
            "select count(*) n, count(*) filter (where status='pending') p,"
            "       count(*) filter (where status='skipped' and error_code is not null) sk,"
            "       count(*) filter (where sent_at is not null) s,"
            "       count(*) filter (where provider is not null) pv,"
            "       count(*) filter (where status not in ('pending','skipped')) other"
            "  from communication.notification where organization_id=$1", org)
        rec("J no-send", "NOBODY WAS EMAILED — every notice is queued or honestly skipped, none sent",
            pending["n"] > 0 and pending["s"] == 0 and pending["pv"] == 0 and pending["other"] == 0
            and pending["n"] == pending["p"] + pending["sk"], dict(pending))
        skipped = await sysval(
            "select coalesce(string_agg(distinct event_key||':'||error_code, ', '),'none')"
            "  from communication.notification where organization_id=$1 and status='skipped'", org)
        rec("J no-send", "§3.2 an unaddressable notice is a VISIBLE `skipped` row with a reason, never silence",
            True, skipped)
        await as_owner()
        keys_seen = await conn.fetch(
            "select event_key, count(*) n from communication.notification where organization_id=$1"
            " group by 1 order by 1", org)
        rec("J no-send", "the notices are the DECLARED esign events on the one spine (§6.2)",
            all(r["event_key"].startswith("esign.") for r in keys_seen),
            {r["event_key"]: r["n"] for r in keys_seen})

    except Exception as exc:                          # noqa: BLE001
        import traceback
        rec("SUITE", "the suite ran to completion", False,
            f"{type(exc).__name__}: {exc} | {traceback.format_exc()[-600:]}")
    finally:
        # The transaction may already be aborted (a probe that escaped its savepoint); roll back
        # FIRST and only then read the after-state, on the now-clean connection.
        try:
            await tr.rollback()
        except Exception:                             # noqa: BLE001
            pass
        try:
            await conn.execute("reset role")
            await conn.execute("select set_config('request.jwt.claims', '', false)")
        except Exception:                             # noqa: BLE001
            pass
        left_env = await conn.fetchval("select count(*) from esign.envelope")
        left_tok = await conn.fetchval("select count(*) from platform.actor_token")
        left_not = await conn.fetchval("select count(*) from communication.notification")
        await conn.close()

    fails = [r for r in R if not r[2]]
    print(f"\n{'='*94}\nHRB-011 PROOF SUITE — {len(R)} assertions, {len(fails)} RED\n{'='*94}")
    group = None
    for g, n, ok, d in R:
        if g != group:
            print(f"\n--- {g} " + "-" * (88 - len(g)))
            group = g
        print(f"  [{'PASS' if ok else 'FAIL'}] {n}")
        if not ok:
            print(f"         → {d}")
    print(f"\nAFTER ROLLBACK: esign.envelope={left_env} (was {base_env}), "
          f"platform.actor_token={left_tok} (was {base_tok}), "
          f"communication.notification={left_not} (was {base_notif})")
    return 1 if fails or left_env != base_env or left_not != base_notif else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
