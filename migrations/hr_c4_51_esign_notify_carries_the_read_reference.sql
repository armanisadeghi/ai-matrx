-- HR domain C4 — migration 51 (matrx-frontend D286; HRB-001 D15 read-half gap; the esign twin of the
-- DEFECT-1 fix landed for hr._wf_notify in hr_c4_47).
--
-- 🚨 esign._notify WROTE A NOTICE-LESS DEEP LINK FOR INTERNAL (user) SIGNERS.
--
-- `esign._notify_actionable` builds `/sign/e/<envelope>` for an internal_user signer and passes it
-- to `esign._notify` — with NO notice reference. SPEC-NOTIFICATIONS §5.2: "the link carries a notice
-- reference; opening it stamps `read_at`." So an internal signer following that link stamped nothing,
-- exactly as `hr._wf_notify` did before hr_c4_47. The HRB-011 verifier characterized it precisely:
-- a third notice-less producer, BUT ONLY for `recipient_kind='user'` (internal-signer) rows.
--
-- The esign twist: `esign._notify` is the SINGLE SHARED INSERTER for user, actor_token, and address
-- notices, and the link is built BEFORE the row id exists (passed in, id returned after). So the
-- notice reference is folded in AFTER the insert, for `user` rows only.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. USER ROWS ONLY, AND KEYED SO CROSS-VIEWER STAMPING CANNOT HAPPEN. Only a `user` notice reads
--    via the spine: `communication.mark_notification_read` authorizes on
--    `recipient_user_id = auth.uid()`, and the folded id is THIS notice's own id, whose
--    `recipient_user_id` is the internal signer — so it points at the viewer's own row and a
--    different viewer's stamp can never land. The reference is `?notice=<id>` (the `/sign/e/...`
--    route carries no query), joined with `&` if a query ever exists, matching hr_c4_47.
--
-- 2. 🚨 OUTSIDER (actor_token) ROWS ARE LEFT UNTOUCHED — TWO REASONS, BOTH §5.4/§5.x. Their read
--    signal is the `esign.envelope_event` ledger (opened/viewed), NOT spine `read_at`. And their
--    link carries the secret in the URL FRAGMENT (`/x/sign#t=<secret>`), so it never lands in a log
--    or Referer — appending a query parameter would push content PAST the `#` and move the secret
--    out of the fragment. The `v_kind = 'user'` gate excludes them; the `position('#' …) = 0` guard
--    makes corrupting a fragment structurally impossible even if a user row ever carried one.
--
-- 3. THE COLUMN, NOT THE PAYLOAD. Unlike `hr._wf_notify`, esign's payload carries no `deep_link`
--    copy — only the `deep_link` column, which is what the worker renders into the email. So the
--    fold-in updates that column alone.
--
-- Authority: SPEC-NOTIFICATIONS §5.2 (the read reference) / §5.4 (the outsider secret stays in the
-- fragment); the DEFECT-1 pattern from hr_c4_47.
-- Applied live as `hr_c4_51_esign_notify_carries_the_read_reference`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_51_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. fold the read reference in (RD 1/2/3)
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  returning id into v_id;
  return v_id;
end$o$;
  v_new constant text := $o$  returning id into v_id;

  -- 🚨 THE READ REFERENCE, FOR INTERNAL (user) ROWS ONLY (D286; the esign twin of hr_c4_47's
  -- DEFECT-1 fix). The link is built BEFORE the row id exists, so it is folded in AFTER the insert.
  -- §5.2: following the link stamps read_at — and only a `user` notice reads via the spine
  -- (mark_notification_read gates on recipient_user_id = auth.uid(), so this points at the viewer's
  -- OWN row and cross-viewer stamping cannot happen). 🚨 OUTSIDER (actor_token) rows are LEFT
  -- UNTOUCHED: their read signal is the esign.envelope_event ledger, and their link carries the
  -- secret in the URL FRAGMENT (§5.4) — a query param would push it past the `#`. The `#`-guard
  -- makes that impossible even for a user row that somehow carried a fragment.
  if v_kind = 'user' and p_deep_link is not null and position('#' in p_deep_link) = 0 then
    update communication.notification
       set deep_link = p_deep_link
                    || case when p_deep_link like '%?%' then '&' else '?' end
                    || 'notice=' || v_id::text
     where id = v_id;
  end if;
  return v_id;
end$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'esign' and p.proname = '_notify';
  v_def := pg_get_functiondef(v_oid);
  if position('THE READ REFERENCE, FOR INTERNAL' in v_def) > 0 then
    raise notice 'hr_c4_51: esign._notify already carries the read reference';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_51: esign._notify does not carry the expected main-insert return — refusing to overwrite drift';
    end if;
    -- the anchor (2-space indent + function `end`) is unique to the main insert; the skipped-case
    -- return is 4-space indented and followed by `end if`. Assert exactly one match.
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
      raise exception 'hr_c4_51: the main-insert return anchor is not unique — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_new);
    raise notice 'hr_c4_51: esign._notify now folds the read reference into user deep links';
  end if;
end
$mig$;

-- ============================================================ 2. the contract
do $$
begin
  delete from hr.function_contract where home_migration = 'hr_c4_51';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values ('esign', '_notify', 'hr_c4_51',
    array['v_kind = ''user''', '''notice='' || v_id', 'position(''#'' in p_deep_link) = 0'],
    '{}', true,
    'hr_c4_51 (D286): esign._notify must fold the notice reference `notice=<row id>` into the deep link for `user` rows ONLY, so an internal signer following the link stamps read_at (§5.2). It MUST stay gated on v_kind=''user'' AND guarded by position(''#'')=0: an actor_token outsider row carries its secret in the URL FRAGMENT (§5.4) and reads via the esign.envelope_event ledger, not spine read_at — appending a query param would push the secret out of the fragment. Dropping either guard corrupts the outsider link; dropping the fold-in returns the internal signer to a dead read path.');
end $$;

-- ============================================================ 3. post-conditions that EXECUTE
do $$
declare
  v_bad integer; v_before integer;
  v_org uuid; v_env uuid; v_user uuid; v_uid_link text; v_tok_link text; v_uid_nid uuid;
begin
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'esign' and p.proname = '_notify') !~ 'THE READ REFERENCE, FOR INTERNAL' then
    raise exception 'hr_c4_51: esign._notify was not updated';
  end if;

  -- EXECUTED both ways, on a real envelope, rolled back.
  select id into v_org from iam.organizations limit 1;
  select id into v_user from auth.users where coalesce(is_anonymous,false) = false limit 1;
  perform set_config('hr.privileged_write','on', true);
  insert into esign.envelope (title, consumer_key, expires_at, organization_id)
  values ('hr_c4_51 probe', 'esign.signer', now() + interval '7 days', v_org) returning id into v_env;

  -- (a) a USER row's deep link gains `?notice=<its own id>`
  v_uid_nid := esign._notify(v_env, 'esign.signature_requested', gen_random_uuid(), p_to_user => v_user,
                             p_deep_link => '/sign/e/' || v_env::text, p_channel => 'email');
  select deep_link into v_uid_link from communication.notification where id = v_uid_nid;
  if v_uid_link is distinct from '/sign/e/' || v_env::text || '?notice=' || v_uid_nid::text then
    raise exception 'hr_c4_51: the user deep link is % (expected the object route + ?notice=<own id>)', v_uid_link;
  end if;

  -- (b) an OUTSIDER (actor_token) fragment link is UNCHANGED — secret stays in the fragment
  declare v_tok_nid uuid; begin
    v_tok_nid := esign._notify(v_env, 'esign.signature_requested', gen_random_uuid(),
                               p_actor_token_id => gen_random_uuid(),
                               p_to_address => 'outsider@example.invalid',
                               p_deep_link => '/x/sign#t=SECRET_MUST_STAY_IN_FRAGMENT', p_channel => 'email');
    select deep_link into v_tok_link from communication.notification where id = v_tok_nid;
    if v_tok_link is distinct from '/x/sign#t=SECRET_MUST_STAY_IN_FRAGMENT' then
      raise exception 'hr_c4_51: the outsider fragment link was altered to % — the secret must stay in the fragment', v_tok_link;
    end if;
    if v_tok_link like '%notice=%' then
      raise exception 'hr_c4_51: a notice reference was appended to an outsider link';
    end if;
  end;

  -- clean the probe rows and envelope (rolled back anyway, but keep the txn tidy)
  raise exception 'hr_c4_51_rollback_marker';
exception
  when others then
    if sqlerrm !~ 'hr_c4_51_rollback_marker' then raise; end if;
end $$;

do $$
declare v_bad integer; v_before integer;
begin
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_51: % function contract(s) broken: %', v_bad,
      (select string_agg(b::text, ' | ') from hr.function_contracts_broken() b);
  end if;
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_51_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_51: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
  raise notice 'hr_c4_51: esign internal signers carry the read reference; the outsider fragment is untouched';
end $$;
