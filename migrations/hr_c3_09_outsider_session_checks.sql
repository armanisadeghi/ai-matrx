-- HR domain C3 — migration 9 (register item HRB-007 follow-up, lane core-c3-access).
--
-- 🚨 `platform.assert_outsider_scope` CHECKED THE SCOPE AND NOTHING ELSE. C7's probes (register
-- HRB-011 findings 2/3, ratified) found that the ONE helper §5.4 says "no RPC hand-rolls this
-- check" never verified two of the things that make an outsider session an outsider session:
--
--   (a) §4.3 condition 3 / §5.4 — **`verified_at`**. A purpose that declares a verification factor
--       admitted a session that had never passed one. The token could require `email_code` and the
--       holder could act without ever proving they held the mailbox.
--   (b) §5.7 rule 6 — **the session IP pin**. Sessions are IP-pinned by default and the pin was
--       recorded at verification, then never read again.
--
-- Both were missing on ALL EIGHT purposes. C7 enforced them locally, for the signing family only,
-- and recorded the gap against this lane by name (`esign._ctx_outsider` RECORDED DECISIONS 2 and
-- 7). That is the right instinct and the wrong altitude: seven other purposes — the applicant, the
-- candidate portal, the referee, the preboarding hire, the former-employee records requester, the
-- anonymous reporter and the external investigator — inherited neither check, and every future
-- purpose would have had to remember to re-implement both.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. THE PIN IS ENFORCED **FAIL-CLOSED**, AND THAT IS A REAL TIGHTENING OVER C7's LOCAL FORM.
--    C7's check reads `ses.ip is not null AND p_ip is not null AND ses.ip <> p_ip` — so a caller
--    that simply does not supply an IP walks past the pin. Here, if a pin was RECORDED and the
--    caller supplies no IP, the session is refused: we cannot prove the holder is where the pin
--    says, and an unprovable pin is not a pin. The pin is only ever enforced where one actually
--    exists, so the purposes that decline pinning are untouched — `hr.apply` sets
--    `ip_pinned = false`, so `outsider_verify` records no IP and there is nothing to match.
--
-- 2. THE VERIFICATION CHECK READS THE **TOKEN's** FACTOR, not the consumer default. The registry
--    default is what a token is MINTED with; `platform.actor_token.verification_factor` is what
--    THIS token actually carries after any per-mint override (§5.6 lets an org lower the signer
--    factor to `none` for standard envelopes). Reading the default would refuse sessions the
--    issuer deliberately allowed, and reading it the other way would admit sessions the issuer
--    deliberately hardened.
--
-- 3. 🚨 EVERY REFUSAL IS ONE UNIFORM ENVELOPE, AND THE TRUE REASON GOES TO THE LEDGER. §5.7 rule 2
--    requires that unknown, expired, revoked, exhausted and wrong-consumer be indistinguishable to
--    the caller. Before this change the helper raised THREE distinguishable messages — "outsider
--    session is not valid", "outsider token is not valid", "outsider scope does not cover (…)" —
--    which is exactly the enumeration oracle that rule forbids, and adding two more conditions
--    would have made it worse. All six failure modes now raise ONE message with one errcode, and
--    the true reason is written to `platform.actor_token_event`, which is what §5.2 calls "the
--    abuse-control substrate AND the audit answer to who touched this link".
--
-- 4. C7's LOCAL CHECKS ARE LEFT IN PLACE AS REDUNDANT-BUT-HARMLESS, and their two callers are
--    given the one argument the centralised pin needs. `esign._ctx_outsider` and
--    `public.esign_signer_download_url` called the helper WITHOUT an IP, so centralising the pin
--    without passing it through would have failed their sessions closed. Both are updated
--    PROGRAMMATICALLY from their own live definitions, changing nothing but the argument list, so
--    the edit to another lane's functions is provably minimal. Their local `verified_at` and IP
--    branches can no longer be reached — this helper refuses first — so they are now dead code
--    that C7 may delete at leisure. **Routed to the HRB-011 owner; not deleted here, because
--    deleting another lane's logic is not a side effect of fixing mine.**
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ the ledger needs one more verb
do $$ begin
  if exists (select 1 from pg_constraint
              where conname = 'actor_token_event_event_type_check'
                and conrelid = 'platform.actor_token_event'::regclass
                and pg_get_constraintdef(oid) not like '%scope_rejected%') then
    alter table platform.actor_token_event drop constraint actor_token_event_event_type_check;
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'actor_token_event_event_type_check'
                    and conrelid = 'platform.actor_token_event'::regclass) then
    alter table platform.actor_token_event add constraint actor_token_event_event_type_check
      check (event_type in ('minted','sent','resolved','verification_sent','verification_passed',
                            'verification_failed','session_issued','session_expired',
                            'action_performed','rate_limited','replay_rejected','expired',
                            'revoked','reanchored','scope_rejected'));
  end if;
end $$;

-- ============================================================ §5.4 the ONE scope assertion
create or replace function platform.assert_outsider_scope(
  p_session text, p_resource text, p_id uuid, p_action text, p_ip inet default null)
returns jsonb
language plpgsql security definer set search_path = platform, public
as $fn$
declare
  s platform.actor_session%rowtype;
  t platform.actor_token%rowtype;
  g jsonb; ok boolean := false; v_reason text;
  -- §5.7 rule 2: ONE client-facing string for every failure mode. The true reason goes to the
  -- ledger, never to the caller — no enumeration oracle.
  c_uniform constant text := 'This link is no longer valid — ask the sender for a new one.';
begin
  select * into s from platform.actor_session
   where session_hash = encode(extensions.digest(coalesce(p_session,''),'sha256'),'hex');

  if not found then
    -- nothing to attribute an event to, so nothing is lost by returning immediately
    return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid',
                              'message', c_uniform);
  end if;

  select * into t from platform.actor_token where id = s.actor_token_id;

  v_reason := case
    when s.revoked_at is not null                      then 'session_revoked'
    when s.expires_at <= now()                         then 'session_expired'
    -- (a) §4.3 condition 3: a purpose that requires a factor requires a session that PASSED it.
    --     RECORDED DECISION 2 — the TOKEN's factor, not the consumer default.
    when t.verification_factor <> 'none'
         and s.verified_at is null                     then 'session_not_verified'
    -- (b) §5.7 rule 6: the pin, enforced FAIL-CLOSED (RECORDED DECISION 1). Only where a pin was
    --     actually recorded — a purpose that declines pinning records none and is unaffected.
    when s.ip is not null and p_ip is null             then 'session_ip_unprovable'
    when s.ip is not null and p_ip is distinct from s.ip then 'session_ip_moved'
    when t.id is null                                  then 'token_missing'
    when not t.is_active or t.revoked_at is not null   then 'token_revoked'
    when t.expires_at <= now()                         then 'token_expired'
    else null
  end;

  if v_reason is null then
    for g in select * from jsonb_array_elements(t.scope -> 'grants') loop
      if (g ->> 'resource') = p_resource
         and ((g ->> 'id')::uuid is not distinct from p_id or (g ->> 'parent_id') is not null)
         and p_action in (select jsonb_array_elements_text(coalesce(g -> 'actions','[]'::jsonb)))
      then ok := true; exit; end if;
    end loop;
    if not ok then v_reason := 'scope_not_covered'; end if;
  end if;

  if v_reason is not null then
    insert into platform.actor_token_event
      (organization_id, actor_token_id, session_id, event_type, ip, detail)
    values (t.organization_id, t.id, s.id,
            case when v_reason = 'scope_not_covered' then 'scope_rejected' else 'replay_rejected' end,
            p_ip,
            jsonb_build_object('true_reason', v_reason, 'resource', p_resource,
                               'action', p_action, 'target_id', p_id));
    -- 🚨 THE REFUSAL IS RETURNED, NOT RAISED, AND A PROBE CAUGHT THE FIRST DRAFT RAISING IT.
    -- This is THE REFUSAL-ENVELOPE LAW again, in the one place it is easiest to forget: an event
    -- written and then followed by a RAISE is rolled back WITH the exception, so the first form of
    -- this function refused correctly and wrote NOTHING — proven live, the ledger assertions came
    -- back false. §5.7 leans on that ledger for rate limiting and for "who touched this link", and
    -- a rate limiter that loses its own evidence does not limit. Every caller checks `granted`.
    return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid',
                              'message', c_uniform);
  end if;

  update platform.actor_session set ip = coalesce(s.ip, p_ip) where id = s.id and s.ip is null;

  return jsonb_build_object('granted', true, 'actor_token_id', t.id, 'session_id', s.id,
                            'organization_id', t.organization_id, 'consumer_key', t.consumer_key,
                            'subject_type', t.subject_type, 'subject_id', t.subject_id,
                            'verification_factor', t.verification_factor,
                            'verified_at', s.verified_at, 'ip_pinned', s.ip is not null);
end
$fn$;

-- The 4-argument form is retired FIRST: while both overloads exist the name is ambiguous, and
-- leaving it would let a caller silently opt out of the pin by calling the old signature.
drop function if exists platform.assert_outsider_scope(text, text, uuid, text);

comment on function platform.assert_outsider_scope(text, text, uuid, text, inet) is
  'SPEC-ESIGN 5.4: the ONE scope assertion - no RPC hand-rolls this check. It verifies the session is live, that it PASSED the token''s verification factor (4.3 condition 3), that it is acting from its pinned IP (5.7 rule 6, fail-closed: an unprovable pin is not a pin), that the token is live, and only then that the scope covers (resource, id, action). Every failure raises ONE uniform message (5.7 rule 2) and writes the true reason to platform.actor_token_event.';

revoke all on function platform.assert_outsider_scope(text, text, uuid, text, inet) from public;
revoke all on function platform.assert_outsider_scope(text, text, uuid, text, inet) from anon;
grant execute on function platform.assert_outsider_scope(text, text, uuid, text, inet) to authenticated, service_role;

-- ============================================================ RECORDED DECISION 4: pass the IP through
-- Rewritten programmatically from each function's own live definition, so nothing but the argument
-- list changes. Without this the centralised pin would fail C7's own sessions closed.
-- Idempotent against BOTH shapes: this migration's own earlier run already appended `p_ip` to
-- these call sites, so the rewrite matches the original 4-argument form OR the 5-argument one it
-- may already have produced. It is a no-op once the verdict check is in place.
do $$
declare v_def text; v_new text; v_n int := 0; v_have int := 0;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'esign' and p.proname = '_ctx_outsider';
  if v_def is not null then
    v_have := v_have + 1;
    v_new := v_def;
    v_new := replace(v_new,
      $q$v_ctx := platform.assert_outsider_scope(p_session, 'esign_envelope_signer', v_signer, p_action);$q$,
      $q$v_ctx := platform.assert_outsider_scope(p_session, 'esign_envelope_signer', v_signer, p_action, p_ip);$q$);
    if v_new not like '%v_ctx ->> ''granted''%' then
      v_new := replace(v_new,
        $q$v_ctx := platform.assert_outsider_scope(p_session, 'esign_envelope_signer', v_signer, p_action, p_ip);$q$,
        $q$v_ctx := platform.assert_outsider_scope(p_session, 'esign_envelope_signer', v_signer, p_action, p_ip);
    if not coalesce((v_ctx ->> 'granted')::boolean, false) then
      return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid');
    end if;$q$);
    end if;
    if v_new <> v_def then execute v_new; v_n := v_n + 1; end if;
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'esign_signer_download_url';
  if v_def is not null then
    v_have := v_have + 1;
    v_new := v_def;
    v_new := replace(v_new,
      $q$perform platform.assert_outsider_scope(p_session, 'esign_envelope_document', p_document_id, 'download');$q$,
      $q$perform platform.assert_outsider_scope(p_session, 'esign_envelope_document', p_document_id, 'download', p_ip);$q$);
    v_new := replace(v_new,
      $q$perform platform.assert_outsider_scope(p_session, 'esign_envelope_document', p_document_id, 'download', p_ip);$q$,
      $q$if not coalesce((platform.assert_outsider_scope(p_session, 'esign_envelope_document', p_document_id, 'download', p_ip) ->> 'granted')::boolean, false) then
      return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid');
    end if;$q$);
    if v_new <> v_def then execute v_new; v_n := v_n + 1; end if;
  end if;

  if v_have <> 2 then
    raise exception 'hr_c3_09: expected 2 esign call sites, found % — the lane moved', v_have;
  end if;
  raise notice 'hr_c3_09: rewrote % of % esign call site(s) (0 means already converted)', v_n, v_have;
end $$;

-- ============================================================ assertions
do $$
declare v_bad int;
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'platform' and p.proname = 'assert_outsider_scope'
                and pg_get_function_identity_arguments(p.oid) = 'text, text, uuid, text') then
    raise exception 'hr_c3_09: the pin-less 4-argument form still exists; a caller could opt out of the pin';
  end if;

  -- both checks are IN the shared helper, not only in a consumer
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'platform' and p.proname = 'assert_outsider_scope') not like '%verified_at is null%' then
    raise exception 'hr_c3_09: the helper does not check verified_at';
  end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'platform' and p.proname = 'assert_outsider_scope') not like '%session_ip_moved%' then
    raise exception 'hr_c3_09: the helper does not check the IP pin';
  end if;

  -- 🚨 ONE uniform client-facing string: the helper must not raise anything else
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'platform' and p.proname = 'assert_outsider_scope')
     like '%outsider scope does not cover%' then
    raise exception 'hr_c3_09: a distinguishable refusal message survives — that is the enumeration oracle §5.7 rule 2 forbids';
  end if;

  -- every esign call site threads the IP, or the pin is unenforceable for that lane
  -- every call site threads the IP AND checks the verdict; a `perform` would proceed on a refusal
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc like '%assert_outsider_scope(p_session%'
     and p.proname <> 'assert_outsider_scope'
     and (p.prosrc not like '%p_ip)%' or p.prosrc not like '%granted%');
  if v_bad > 0 then
    raise exception 'hr_c3_09: % caller(s) of assert_outsider_scope do not pass an IP or do not check `granted`', v_bad;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where p.proname <> 'assert_outsider_scope'
                and p.prosrc like '%perform platform.assert_outsider_scope%') then
    raise exception 'hr_c3_09: a caller still uses `perform`, which discards the refusal verdict';
  end if;
  -- the helper returns its refusal; it must not raise one (the RAISE is what lost the ledger row)
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'platform' and p.proname = 'assert_outsider_scope') like '%raise exception%' then
    raise exception 'hr_c3_09: the helper still raises a refusal, so its ledger write is rolled back with it';
  end if;

  -- the purposes that decline pinning must stay unpinned, or the apply form breaks
  if (select ip_pinned from platform.outsider_consumer
       where consumer_key = 'hr.apply' and is_subject_resource and deleted_at is null) then
    raise exception 'hr_c3_09: hr.apply is IP-pinned; a public apply form cannot be';
  end if;

  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  if v_bad > 0 then
    raise exception 'hr_c3_09: % hr tokens no longer certify', v_bad;
  end if;
end $$;
