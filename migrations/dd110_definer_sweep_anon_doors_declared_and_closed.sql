-- DD-110 — the 159 ungated anon-callable SECURITY DEFINER functions: declare the legitimate
-- anonymous doors, close the rest. (B-14, Data Doctrine adoption program, 2026-09-11.)
--
-- WHAT WAS MEASURED, LIVE, BEFORE ANY CHANGE
-- ------------------------------------------
-- 533 non-trigger SECURITY DEFINER functions are EXECUTE-able by `anon` on this database.
-- common-docs/projects/data-doctrine-adoption/discovery/DEFINER-CENSUS.md classified 159 of them
-- as class C — "no gate found in the function's own body or one level down". This migration is the
-- class fix for those 159, after reading every one of the 159 bodies and finding each one's real
-- caller in matrx-frontend / matrx-extend / matrx-local / aidream.
--
-- 🚨 THE P0 THIS CLOSES, PROVEN AS `anon` IN A ROLLED-BACK TRANSACTION BEFORE THE FIX:
--
--   set local role anon;
--   select result from public.execute_admin_query('select current_user::text as who');
--   -->  [{"who": "postgres"}]
--
-- `public.execute_admin_query(text)` EXECUTEs its argument verbatim and is SECURITY DEFINER owned
-- by `postgres`. Every schema in pgrst.db_schemas is PostgREST-exposed, so anyone holding the
-- published anon key could run arbitrary SQL as the database superuser over HTTP. Its only caller
-- is matrx-frontend `actions/admin/database.ts executeSqlQuery()`, which uses `createAdminClient()`
-- (service_role) — so nothing legitimate ever needed anon or authenticated on it.
--
-- THE THREE CLASSES (db-rules §6d-4: a client door MUST declare itself; an `_impl` never does)
-- --------------------------------------------------------------------------------------------
--  L / kernel : an anonymous caller must reach it by design. Keeps anon, gains a
--               platform.client_callable_door row naming why. Two shapes:
--                 * credential-carrying doors — e-sign signer, outsider links, HR kiosk,
--                   unsubscribe, share links. The credential IS the argument (hr_l3_70's
--                   structural rule: "anon may reach a door only when the door carries its own
--                   credential"), and app/(kiosk) + app/(public) render with no user session.
--                 * public-page reads whose body restricts to published/public rows.
--                 * RLS kernel predicates, evaluated AS THE QUERYING ROLE inside live policies —
--                   revoking those breaks the policy, not an attacker.
--  U          : every caller holds a session, or the function is reached from a SECURITY INVOKER
--               function/trigger that `authenticated` executes (the nested call is privilege-checked
--               as the caller). REVOKE from anon; keep authenticated; declare the door.
--  N          : no client caller anywhere. REVOKE from public, anon and authenticated; keep
--               service_role explicitly so the server and the repo scripts are untouched.
--
-- AND, FOR ALL THREE, THE CLASS FIX: delete the matching
-- `platform.definer_client_grant_grandfather` rows. B-6/DD-098 proved that a grandfather row on a
-- function that is not a declared door makes the §6d-4 guard stand down for it forever, so any path
-- that re-establishes a client grant re-opens the door silently.
--
-- DELIBERATELY NOT TOUCHED, AND WHY (reported, not guessed):
--   * 8 `pgsodium.*` functions — extension-owned (supabase_admin / pgsodium_keymaker); §6d-4 exempts
--     extension schemas and Supabase owns their grant shape.
--   * `platform.enforce_definer_client_grants`, `platform.sync_entity_types_on_ddl`,
--     `platform.flag_entity_types_on_drop` — event-trigger functions, including the §6d-4 guard
--     itself. Changing EXECUTE on the DDL guard to save nothing is not a trade worth making.
--   * `public.get_prompt_app_public_data`, `public.get_published_app_with_prompt` — public-app
--     shaped but with NO caller found in any of the four repos, so neither L nor N is evidenced.
--   * `iam.accessible_entity_ids` — already carries client_callable_door rows for both overloads;
--     the census only listed it because it renders `permission_level` where the door row renders
--     `public.permission_level`.
--
-- Applied through `pnpm db:apply` (the one matrx-frontend DDL path; it owns the ledger row).

do $$
declare
  r record;
  v_sig text;
  v_args text;
  v_doors int := 0;
  v_revoked int := 0;
  v_gf int := 0;
begin
  create temporary table _dd110 (schema_name text, function_name text, klass text, reason text) on commit drop;
  insert into _dd110 (schema_name, function_name, klass, reason) values
  ('public','can_curate_library_document','kernel','RLS kernel predicate: evaluated AS THE QUERYING ROLE by docproc.processed_documents curator policies (2 live policies), anon included. Revoking client EXECUTE breaks the policy, not an attacker.'),
  ('iam','rulebook_ids_curated_by','kernel','RLS kernel predicate: evaluated AS THE QUERYING ROLE inside platform.rulebook std_select. Returns only the ids an industry curator curates.'),
  ('iam','starter_pack_ids_curated_by','kernel','RLS kernel predicate: evaluated AS THE QUERYING ROLE inside seo.starter_pack std_select. Returns only the ids an industry curator curates.'),
  ('public','esign_signer_adopt_signature','L','Anonymous e-sign SIGNER door (esign_05 §5.4 names exactly these eight). The caller has no account: the credential is p_session, verified inside esign._ctx_outsider before any act. Anon reach IS the requirement.'),
  ('public','esign_signer_consent','L','Anonymous e-sign SIGNER door (esign_05 §5.4 names exactly these eight). The caller has no account: the credential is p_session, verified inside esign._ctx_outsider before any act. Anon reach IS the requirement.'),
  ('public','esign_signer_decline','L','Anonymous e-sign SIGNER door (esign_05 §5.4 names exactly these eight). The caller has no account: the credential is p_session, verified inside esign._ctx_outsider before any act. Anon reach IS the requirement.'),
  ('public','esign_signer_delegate','L','Anonymous e-sign SIGNER door (esign_05 §5.4 names exactly these eight). The caller has no account: the credential is p_session, verified inside esign._ctx_outsider before any act. Anon reach IS the requirement.'),
  ('public','esign_signer_download_url','L','Anonymous e-sign SIGNER door (esign_05 §5.4 names exactly these eight). The caller has no account: the credential is p_session, verified inside esign._ctx_outsider before any act. Anon reach IS the requirement.'),
  ('public','esign_signer_load','L','Anonymous e-sign SIGNER door (esign_05 §5.4 names exactly these eight). The caller has no account: the credential is p_session, verified inside esign._ctx_outsider before any act. Anon reach IS the requirement.'),
  ('public','esign_signer_preview_ack','L','Anonymous e-sign SIGNER door (esign_05 §5.4 names exactly these eight). The caller has no account: the credential is p_session, verified inside esign._ctx_outsider before any act. Anon reach IS the requirement.'),
  ('public','esign_signer_sign','L','Anonymous e-sign SIGNER door (esign_05 §5.4 names exactly these eight). The caller has no account: the credential is p_session, verified inside esign._ctx_outsider before any act. Anon reach IS the requirement.'),
  ('public','outsider_begin','L','Anonymous OUTSIDER link door (platform.actor_token). The credential is the argument (p_secret / p_session), hashed and checked against platform.actor_token / actor_session inside the body; a bad or expired link returns a sentence, never data.'),
  ('public','outsider_send_code','L','Anonymous OUTSIDER link door (platform.actor_token). The credential is the argument (p_secret / p_session), hashed and checked against platform.actor_token / actor_session inside the body; a bad or expired link returns a sentence, never data.'),
  ('public','outsider_session_ping','L','Anonymous OUTSIDER link door (platform.actor_token). The credential is the argument (p_secret / p_session), hashed and checked against platform.actor_token / actor_session inside the body; a bad or expired link returns a sentence, never data.'),
  ('public','outsider_verify','L','Anonymous OUTSIDER link door (platform.actor_token). The credential is the argument (p_secret / p_session), hashed and checked against platform.actor_token / actor_session inside the body; a bad or expired link returns a sentence, never data.'),
  ('public','hr_kiosk_authenticate','L','Anonymous KIOSK door. app/(kiosk)/layout.tsx runs with NO getServerAuth and no user session by design; the actor is a device and the credential is the argument (p_device_secret / p_pairing_code / p_session_token). hr_l3_70 ruled the structural rule: anon may reach a kiosk door only when the door carries its own credential.'),
  ('public','hr_kiosk_claim_pairing','L','Anonymous KIOSK door. app/(kiosk)/layout.tsx runs with NO getServerAuth and no user session by design; the actor is a device and the credential is the argument (p_device_secret / p_pairing_code / p_session_token). hr_l3_70 ruled the structural rule: anon may reach a kiosk door only when the door carries its own credential.'),
  ('public','hr_kiosk_session_close','L','Anonymous KIOSK door. app/(kiosk)/layout.tsx runs with NO getServerAuth and no user session by design; the actor is a device and the credential is the argument (p_device_secret / p_pairing_code / p_session_token). hr_l3_70 ruled the structural rule: anon may reach a kiosk door only when the door carries its own credential.'),
  ('public','hr_kiosk_session_heartbeat','L','Anonymous KIOSK door. app/(kiosk)/layout.tsx runs with NO getServerAuth and no user session by design; the actor is a device and the credential is the argument (p_device_secret / p_pairing_code / p_session_token). hr_l3_70 ruled the structural rule: anon may reach a kiosk door only when the door carries its own credential.'),
  ('public','hr_kiosk_session_open','L','Anonymous KIOSK door. app/(kiosk)/layout.tsx runs with NO getServerAuth and no user session by design; the actor is a device and the credential is the argument (p_device_secret / p_pairing_code / p_session_token). hr_l3_70 ruled the structural rule: anon may reach a kiosk door only when the door carries its own credential.'),
  ('public','outreach_unsubscribe','L','Anonymous unsubscribe door: /unsubscribe/[token] is a public route reached from an email footer by someone who is not signed in. The credential is p_token (>=32 chars, matched against crm.unsubscribe_token).'),
  ('public','outreach_unsubscribe_preview','L','Anonymous unsubscribe door: /unsubscribe/[token] is a public route reached from an email footer by someone who is not signed in. The credential is p_token (>=32 chars, matched against crm.unsubscribe_token).'),
  ('public','resolve_share_token','L','Anonymous share-link door: the credential is p_token, matched against platform.share_links with is_active / expires_at / max_uses checked inside. A share link is meant to work signed-out.'),
  ('public','share_token_keyword_metrics','L','Anonymous share-link door: the credential is p_token, matched against platform.share_links with is_active / expires_at / max_uses checked inside. A share link is meant to work signed-out.'),
  ('public','creator_public_handles','L','Public-page read: the body itself restricts to published/public rows, and the caller is an app/(public) route rendered for signed-out visitors.'),
  ('public','creator_public_page','L','Public-page read: the body itself restricts to published/public rows, and the caller is an app/(public) route rendered for signed-out visitors.'),
  ('public','edu_public_decks','L','Public-page read: the body itself restricts to published/public rows, and the caller is an app/(public) route rendered for signed-out visitors.'),
  ('public','get_aga_public_data','L','Public-page read: the body itself restricts to published/public rows, and the caller is an app/(public) route rendered for signed-out visitors.'),
  ('public','get_agent_public','L','Public-page read: the body itself restricts to published/public rows, and the caller is an app/(public) route rendered for signed-out visitors.'),
  ('public','get_public_flashcard_set','L','Public-page read: the body itself restricts to published/public rows, and the caller is an app/(public) route rendered for signed-out visitors.'),
  ('public','check_guest_execution_limit','L','Guest (signed-out) execution lane for public agent apps: keyed on a browser fingerprint, and its whole purpose is to meter callers who have no account.'),
  ('public','record_guest_execution','L','Guest (signed-out) execution lane for public agent apps: keyed on a browser fingerprint, and its whole purpose is to meter callers who have no account.'),
  ('billing','public_plans','L','Public pricing page read, signed-out by design (fetchPublicPlans: "Readable signed-out (pricing page)"). The body returns only billing.plan rows that are active and is_public.'),
  ('public','agx_get_list_full','U','Signed-in agent list; called from the agent catalog and picker surfaces under a user session.'),
  ('public','agx_promote_version','U','Signed-in agent authoring: promote a stored version. Called from features/agents redux thunks under a user session.'),
  ('public','agx_update_from_source','U','Signed-in agent authoring: pull from the source agent. Called from features/agents redux thunks under a user session.'),
  ('public','check_org_slug_available','U','Signed-in organization creation: slug availability check from the org-create form.'),
  ('public','entity_schemas_list','U','Registry read for signed-in admin relationship surfaces and the generator scripts.'),
  ('public','entity_types_list','U','Registry read for signed-in admin surfaces and the entity-type generator.'),
  ('public','reference_categories_list','U','Registry read for signed-in admin relationship surfaces.'),
  ('public','get_database_enums','U','Signed-in platform-admin database surface (actions/admin/enum-functions.ts uses the user session client).'),
  ('public','get_database_function_by_id','U','Signed-in platform-admin database surface (actions/admin/sql-functions.ts, user session client).'),
  ('public','get_database_functions','U','Signed-in platform-admin database surface (actions/admin/database.ts, user session client).'),
  ('public','get_database_permissions','U','Signed-in platform-admin database surface (actions/admin/database.ts, user session client).'),
  ('public','get_enum_by_name','U','Signed-in platform-admin enum surface (user session client).'),
  ('public','get_enum_usage','U','Signed-in platform-admin enum surface (user session client).'),
  ('public','get_share_capabilities','U','Signed-in ShareModal: which share affordances a resource type supports. Owner-side surface, never a signed-out one.'),
  ('public','get_tool_detail','U','Signed-in agent tools manager.'),
  ('public','get_tools_list','U','Signed-in agent tools manager.'),
  ('public','get_tools_metadata','U','Signed-in agent tools manager.'),
  ('public','list_templates','U','Signed-in scope-system template picker.'),
  ('public','find_dm_direct_conversation','U','Signed-in direct-message lane (app/api/messages/conversations).'),
  ('crm','issue_unsubscribe_token','U','Signed-in CRM compliance surface mints the unsubscribe token that the anonymous door later consumes.'),
  ('seo','gsc_backfill_status','U','Signed-in Search Console surface.'),
  ('seo','keyword_value_map','U','Signed-in SEO value-system surfaces.'),
  ('seo','platform_default_rules','U','Signed-in SEO value-system settings.'),
  ('platform','resolve_change_handling','U','Signed-in change-policy service.'),
  ('ai','resolve_model_config','U','Reached by the SECURITY INVOKER function ai.audit_ui_enum_drift, which authenticated can execute; the nested call is privilege-checked as the caller.'),
  ('audit','broken_functions_snapshot_age','U','Reached by the SECURITY INVOKER function iam.canonical_certify, which authenticated can execute; the nested call is privilege-checked as the caller.'),
  ('audit','table_impact','U','Reached by the SECURITY INVOKER function iam.canonical_certify, which authenticated can execute; the nested call is privilege-checked as the caller.'),
  ('platform','custom_reference_source','U','Reached by the SECURITY INVOKER function platform.find_custom_references_to, which authenticated can execute.'),
  ('platform','extensibility_knob','U','Reached by the SECURITY INVOKER function platform.extensibility_knob_int, which authenticated can execute.'),
  ('public','system_org_id','U','Reached from the SECURITY INVOKER trigger agent._enforce_builtin_system_org, which fires on writes made by authenticated users; the nested call is privilege-checked as the writer.'),
  ('iam','governance_columns','U','Reached from the SECURITY INVOKER trigger iam._guard_governance_columns, which fires on writes made by authenticated users.'),
  ('web','assert_crawl_artifact_file_reused','U','Reached from the SECURITY INVOKER trigger web.validate_snapshot_artifact_files, which fires on writes made by authenticated users.'),
  ('seo','fn_brand_identity_sync_meaning','U','Reached from the SECURITY INVOKER trigger seo.brand_identity_sync_meaning_tg, which fires on writes made by authenticated users.'),
  ('seo','fn_value_rule_sync_meaning','U','Reached from the SECURITY INVOKER trigger seo.keyword_class_rule_sync_meaning_tg, which fires on writes made by authenticated users.'),
  ('platform','demote_custom_field_index','U','Reached from the SECURITY INVOKER trigger platform._custom_field_index_state, which fires on writes made by authenticated users.'),
  ('audit','classify_broken_function','N',NULL),
  ('audit','function_broken_live','N',NULL),
  ('audit','probe_library_grant_publish','N',NULL),
  ('audit','refresh','N',NULL),
  ('audit','refresh_log_recount','N',NULL),
  ('audit','relation_usage','N',NULL),
  ('audit','run_function_runtime_probes','N',NULL),
  ('communication','consume_voice_agent_session_reference','N',NULL),
  ('communication','issue_voice_agent_session_reference_unfenced','N',NULL),
  ('content_ir','routine_source','N',NULL),
  ('context','validate_dataset_template_source','N',NULL),
  ('crm','compute_sending_health','N',NULL),
  ('crm','resolve_recipient_jurisdiction','N',NULL),
  ('crm','upsert_party_phone_contact','N',NULL),
  ('docproc','recompute_canonical_for_file','N',NULL),
  ('education','reap_stale_study_sessions','N',NULL),
  ('esign','config_resolve','N',NULL),
  ('esign','generate_certificate','N',NULL),
  ('esign','resolve_config_snapshot','N',NULL),
  ('esign','wf_apply_signature_request','N',NULL),
  ('files','webhook_event_payload','N',NULL),
  ('files','webhook_reconcile','N',NULL),
  ('history','ensure_row_version_partitions','N',NULL),
  ('iam','backfill_org_from_owner','N',NULL),
  ('meta','capture_table_stats','N',NULL),
  ('platform','adopt_custom_fields','N',NULL),
  ('platform','backfill_record_names','N',NULL),
  ('platform','custom_field_index_ddl','N',NULL),
  ('platform','declare_custom_record_edge','N',NULL),
  ('platform','deprecate_relation','N',NULL),
  ('platform','derive_reachability','N',NULL),
  ('platform','entity_default_visibility','N',NULL),
  ('platform','entity_title','N',NULL),
  ('platform','materialize_library_rulebook','N',NULL),
  ('platform','promote_custom_field_index','N',NULL),
  ('platform','purpose_mandate_organization','N',NULL),
  ('platform','reachability_ancestors','N',NULL),
  ('platform','reachability_touch','N',NULL),
  ('platform','sync_association_gc_triggers','N',NULL),
  ('public','admin_list_tables','N',NULL),
  ('public','component_created_by_report','N',NULL),
  ('public','create_related_records','N',NULL),
  ('public','ctx_seed_template','N',NULL),
  ('public','entity_client_excluded_columns','N',NULL),
  ('public','execute_admin_query','N',NULL),
  ('public','expire_stale_tunnels','N',NULL),
  ('public','get_storage_object','N',NULL),
  ('public','is_pack_curator','N',NULL),
  ('public','is_rulebook_curator','N',NULL),
  ('public','league_add_result','N',NULL),
  ('public','library_entitlement','N',NULL),
  ('public','library_is_open','N',NULL),
  ('public','mtx_media_durability_health','N',NULL),
  ('public','mtx_media_durability_scan','N',NULL),
  ('public','mtx_media_durability_schemas','N',NULL),
  ('public','partition_runway_snapshot','N',NULL),
  ('public','reachability_guard_report','N',NULL),
  ('public','resolve_shareable_resource','N',NULL),
  ('public','schema_truth_snapshot','N',NULL),
  ('public','share_link_authorizes','N',NULL),
  ('public','shareable_owner_column','N',NULL),
  ('public','tool_register','N',NULL),
  ('seo','detect_keyword_places','N',NULL),
  ('seo','fn_claim_keyword_classification_batch','N',NULL),
  ('seo','fn_claim_topic_placement_batch','N',NULL),
  ('seo','fn_complete_keyword_classification_batch','N',NULL),
  ('seo','fn_complete_topic_placement_batch','N',NULL),
  ('seo','fn_ingest_keyword_research','N',NULL),
  ('seo','fn_refresh_keyword_classification_queue','N',NULL),
  ('seo','fn_refresh_topic_placement_queue','N',NULL),
  ('seo','fn_topic_placement_counts','N',NULL),
  ('seo','fn_topic_placement_settled_since','N',NULL),
  ('seo','fn_topic_placement_sites_owing','N',NULL),
  ('seo','gsc_set_brand_aliases','N',NULL),
  ('web','assert_component_site','N',NULL),
  ('workflow','engram_confirmed_success_count','N',NULL),
  ('workflow','engram_recount_successes','N',NULL);

  for r in
    select t.klass, t.reason, n.nspname as sch, p.proname as nm, p.oid,
           pg_get_function_identity_arguments(p.oid) as ident_args
    from _dd110 t
    join pg_namespace n on n.nspname = t.schema_name
    join pg_proc p on p.pronamespace = n.oid and p.proname = t.function_name
    where p.prosecdef and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
    order by 3, 4
  loop
    v_args := r.ident_args;
    v_sig := format('%I.%I(%s)', r.sch, r.nm, v_args);

    -- The door row goes in BEFORE any grant, per §6d-4, so the grant sticks.
    if r.klass in ('L', 'kernel', 'U') then
      insert into platform.client_callable_door (schema_name, function_name, identity_args, reason)
      select r.sch, r.nm, v_args, r.reason
      where not exists (
        select 1 from platform.client_callable_door d
        where d.schema_name = r.sch and d.function_name = r.nm and d.identity_args = v_args);
      get diagnostics v_doors = row_count;
    end if;

    if r.klass = 'U' then
      execute format('revoke all on function %s from public, anon', v_sig);
      execute format('grant execute on function %s to authenticated, service_role', v_sig);
      v_revoked := v_revoked + 1;
    elsif r.klass = 'N' then
      execute format('revoke all on function %s from public, anon, authenticated', v_sig);
      execute format('grant execute on function %s to service_role', v_sig);
      v_revoked := v_revoked + 1;
    end if;

    -- The class fix: a grandfather row on anything in this sweep is what let the §6d-4 guard
    -- stand down. Declared doors are protected by their door row from here on; everything else
    -- is protected by having no door row at all.
    delete from platform.definer_client_grant_grandfather g
    where g.schema_name = r.sch and g.function_name = r.nm;
  end loop;

  raise notice 'dd110: % functions had grants changed', v_revoked;
end $$;

-- ── Assertions. A migration that cannot prove its own end state is not a fix. ────────────
do $$
declare v_n int; v_bad text;
begin
  -- 1. No function this sweep closed is still reachable by anon.
  select count(*), min(n.nspname||'.'||p.proname) into v_n, v_bad
  from _dd110 t
  join pg_namespace n on n.nspname = t.schema_name
  join pg_proc p on p.pronamespace = n.oid and p.proname = t.function_name
  where t.klass in ('U','N') and p.prosecdef and p.prokind='f' and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_n > 0 then raise exception 'dd110: % closed function(s) still anon-executable, e.g. %', v_n, v_bad; end if;

  -- 2. No N function is reachable by authenticated either.
  select count(*), min(n.nspname||'.'||p.proname) into v_n, v_bad
  from _dd110 t
  join pg_namespace n on n.nspname = t.schema_name
  join pg_proc p on p.pronamespace = n.oid and p.proname = t.function_name
  where t.klass = 'N' and p.prosecdef and p.prokind='f' and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_n > 0 then raise exception 'dd110: % N-class function(s) still authenticated-executable, e.g. %', v_n, v_bad; end if;

  -- 3. Every declared door KEPT the reach it is declared for.
  select count(*), min(n.nspname||'.'||p.proname) into v_n, v_bad
  from _dd110 t
  join pg_namespace n on n.nspname = t.schema_name
  join pg_proc p on p.pronamespace = n.oid and p.proname = t.function_name
  where t.klass in ('L','kernel') and p.prosecdef and p.prokind='f' and p.prorettype <> 'trigger'::regtype
    and not has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_n > 0 then raise exception 'dd110: % anonymous door(s) LOST anon EXECUTE, e.g. %', v_n, v_bad; end if;

  select count(*), min(n.nspname||'.'||p.proname) into v_n, v_bad
  from _dd110 t
  join pg_namespace n on n.nspname = t.schema_name
  join pg_proc p on p.pronamespace = n.oid and p.proname = t.function_name
  where t.klass = 'U' and p.prosecdef and p.prokind='f' and p.prorettype <> 'trigger'::regtype
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_n > 0 then raise exception 'dd110: % authenticated door(s) LOST authenticated EXECUTE, e.g. %', v_n, v_bad; end if;

  -- 4. Every function in the sweep that keeps a client grant now DECLARES itself, and nothing in
  --    the sweep is left standing on a grandfather row.
  select count(*), min(t.schema_name||'.'||t.function_name) into v_n, v_bad
  from _dd110 t
  join pg_namespace n on n.nspname = t.schema_name
  join pg_proc p on p.pronamespace = n.oid and p.proname = t.function_name
  where p.prosecdef and p.prokind='f' and p.prorettype <> 'trigger'::regtype
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = t.schema_name and d.function_name = t.function_name
                      and d.identity_args = pg_get_function_identity_arguments(p.oid));
  if v_n > 0 then raise exception 'dd110: % client-callable function(s) in this sweep have no door row, e.g. %', v_n, v_bad; end if;

  select count(*) into v_n
  from _dd110 t join platform.definer_client_grant_grandfather g
    on g.schema_name = t.schema_name and g.function_name = t.function_name;
  if v_n > 0 then raise exception 'dd110: % grandfather row(s) survived the sweep', v_n; end if;

  raise notice 'dd110: all assertions passed';
end $$;
