-- DD-212 — AN ANONYMOUS DOOR IS DECLARED BY A FLAG, NEVER GUESSED FROM PROSE.
-- Closes DD-207 in the same file (the silent door rows on the definer axis).
-- (B-99, Data Doctrine adoption program, 2026-09-14. SECURITY P1.
--  Found by V-68 while verifying DD-202; the prose test came in with B-89's D9.)
--
-- THE DEFECT — REPRODUCED LIVE BY THIS LANE, ROLLED BACK
-- -----------------------------------------------------
-- DD-202's birth guard and `check:impl-doors` D9 both decide whether a function
-- may be reached by a signed-out visitor by running a SUBSTRING regex over a
-- `platform.client_callable_door` row's `reason`:
--     reason ~* '(anonymous|signed[- ]out|guest|kiosk|outsider)'
-- A regex reads words, not meaning. Measured on brsgrqvjdzwihsvnfqkf 2026-09-14,
-- in one rolled-back transaction:
--
--   insert into platform.client_callable_door (schema_name, function_name, identity_args, reason)
--   values ('public','b99_negated_door','',
--           'SIGNED-IN door (authenticated only; anon revoked). No anonymous caller exists for it in any repo.');
--   create function public.b99_negated_door() returns void language sql as $b$ select 1 $b$;
--
--   probe                        anon may EXECUTE   proacl
--   RED  (negated prose plant)   TRUE               {=X/postgres,postgres=X,authenticated=X,service_role=X}
--   CONTROL (no such words)      FALSE              {postgres=X,authenticated=X,service_role=X,dashboard_user=X,svc_seo=X}
--
-- A door row that says THE OPPOSITE of an anonymous purpose opened the birth
-- door, and no NOTICE was emitted: the guard did not think it had skipped
-- anything. The prose is not a rare accident — of 971 live door rows, 314 match
-- that regex and only 47 name a function `anon` can actually execute. 267 of
-- them are honest SIGNED-IN declarations whose wording happens to contain the
-- word the guard read as permission ("…an anonymous caller can do nothing here").
--
-- THE FIX: THE FLAG IS THE TRUTH, PROSE IS PROSE
-- ----------------------------------------------
-- `platform.client_callable_door` gains `anonymous_callers boolean not null
-- default false` and `anonymous_purpose text`. A door is anonymous because a
-- human set the flag and wrote what the signed-out caller is doing there — never
-- because a sentence contained a word. Every reader (the DD-202 birth trigger,
-- `check:impl-doors` D5 and D9, the door-row harness) consults the flag; after
-- this file no regex over `reason` decides anonymity anywhere in this repo, and
-- `grep` over `scripts/` and `migrations/` proves it.
--
-- WHAT THE BRIEF ASKED FOR AND WHAT IS SHIPPED INSTEAD — MEASURED
-- --------------------------------------------------------------
-- The brief offered the simpler constraint: refuse those five words in `reason`
-- outright whenever the flag is false, and rewrite the 267 reasons. That is NOT
-- shipped, because it builds a false wall, measured:
--   * four live door rows say "…the caller is resolved inside the body by
--     `hr.kiosk_device_set_trust`" — a FUNCTION NAME, and D6/D11 check that very
--     literal is still in the reason. Banning the word `kiosk` makes it
--     impossible to declare an honest door on an `hr.kiosk_*` function.
--   * the same holds for `guest` (`public.check_guest_execution_limit`,
--     `cleanup_old_guest_records`) and for `public.anonymous_report_open`.
-- What IS refused is the AFFIRMATIVE CLAIM: when `anonymous_callers = false`,
-- the reason may not contain an anonymous/signed-out/guest/kiosk/outsider
-- "door" or "lane", "anon keeps EXECUTE", or "caller may have no account" — the
-- phrases that read as a declaration. Exactly 2 of the 971 rows said one and
-- both are rewritten below. Prose may still DESCRIBE the anonymous caller (and
-- say there is none); it may no longer CLAIM to be a door.
--
-- DD-207 CLOSED HERE TOO — THE SILENT DOOR ROWS
-- ---------------------------------------------
-- 16 door rows name a function `anon` can execute while their reason never
-- mentions an anonymous caller (B-94's 15 plus `public.agx_build_shortcut_menu_m`,
-- a SECURITY INVOKER reader D9 does not see because it does not write). Each is
-- decided here rather than flagged:
--   * `public.log_client_error` — DECLARED (both overloads). A signed-out browser
--     must be able to say something broke; the body reads `auth.uid()` into
--     `v_user`, tolerates NULL, falls back to the matrx-system organization and
--     SAYS SO in `context.organization_note`. The older overload was already
--     declared "ANONYMOUS door. Signed-out client error capture"; the DD-115
--     overload that superseded it never carried the words. matrx-extend calls it
--     with no auth gate (`src/lib/supabase/db-failure.ts`), so the anonymous
--     caller is real, not hypothetical.
--   * the other 15 — ANON REVOKED. Every one is keyed on `auth.uid()` or on a
--     membership/admin gate that a signed-out caller can never satisfy, so anon
--     EXECUTE bought a stranger nothing but reach. `public.admin_spend_headline`
--     is the sharpest: a door row saying SUPER-ADMIN-ONLY while `anon` held
--     EXECUTE. `public.can_curate_library_document` claimed "2 live policies,
--     anon included" — MEASURED FALSE on 2026-09-14: zero live policies name it,
--     all five policies on `docproc.processed_documents` are `{authenticated}` or
--     `{service_role}`, and `anon` holds no SELECT on that table at all. The
--     claim was stale prose, which is the whole point of this file.
-- Only `anon` loses anything anywhere in this file; no signed-in grant is touched.

-- ─── 1. The declaration itself ──────────────────────────────────────────────
alter table platform.client_callable_door
  add column if not exists anonymous_callers boolean not null default false,
  add column if not exists anonymous_purpose text;

comment on column platform.client_callable_door.anonymous_callers is
  'DD-212: TRUE means a caller with NO ACCOUNT may reach this function by design. This flag — never a word in `reason` — is what the DD-202 birth trigger, check:impl-doors D5/D9 and the door-row harness read. It is kept honest by check:impl-doors D13: true requires anon to hold EXECUTE, false requires anon not to.';
comment on column platform.client_callable_door.anonymous_purpose is
  'DD-212: required when anonymous_callers is true — what the signed-out caller is doing here and what stands in for an identity (a token, a slug, a device secret, a fingerprint). NULL when the flag is false.';

-- ─── 2. DD-207: the 15 silent door rows lose anon; nothing signed-in moves ──
do $$
declare
  r record;
  f record;
  v_keep text[];
  v_role text;
  v_n int := 0;
begin
  for r in
    select * from (values
      ('platform','_confirmation_admission','p_relid oid'),
      ('public','admin_spend_headline','p_tz text'),
      ('public','agx_build_shortcut_menu_m','p_placement_types text[]'),
      ('public','agx_get_shared_for_chat','p_archived text'),
      ('public','agx_get_shared_with_me','p_archived text'),
      ('public','can_curate_library_document','p_doc uuid, p_user uuid'),
      ('public','cat_list','p_dimension text'),
      ('public','cmt_add','p_entity_type text, p_entity_id uuid, p_body text, p_parent_id uuid'),
      ('public','cmt_delete','p_id uuid'),
      ('public','cmt_edit','p_id uuid, p_body text'),
      ('public','cmt_list','p_entity_type text, p_entity_id uuid'),
      ('public','ues_get_bulk','p_entity_type text, p_entity_ids uuid[]'),
      ('public','ues_list','p_kind text'),
      ('public','ues_set','p_entity_type text, p_entity_id uuid, p_kind text, p_value jsonb'),
      ('public','ues_touch','p_entity_type text, p_entity_id uuid')
    ) as t(sch, nm, ia)
  loop
    -- Match on schema+name, so an argument-list drift since the census cannot
    -- make this silently skip a function it was meant to close. The revoke is
    -- DD-197's pattern verbatim: remember every SIGNED-IN role that can execute
    -- it right now, revoke PUBLIC and anon, re-grant exactly those roles. Only
    -- anon loses anything; nobody's feature fails at call time tomorrow.
    for f in
      select p.oid as oid, p.oid::regprocedure::text as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = r.sch and p.proname = r.nm
         and has_function_privilege('anon', p.oid, 'EXECUTE')
    loop
      select coalesce(array_agg(x.rolname), '{}'::text[])
        into v_keep
        from pg_roles x
       where x.rolname in ('authenticated','service_role','dashboard_user','svc_seo')
         and has_function_privilege(x.rolname, f.oid, 'EXECUTE');

      execute format('revoke execute on function %s from public', f.sig);
      execute format('revoke execute on function %s from anon', f.sig);
      foreach v_role in array v_keep
      loop
        execute format('grant execute on function %s to %I', f.sig, v_role);
      end loop;

      v_n := v_n + 1;
      raise notice 'DD-207: anon EXECUTE revoked from % (its door row declared it for signed-in callers only; kept: %).', f.sig, array_to_string(v_keep, ', ');
    end loop;
  end loop;
  raise notice 'DD-207: % function signature(s) closed to anon.', v_n;
end $$;

-- ─── 3. The backfill — MEASURED, not typed ──────────────────────────────────
-- After §2 the set of door rows whose function `anon` can still execute IS the
-- declared-anonymous set. Deriving the flag from the live grant (rather than
-- from a hand-written name list) is what makes this file's own claim testable:
-- D13 below asserts flag == grant forever after.
update platform.client_callable_door d
   set anonymous_callers = true
  from pg_namespace n
  join pg_proc p on p.pronamespace = n.oid
 where n.nspname = d.schema_name
   and p.proname = d.function_name
   and pg_get_function_identity_arguments(p.oid) = d.identity_args
   and has_function_privilege('anon', p.oid, 'EXECUTE');

-- The purpose sentence: who the signed-out caller is, and what stands in for an
-- identity. One per family — the families are the product surfaces themselves.
update platform.client_callable_door d
   set anonymous_purpose = case
     when d.schema_name = 'billing' and d.function_name = 'public_plans'
       then 'A visitor with no account reads the pricing page. The body returns only publishable billing.plan rows; there is no caller identity to have.'
     when d.schema_name = 'communication' and d.function_name like 'meet%'
       then 'A meeting guest with no account joins from a link. The unguessable meeting slug is the capability; the body grants nothing beyond that meeting.'
     when d.schema_name = 'iam' or d.function_name in ('has_permission','is_admin','is_platform_admin','is_super_admin')
       then 'A caller-identity predicate evaluated AS THE QUERYING ROLE inside RLS policies that anon can reach. A signed-out caller must get FALSE or zero rows from it, not a 42501 — revoking anon EXECUTE breaks the policy, not an attacker.'
     when d.function_name like 'assoc_for_%'
       then 'A signed-out visitor on a public-class entity page. The body answers from the §3.1 public-class lane only; anything scoped to a membership needs auth.uid() and returns nothing without one.'
     when d.function_name in ('check_guest_execution_limit','record_guest_execution')
       then 'A guest (signed-out) runs a public agent app. A browser fingerprint stands in for an identity and buys nothing but a small, counted execution quota.'
     when d.function_name like 'creator_public%' or d.function_name in ('edu_public_decks','get_aga_public_data','get_agent_public','get_public_flashcard_set')
       then 'A signed-out visitor on an app/(public) route. The body is gated to rows the owner published; a caller with no account sees exactly the published surface and nothing else.'
     when d.function_name like 'esign_signer_%'
       then 'A signer who has no account opens an e-sign envelope from an emailed link. The per-envelope session token in p_session IS the identity (esign_05 §5.4 names exactly these eight doors).'
     when d.function_name like 'hr_kiosk_%'
       then 'The HR time-clock tablet under app/(kiosk) runs with NO user session by design. A person-bound hr.kiosk_session token (plus a device secret or PIN) is the identity; the browser never holds a JWT.'
     when d.function_name = 'inv_peek_invited_email'
       then 'An invitee who does not have an account yet, prefilling sign-up from the invitation token in the URL. The token is the credential; it reveals only the address the invitation was sent to.'
     when d.function_name = 'log_client_error'
       then 'A signed-out client (web app, extension, desktop, mobile) recording that something broke. The body reads auth.uid() into v_user, tolerates NULL, attributes the row to the matrx-system organization and says so in context.organization_note. An error a stranger cannot report is an error nobody hears.'
     when d.function_name like 'outreach_unsubscribe%'
       then 'A recipient who is signed out taps unsubscribe in an email and lands on /unsubscribe/[token]. The one-time token is the credential; honouring it is a compliance obligation that cannot require an account.'
     when d.function_name like 'outsider_%'
       then 'An outsider invited into one piece of work through a platform.actor_token link, with no account anywhere. The secret in the argument is the credential and a verification code binds the session.'
     when d.function_name in ('resolve_share_token','share_token_keyword_metrics','resolve_short_link')
       then 'The holder of a share link or short link, signed out, following it from SMS or email. The token is the credential and resolves to exactly what its owner shared.'
     else null end
 where d.anonymous_callers;

-- ─── 4. The two reasons that CLAIMED a door they do not have ────────────────
update platform.client_callable_door
   set reason = 'Signed-in CRM compliance surface mints the unsubscribe token that the recipient-facing unsubscribe door later consumes.'
 where schema_name = 'crm' and function_name = 'issue_unsubscribe_token';

update platform.client_callable_door
   set reason = 'SIGNED-IN door (authenticated only; anon revoked by this migration). Designed for a reporter with no account, but no signed-out caller exists in any of the four repos yet — only scripts/hr/hrb011_proof.py, which connects as postgres. Setting anonymous_callers = true here would be a claim nothing backs, and D6 refuses it: the body names a visibility-bearing table with no access-vocabulary gate. The surface for callers with no account declares itself, gated, when it ships.'
 where schema_name = 'public' and function_name = 'anonymous_report_open';

-- ─── 5. The constraints — the flag carries a purpose, the prose never claims ─
alter table platform.client_callable_door
  drop constraint if exists door_anonymous_purpose_is_declared;
alter table platform.client_callable_door
  add constraint door_anonymous_purpose_is_declared check (
    (anonymous_callers and anonymous_purpose is not null and length(btrim(anonymous_purpose)) >= 40)
    or (not anonymous_callers and anonymous_purpose is null)
  );

alter table platform.client_callable_door
  drop constraint if exists door_reason_never_claims_an_anonymous_door;
alter table platform.client_callable_door
  add constraint door_reason_never_claims_an_anonymous_door check (
    anonymous_callers
    or reason !~* '((anonymous|signed[- ]out|guest|kiosk|outsider)[[:space:]]*(\([^)]*\))?[[:space:]]*(door|lane)|anon keeps EXECUTE|caller (may|can) have no account)'
  );

comment on constraint door_anonymous_purpose_is_declared on platform.client_callable_door is
  'DD-212: a door open to callers with no account says WHY in anonymous_purpose (>= 40 characters), and a door that is not open to them carries no purpose. A flag with no sentence behind it is the same guess this file removed.';
comment on constraint door_reason_never_claims_an_anonymous_door on platform.client_callable_door is
  'DD-212: when anonymous_callers is false the reason may not CLAIM to be an anonymous/signed-out/guest/kiosk/outsider door or lane, say "anon keeps EXECUTE", or say the caller may have no account. It may still DESCRIBE an anonymous caller (including saying there is none) and may name hr.kiosk_* / *_guest_* functions — banning the bare words would make an honest door on those functions undeclarable.';

-- ─── 6. The DD-202 birth trigger reads the FLAG ─────────────────────────────
-- Only the door test changes; everything else in
-- migrations/dd202_a_function_is_closed_to_anon_at_birth.sql is preserved
-- verbatim, so a reader diffing the two files sees exactly one idea move.
create or replace function platform.close_new_functions_to_anon_impl(p_objids oid[], p_tag text)
returns void
language plpgsql
security definer
set search_path to 'platform', 'public', 'pg_catalog'
as $$
declare
  r_oid oid;
  fn record;
  v_keep text[];
  v_role text;
  v_detail text;
begin
  foreach r_oid in array coalesce(p_objids, '{}'::oid[])
  loop
    begin
      select n.nspname as sch, p.proname as nm, p.prosecdef, p.prokind, p.prorettype,
             p.proargtypes::text as argtypes,
             pg_get_function_identity_arguments(p.oid) as ia,
             p.oid::regprocedure::text as sig, p.oid as oid
        into fn
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.oid = r_oid;
      if not found then continue; end if;
      -- SECURITY DEFINER belongs to the §6d-4 guard; two guards, one job each.
      if fn.prosecdef then continue; end if;
      if fn.prokind not in ('f','p') then continue; end if;
      -- A trigger / event-trigger function is never called by a client.
      if fn.prorettype in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype) then continue; end if;
      if not (fn.sch = any (platform.anon_function_birth_schemas())) then continue; end if;
      if exists (select 1 from pg_depend d where d.objid = r_oid and d.deptype = 'e') then continue; end if;
      -- 🚨 DD-212: a DECLARED anonymous door keeps its grant, and it is DECLARED
      -- by the flag. Until 2026-09-14 this read `reason ~* '(anonymous|signed[- ]out|
      -- guest|kiosk|outsider)'`, so a row saying "SIGNED-IN door … No anonymous
      -- caller exists" opened the birth door — proven live, in this file's header.
      if exists (select 1 from platform.client_callable_door c
                  where c.schema_name = fn.sch and c.function_name = fn.nm
                    and c.identity_args = fn.ia
                    and c.anonymous_callers) then continue; end if;
      -- The population that was already open when this guard shipped (DD-202 §3).
      if exists (select 1 from platform.anon_function_birth_grandfather g
                  where g.schema_name = fn.sch and g.function_name = fn.nm
                    and g.argtypes = fn.argtypes) then continue; end if;
      -- Nothing to take back.
      if not (has_function_privilege('anon', fn.oid, 'EXECUTE')
              or has_function_privilege('public', fn.oid, 'EXECUTE')) then continue; end if;

      -- Remember every SIGNED-IN role that can execute it RIGHT NOW, so the revoke
      -- below costs exactly one role its reach: anon.
      select coalesce(array_agg(r.rolname), '{}'::text[])
        into v_keep
        from pg_roles r
       where r.rolname in ('authenticated','service_role','dashboard_user','svc_seo')
         and has_function_privilege(r.rolname, fn.oid, 'EXECUTE');

      execute format('revoke execute on function %s from public', fn.sig);
      execute format('revoke execute on function %s from anon', fn.sig);
      foreach v_role in array v_keep
      loop
        execute format('grant execute on function %s to %I', fn.sig, v_role);
      end loop;

      -- The announcement, in its OWN subtransaction placed AFTER the revoke, so a
      -- failure to speak can never roll the revoke back (§6d-4's rule).
      begin
        v_detail := platform.anon_function_birth_notice(fn.sch, fn.nm, fn.ia, fn.sig);
        raise notice 'ddl_guard[anon_function_execute_closed_at_birth]: %', v_detail;
      exception when others then
        raise warning 'ddl_guard[anon_function_execute_closed_at_birth]: announcement FAILED (%) — the anon/PUBLIC EXECUTE revoke on % DID happen; the guard needs repair.', sqlerrm, fn.sig;
      end;
    exception when others then
      raise warning 'ddl_guard[anon_function_execute_closed_at_birth]: could not close one function (%) — a new function may be executable by a signed-out caller. The guard needs repair.', sqlerrm;
    end;
  end loop;
exception when others then
  raise warning 'ddl_guard[anon_function_execute_closed_at_birth]: THE DD-202 GUARD FAILED (%) — a new function may be executable by a signed-out caller. The guard needs repair.', sqlerrm;
end;
$$;
revoke execute on function platform.close_new_functions_to_anon_impl(oid[],text) from public;
revoke execute on function platform.close_new_functions_to_anon_impl(oid[],text) from anon;
revoke execute on function platform.close_new_functions_to_anon_impl(oid[],text) from authenticated;

-- ─── 7. The remedy sentence stops teaching the defect ───────────────────────
-- The old text told the next author to make the REASON contain one of five
-- words. That instruction IS the hole this file closes, so it cannot survive it.
create or replace function platform.anon_function_birth_notice(
  p_schema text, p_name text, p_identity_args text, p_signature text)
returns text
language sql
immutable
as $$
  select format(
    'EXECUTE for PUBLIC and anon was REVOKED from %s at creation. PostgreSQL gives every new '
    'function EXECUTE to PUBLIC and PUBLIC reaches anon, so without this a signed-out visitor '
    'could call it over /rest/v1/rpc before any grant, policy or door row existed. Every '
    'signed-in role that could execute it a moment ago still can, explicitly — only anon lost '
    'anything. If a SIGNED-OUT caller is meant to reach it, DECLARE it in the SAME migration, '
    'BEFORE the grant: INSERT INTO platform.client_callable_door (schema_name, function_name, '
    'identity_args, reason, anonymous_callers, anonymous_purpose) VALUES (%L, %L, %L, ''what this '
    'door is for'', true, ''who the signed-out caller is and what stands in for an identity — a '
    'token, a slug, a device secret, a fingerprint''); then re-issue GRANT EXECUTE ON FUNCTION '
    '%s TO anon. The FLAG is what this guard reads — no wording in the reason has ever been a '
    'declaration and since DD-212 none can be. If it is NOT meant to be reachable signed-out, '
    'nothing to do — this is the guard working. (DD-202/DD-212; common-docs '
    '/systems/platform/db-rules/FEATURE.md §6d-4.)',
    p_signature, p_schema, p_name, p_identity_args, p_signature)
$$;
revoke execute on function platform.anon_function_birth_notice(text,text,text,text) from public;
revoke execute on function platform.anon_function_birth_notice(text,text,text,text) from anon;
revoke execute on function platform.anon_function_birth_notice(text,text,text,text) from authenticated;

-- ─── 8. THE FORCING PROOF, on this path, in this file ───────────────────────
do $$
declare
  v_anon boolean;
  v_bad  int;
  v_msg  text;
begin
  -- (a) THE V-68 PLANT. The exact row that opened the birth door must not any more.
  insert into platform.client_callable_door (schema_name, function_name, identity_args, reason)
  values ('public','dd212_negated_probe','',
          'SIGNED-IN door (authenticated only; anon revoked). No anonymous caller exists for it in any repo.');
  execute 'create function public.dd212_negated_probe() returns void language sql as $b$ select 1 $b$';
  select has_function_privilege('anon','public.dd212_negated_probe()','execute') into v_anon;
  if v_anon then
    raise exception 'DD-212 FAILED: a door row whose reason denies an anonymous caller still opened the birth door — the trigger is still reading prose.';
  end if;

  -- (b) A DECLARED door — the flag, with no anonymous word anywhere in the reason.
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, reason, anonymous_callers, anonymous_purpose)
  values ('public','dd212_declared_probe','',
          'DD-212 self-test. Nothing in this sentence would match the old regex.', true,
          'A caller with no account reaches this self-test probe by design; it exists only to prove the flag, not the prose, is what keeps a birth grant.');
  execute 'create function public.dd212_declared_probe() returns void language sql as $b$ select 1 $b$';
  select has_function_privilege('anon','public.dd212_declared_probe()','execute') into v_anon;
  if not v_anon then
    raise exception 'DD-212 FAILED: a door DECLARED with anonymous_callers = true lost anon EXECUTE at birth — the trigger is not reading the flag.';
  end if;

  -- (c) the flag needs a purpose
  begin
    insert into platform.client_callable_door
      (schema_name, function_name, identity_args, reason, anonymous_callers)
    values ('public','dd212_no_purpose_probe','','DD-212 self-test.', true);
    raise exception 'DD-212 FAILED: anonymous_callers = true was accepted with no anonymous_purpose.';
  exception when check_violation then null;
  end;

  -- (d) prose may no longer CLAIM a door the flag does not carry
  begin
    insert into platform.client_callable_door (schema_name, function_name, identity_args, reason)
    values ('public','dd212_claim_probe','','ANONYMOUS door (anon keeps EXECUTE). DD-212 self-test.');
    raise exception 'DD-212 FAILED: a reason claiming an ANONYMOUS door was accepted with anonymous_callers = false.';
  exception when check_violation then null;
  end;

  -- (e) prose may still DESCRIBE, and may still name an hr.kiosk_* function
  insert into platform.client_callable_door (schema_name, function_name, identity_args, reason)
  values ('public','dd212_describe_probe','',
          'SIGNED-IN only. The caller is resolved inside the body by hr.kiosk_device_list; an anonymous caller can do nothing here.');

  -- (f) flag and grant agree across every live door row (D13's population, now)
  select count(*) into v_bad
    from platform.client_callable_door d
    join pg_namespace n on n.nspname = d.schema_name
    join pg_proc p on p.pronamespace = n.oid and p.proname = d.function_name
         and pg_get_function_identity_arguments(p.oid) = d.identity_args
   where d.anonymous_callers <> has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_bad > 0 then
    select string_agg(d.schema_name||'.'||d.function_name, ', ') into v_msg
      from platform.client_callable_door d
      join pg_namespace n on n.nspname = d.schema_name
      join pg_proc p on p.pronamespace = n.oid and p.proname = d.function_name
           and pg_get_function_identity_arguments(p.oid) = d.identity_args
     where d.anonymous_callers <> has_function_privilege('anon', p.oid, 'EXECUTE');
    raise exception 'DD-212 FAILED: % door row(s) disagree with the live anon grant: %', v_bad, v_msg;
  end if;

  -- (g) every declared door carries a purpose
  select count(*) into v_bad from platform.client_callable_door
   where anonymous_callers and coalesce(length(btrim(anonymous_purpose)),0) < 40;
  if v_bad > 0 then
    raise exception 'DD-212 FAILED: % declared anonymous door(s) carry no purpose sentence.', v_bad;
  end if;

  -- teardown: nothing of this file's proof survives it
  execute 'drop function public.dd212_negated_probe()';
  execute 'drop function public.dd212_declared_probe()';
  delete from platform.client_callable_door where function_name like 'dd212!_%' escape '!';

  raise notice 'DD-212 proven on the sanctioned path: the negated-prose plant is closed, a flag-declared door keeps anon, the flag requires a purpose, prose may no longer claim a door, and every live door row agrees with the live anon grant.';
end $$;

-- ─── 9. This file's own §6d-4 log row is ACKNOWLEDGED, never deleted ────────
-- `create or replace` of the DEFINER `_impl` makes the §6d-4 guard revoke client
-- EXECUTE from it and write a `platform.ddl_guard_log` row. That is the guard
-- working, and it is expected here — but an unacknowledged row is somebody
-- else's triage lane, so this file answers it instead of leaving it or deleting
-- it. `now()` is the transaction timestamp, so this touches only the row this
-- apply produced; DD-202's own earlier row is left exactly where it is.
update platform.ddl_guard_log
   set acknowledged_at = now(),
       acknowledged_by = 'DD-212 (B-99)',
       ack_reason = 'Expected: DD-212 replaces platform.close_new_functions_to_anon_impl so the birth guard reads platform.client_callable_door.anonymous_callers instead of a regex over `reason`. The impl is deliberately not client-callable — no client role should hold EXECUTE on it — so the revoke this row records is the intended end state, not a lost grant.'
 where rule = 'definer_client_grant_revoked'
   and object_ref like 'platform.close_new_functions_to_anon_impl%'
   and acknowledged_at is null
   and occurred_at >= now();

comment on table platform.client_callable_door is
  'Every function a client may call, declared. DD-212 (2026-09-14): whether a caller with NO ACCOUNT may reach it is the anonymous_callers flag plus an anonymous_purpose sentence — never a word in `reason`. The DD-202 birth trigger, check:impl-doors D5/D9/D13 and scripts/check-door-rows.ts all read the flag; check:impl-doors D13 fails if the flag and the live anon EXECUTE grant ever disagree.';
