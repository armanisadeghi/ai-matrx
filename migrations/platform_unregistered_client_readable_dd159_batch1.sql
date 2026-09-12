-- platform_unregistered_client_readable_dd159_batch1 — THE PERSONAL-SHAPED TABLES ENTER THE REGISTRY
-- (DD-159, batch 1).
--
-- THE FINDING (B-41b §FR1.8, re-measured live by B-48 on 2026-09-12):
--   251 base tables carry an `anon` or `authenticated` SELECT grant and have NO row in
--   `platform.entity_types` at all. Unregistered means: no class, so `iam.class_lanes` has nothing
--   to resolve; no generated policy, so nothing keeps the lane set honest; and no guard, because
--   `iam.verify_canonical` only walks registered tokens. The two vault tables were the first two of
--   these to be found (DD-137b11) and they were found by accident.
--
--   COUNTS MEAN NOTHING here and no number below is an argument. The argument is structural: a
--   client-readable table outside the registry is outside every mechanism the platform has for
--   saying who may read it. The measurements are recorded because a change to a live door must be
--   proven not to move it, not because 251 is large.
--
-- CORRECTION TO B-41b's PROSE: it says "so 49 remain" and then enumerates 48. The live set is 48.
--   Re-measured: 48 of the 251 carry `user_id` or `created_by`.
--
-- WHAT THIS MIGRATION DOES: it REGISTERS 47 of those 48 and it CHANGES NO POLICY AND NO GRANT.
--   This is the DD-137b11 move, for the same reason DD-137b11 gave: `iam.apply_rls` DROPS every
--   policy on a table before it generates, and these 47 tables carry live policies between them
--   that nobody in this lane wrote and nobody has proven equivalent to a generated set. Registering
--   is what makes them VISIBLE to `iam.verify_canonical`, to `iam.class_lanes` and to the guard this
--   change ships; generating is a separate, per-table, proven-equivalent act. Registration grants no
--   user any access (db-rules §1: "registration itself grants no user any access — it only makes the
--   resolver able to say yes"), and §5 below PROVES that on all 251 tables and five identities
--   rather than asserting it.
--
-- THE ONE NOT REGISTERED, and why (the Doctrine's retirement manifest: list, do not move):
--   * `platform._bak_assoc_file_processed_document_20260812` (239 rows) — a dated `_bak_` copy taken
--     on 2026-08-12. A backup is not an entity.
--   Its only mentions across matrx-frontend, aidream, matrx-sandbox, matrx-extend and matrx-local
--   are generated schema snapshots and org-null baselines — no reader, no writer.
--   It stays unregistered and is carried on the guard's allowlist with that reason and an owner,
--   which is what an allowlist is for. Retiring it is the chair's call, not this lane's.
--
--   TWO TABLES THAT LOOKED LIKE RETIREMENT CANDIDATES AND ARE NOT (censused, not assumed):
--   `extend.wbx_demo` holds 0 rows but has eight live consumer sites in matrx-extend
--   (`src/lib/supabase/queries.ts`, `src/lib/demos/*`, `src/lib/tools/handlers/demos.ts`,
--   `src/hooks/use-guidance-sync.ts`); `platform._base_entity` is the shape the ORM and the
--   provisioner clone (`aidream/packages/matrx-orm/matrx_orm/entity.py`,
--   `aidream/aidream/services/associations.py`). A table with 0 rows and 8 readers is empty, not
--   dead. Both are registered below.
--
-- ═════════════════════════════════════════════ 0. A DOOR DEFECT THIS BATCH CANNOT GET PAST
--
-- `platform._entity_types_classify_default` (BEFORE INSERT) nulls `data_class` for `component` AND
-- for `ledger`. For a component that is the law (db-rules §6d-1 — its access IS its parent's). For a
-- ledger it is DD-137b10's ruling inverted at the door: a ledger has no composition parent to
-- inherit from, so it must STATE its class, and `iam.verify_canonical`'s `data_class_set` check
-- FAILs a ledger whose class is unset — "an unset one would have to be guessed, and guessing is how
-- 299 of 311 components kept a platform-staff lane". PROVEN LIVE 2026-09-12 in a rolled-back
-- transaction: inserting a `ledger` row with `data_class => 'confidential'` read back `NULL`.
-- So every ledger registered since DD-137b10 has been BORN FAILING, silently. All 22 live ledgers
-- carry a class only because they were classified by UPDATE, after the door.
--
-- Fixed here at the class, not the instance: the trigger nulls a class for `component` only, and
-- says so. Nothing else in it changes. (The sibling AFTER-UPDATE trigger
-- `_entity_types_class_regenerates` already returns early for `ledger` and `component`, so no
-- regeneration is reachable from this change.)
create or replace function platform._entity_types_classify_default()
 returns trigger
 language plpgsql
as $function$
begin
  if new.rls_variant = 'component' then
    -- A component's access IS its parent's (db-rules §6d-1); it holds no class of its own.
    new.data_class := null; new.default_list_scope := null; new.data_class_reason := null;
    return new;
  end if;
  if new.rls_variant = 'ledger' then
    -- DD-137b10: a ledger has NO composition parent, so "ask the parent" has nothing to ask and an
    -- unset class would have to be guessed. It keeps the class it was registered with, and
    -- `default_list_scope` stays NULL because a ledger row has a position, not a "mine".
    -- (Before 2026-09-12 this branch nulled the class too, so every new ledger was born FAILing
    --  iam.verify_canonical's data_class_set check with nothing to tell anyone why. DD-159.)
    new.default_list_scope := null;
    if new.data_class is null then
      new.data_class := platform.derive_data_class(new.rls_variant, new.default_visibility::text);
      new.data_class_reason := coalesce(new.data_class_reason,
        'Born unclassified and derived by platform.derive_data_class. A ledger must STATE its class '
        '(DD-137b10) — reclassify deliberately.');
    end if;
    return new;
  end if;
  if new.data_class is null then
    new.data_class := platform.derive_data_class(new.rls_variant, new.default_visibility::text);
    new.data_class_reason := coalesce(new.data_class_reason, format(
      'Born unclassified and derived by platform.derive_data_class from rls_variant=%s, '
      'default_visibility=%s. Reclassify deliberately if this table is not what its birth flags '
      'say it is — a derived class is a description, not a decision.',
      new.rls_variant, coalesce(new.default_visibility::text, 'unset')));
  end if;
  if new.default_list_scope is null then
    new.default_list_scope := platform.derive_list_scope(new.rls_variant, new.data_class);
  end if;
  return new;
end
$function$;

-- ═════════════════════════════════════════════ 1. the reads, BEFORE anything moves
--
-- Five identities × all 251 unregistered client-readable tables. Kept in a temp table and compared
-- against the same measurement at the end. A registration that moves ANY of the 1,255 answers is a
-- registration that did something it promised not to do, and §5 raises on it by name.
create temporary table _b48_before(sch text, tbl text, identity text, readable boolean) on commit drop;
create temporary table _b48_after (sch text, tbl text, identity text, readable boolean) on commit drop;

create or replace function pg_temp._b48_measure(p_into text) returns void language plpgsql as $fn$
declare
  r record; i int; v_name text; v_uid text; v_any boolean;
  ids text[][] := array[
    array['anon',''], array['padmin','6555aa73-c647-4ecf-8a96-b60e315b6b18'],
    array['owner','392afd39-d59c-4418-866b-451e9d93fead'],
    array['orgadmin','34ed4fc3-c527-4819-99bf-15c26603b261'],
    array['member','f0146c96-e02e-420b-a99f-92774da0566c']];
begin
  for r in
    with g as (
      select c.oid,
             bool_or(x.grantee='anon' and x.priv='SELECT') anon_sel,
             bool_or(x.grantee='authenticated' and x.priv='SELECT') auth_sel
        from pg_class c
        cross join lateral (select (aclexplode(c.relacl)).grantee::regrole::text grantee,
                                   (aclexplode(c.relacl)).privilege_type priv) x
       where c.relkind in ('r','p') group by c.oid)
    select n.nspname sch, c.relname tbl, g.anon_sel, g.auth_sel
      from pg_class c join pg_namespace n on n.oid=c.relnamespace join g on g.oid=c.oid
     where c.relkind in ('r','p') and (g.anon_sel or g.auth_sel)
       and n.nspname not in ('pg_catalog','information_schema','pg_toast','auth','storage','realtime',
            'vault','supabase_migrations','extensions','graphql','graphql_public','net','pgsodium',
            'pgsodium_masks','supabase_functions','cron','pgbouncer','_analytics','_realtime')
       and (n.nspname, c.relname) in (select sch, tbl from _b48_scope)
     order by 1,2
  loop
    for i in 1..array_length(ids,1) loop
      v_name := ids[i][1]; v_uid := ids[i][2]; v_any := null;
      begin
        if v_name = 'anon' then
          if not r.anon_sel then continue; end if;
          perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
          execute 'set local role anon';
        else
          if not r.auth_sel then continue; end if;
          perform set_config('request.jwt.claims',
            json_build_object('sub',v_uid,'role','authenticated')::text, true);
          execute 'set local role authenticated';
        end if;
        execute format('select exists (select 1 from %I.%I)', r.sch, r.tbl) into v_any;
      exception when others then
        v_any := null;   -- a refusal reads as "no rows reachable", which is the safe direction
      end;
      begin execute 'reset role'; exception when others then null; end;
      execute format('insert into %s values ($1,$2,$3,$4)', p_into) using r.sch, r.tbl, v_name, v_any;
    end loop;
  end loop;
end $fn$;

-- The scope is pinned BEFORE the registrations, so the after-measurement covers the same 251
-- relations and a table does not fall out of the comparison by becoming registered.
create temporary table _b48_scope(sch text, tbl text) on commit drop;
insert into _b48_scope
  with g as (select c.oid, bool_or(x.grantee in ('anon','authenticated') and x.priv='SELECT') sel
               from pg_class c
               cross join lateral (select (aclexplode(c.relacl)).grantee::regrole::text grantee,
                                          (aclexplode(c.relacl)).privilege_type priv) x
              where c.relkind in ('r','p') group by c.oid)
  select n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join g on g.oid=c.oid
    left join platform.entity_types et on et.schema_name=n.nspname and et.table_name=c.relname
   where c.relkind in ('r','p') and g.sel and et.token is null
     and n.nspname not in ('pg_catalog','information_schema','pg_toast','auth','storage','realtime',
          'vault','supabase_migrations','extensions','graphql','graphql_public','net','pgsodium',
          'pgsodium_masks','supabase_functions','cron','pgbouncer','_analytics','_realtime');

do $$
declare n int;
begin
  select count(*) into n from _b48_scope;
  if n <> 251 then
    raise exception 'dd159: the unregistered client-readable set is % relations, not the 251 this '
      'migration was measured against. Somebody else moved the set; re-measure before applying.', n;
  end if;
  perform pg_temp._b48_measure('_b48_before');
  raise notice 'dd159: baseline read for % relation/identity pairs',
    (select count(*) from _b48_before);
end $$;

-- ═════════════════════════════════════════════ 2. token collisions are checked, never assumed
do $$
declare v_clash text;
begin
  select string_agg(t, ', ') into v_clash
    from unnest(array[
      'html_extraction','billing_connect_account','billing_customer','billing_subscription',
      'billing_user_plan','chat_user_usage_summary','user_active_context','study_streak',
      'extension_auth_code','files_user_account','user_storage_usage','user_entity_state',
      'mcp_user_conn','task_user_state','billing_usage_ledger','context_access_log',
      'data_rights_event','api_field_warning','api_request_log','matrx_action_ledger',
      'retrieval_audit','user_secret_audit','assignment_session','scope_dataset_instance',
      'dict_entry','guardian_link','math_problem','file_rag_job','org_member_control','platform_share_link',
      'scrape_parsed_page','user_secret_grant','udt_dataset_template','admin_markdown_sample',
      'admin_user','audit_exemption','app_log_muted_pattern','app_log_norm_exception',
      'assist_producer_policy','retention_policy','system_announcement','extract_sweep_state',
      'permission_grant','wbx_demo','base_entity_template',
      'udt_document_snapshot','udt_workbook_snapshot']) t
   where exists (select 1 from platform.entity_types e where e.token = t);
  if v_clash is not null then
    raise exception 'dd159: these tokens already exist and this batch would collide with them: %. '
      'A token is the only stable identity (db-rules §1) — pick a different name, never reuse.',
      v_clash;
  end if;
end $$;

-- ═════════════════════════════════════════════ 3. the 45 registrations
--
-- `rls_variant` is the table's real SHAPE, so `iam.verify_canonical` judges it against the contract
-- it actually has. `data_class` is the floor a future generation must respect. Neither is applied to
-- a policy here.
do $$
declare
  v_seen constant text := ' Registered by DD-159 batch 1 (B-48) as part of closing the '
    '"client-readable but unregistered" class: this table had an anon or authenticated SELECT grant '
    'and no registry row at all, so it had no class, no generated policy and no guard. REGISTERED, '
    'NOT REGENERATED — its live policies are untouched and unproven. Read iam.verify_canonical on '
    'this token before running iam.apply_rls on it: apply_rls DROPS every policy first.';
  r record;
begin
  for r in
    select * from (values
      -- schema, table, token, label, variant, data_class, list_scope, audit_class, reason
      ('api','html_extractions','html_extraction','HTML extraction','personal','private','mine','entity',
       'A person''s own saved HTML extractions, keyed on user_id.'),
      ('billing','connect_account','billing_connect_account','Billing connect account','personal','private','mine','entity',
       'A person''s payout account with the payment processor.'),
      ('billing','customer','billing_customer','Billing customer','personal','private','mine','entity',
       'A person''s billing identity with the payment processor.'),
      ('billing','subscription','billing_subscription','Billing subscription','personal','private','mine','entity',
       'What a person pays for. Nobody browses other people''s subscriptions.'),
      ('billing','user_plan','billing_user_plan','User plan','personal','private','mine','entity',
       'The plan a person is on.'),
      ('chat','user_usage_summary','chat_user_usage_summary','Chat usage summary','personal','private','mine','entity',
       'A person''s own chat usage. Aggregate is still personal.'),
      ('context','user_active_context','user_active_context','Active context','personal','private','mine','entity',
       'What a person currently has open. UI state, and still theirs alone.'),
      ('education','study_streak','study_streak','Study streak','personal','private','mine','entity',
       'A learner''s own streak.'),
      ('extend','extension_auth_codes','extension_auth_code','Extension auth code','personal','private','mine','entity',
       'Short-lived browser-extension pairing codes. A code is a credential while it lives.'),
      ('files','user_account','files_user_account','File account','personal','private','mine','entity',
       'A person''s file-storage account.'),
      ('files','user_storage_usage','user_storage_usage','Storage usage','personal','private','mine','entity',
       'How much a person is storing.'),
      ('platform','user_entity_state','user_entity_state','User entity state','personal','private','mine','entity',
       'Per-person state against an entity (pins, last-seen). Theirs alone.'),
      ('tool','mcp_user_conn','mcp_user_conn','MCP user connection','personal','private','mine','entity',
       'A person''s own connections to external MCP servers — credential-adjacent by construction.'),
      ('workspace','task_user_state','task_user_state','Task user state','personal','private','mine','entity',
       'Per-person state against a task.'),

      ('billing','usage_ledger','billing_usage_ledger','Usage ledger','ledger','private',null,'entity',
       'Append-only record of what a person consumed. A ledger states its class (DD-137b10).'),
      ('context','context_access_log','context_access_log','Context access log','ledger','confidential',null,'entity',
       'Who reached which context. An access log is evidence about people.'),
      ('education','data_rights_event','data_rights_event','Data rights event','ledger','private',null,'entity',
       'A person''s data-rights requests and their handling. Private by subject matter.'),
      ('ops','api_field_warnings','api_field_warning','API field warning','ledger','confidential',null,'entity',
       'Server-written diagnostics carrying a user_id.'),
      ('ops','api_request_log','api_request_log','API request log','ledger','confidential',null,'entity',
       'Server-written request log carrying a user_id — who called what, and when.'),
      ('platform','matrx_action_ledger','matrx_action_ledger','Action ledger','ledger','confidential',null,'entity',
       'Append-only record of platform actions taken by a person.'),
      ('rag','retrieval_audit','retrieval_audit','Retrieval audit','ledger','private',null,'entity',
       'What a person searched for and what came back. Query text is personal.'),
      ('users','user_secret_audit','user_secret_audit','Secret audit','ledger','private',null,'entity',
       'The vault''s own audit trail. 🚨 BESPOKE BY DESIGN with users.user_secrets (DD-137b11) — '
       'do NOT run iam.apply_rls on it.'),

      ('assignment','session','assignment_session','Assignment session','entity','confidential','mine','entity',
       'A learner''s sitting of an assignment.'),
      ('context','scope_dataset_instances','scope_dataset_instance','Scope dataset instance','entity','confidential','mine','entity',
       'A person''s bound dataset instance inside a scope.'),
      ('dictionary','dict_entries','dict_entry','Dictionary entry','entity','organization','organization','entity',
       'Organization-authored dictionary content.'),
      ('education','guardian_link','guardian_link','Guardian link','entity','private','mine','entity',
       'Which adult is linked to which child. There is no standing read for this, staff included.'),
      ('education','math_problems','math_problem','Math problem','entity','public','organization','entity',
       '🚨 PUBLISHED CONTENT WITH A WRITE HOLE. Its live policy set contains a permissive FOR ALL '
       'policy on `authenticated` with USING (true) ("Authenticated users can manage math '
       'problems"), so today ANY signed-in person can UPDATE or DELETE all 12 rows. Classed public '
       'because the rows are published content; the write hole is named in DD-159 and is not closed '
       'by this registration.'),
      ('files','file_rag_jobs','file_rag_job','File RAG job','entity','confidential','mine','entity',
       'A person''s indexing jobs over their own files.'),
      ('iam','org_member_controls','org_member_control','Org member control','entity','organization','organization','entity',
       'What an organization has switched on for one of its members.'),
      ('platform','share_links','platform_share_link','Share link','entity','confidential','mine','entity',
       'Token is `platform_share_link`, not `share_link`: the latter is held by an INACTIVE row '
       'for graveyard.files_share_links and a token is never reused (db-rules §1). '
       '🚨 BESPOKE BY DESIGN: this table is the anon link-resolution door (355 live links). Its RLS '
       'is written for that and a generic lane set would either break every shared link or widen '
       'them. Do NOT run iam.apply_rls on it without proving the anon lane byte-for-byte.'),
      ('scraper','scrape_parsed_page','scrape_parsed_page','Parsed page','entity','confidential','mine','entity',
       'Pages a person had scraped on their behalf.'),
      ('users','user_secret_grants','user_secret_grant','Secret grant','entity','private','mine','entity',
       'The vault''s delegation lane. 🚨 BESPOKE BY DESIGN with users.credential_items and '
       'users.user_secrets (DD-137b11) — two live policies on those tables read THIS table, so '
       'generating here rewrites their door too. Do NOT run iam.apply_rls on it.'),
      ('workbench','udt_dataset_templates','udt_dataset_template','Dataset template','entity','organization','organization','entity',
       'Organization-authored dataset templates.'),

      ('admin','admin_markdown_samples','admin_markdown_sample','Admin markdown sample','system','confidential','organization','entity',
       'Platform-operator tooling content.'),
      ('admin','admins','admin_user','Platform admin','system','confidential','organization','entity',
       'WHO IS STAFF. The membership list of platform administration is not browsable content.'),
      ('meta','audit_exemption','audit_exemption','Audit exemption','system','confidential','organization','entity',
       'Which tables are exempted from an audit, and by whom. A visible exemption list is a map of '
       'where nobody is looking.'),
      ('ops','app_log_muted_pattern','app_log_muted_pattern','Muted log pattern','system','confidential','organization','entity',
       'Which errors the platform has chosen to stop reporting.'),
      ('ops','app_log_norm_exception','app_log_norm_exception','Log normalisation exception','system','confidential','organization','entity',
       'Operator configuration of log normalisation.'),
      ('platform','assist_producer_policy','assist_producer_policy','Assist producer policy','system','organization','organization','entity',
       'Platform-set policy for assist producers, read by organizations.'),
      ('platform','retention_policy','retention_policy','Retention policy','system','organization','organization','entity',
       'How long each organization''s data is kept.'),
      ('users','system_announcements','system_announcement','System announcement','system','public','organization','entity',
       'Announcements written for every signed-in person to read. Public is the honest class.'),
      ('workflow','extract_sweep_state','extract_sweep_state','Extract sweep state','system','confidential','organization','entity',
       'Server-written sweep cursor. It carries a user_id but nobody owns it.'),

      ('extend','wbx_demo','wbx_demo','Extension demo record','entity','organization','organization','entity',
       'Holds 0 rows today and has eight live consumer sites in matrx-extend, so it is empty, not '
       'dead. It already carries the full base contract (organization_id, created_by, updated_by, '
       'version, deleted_at, metadata, visibility).'),

      ('platform','_base_entity','base_entity_template','Base entity template','system','confidential','organization','machinery',
       'THE SHAPE EVERY ENTITY TABLE IS CLONED FROM. platform.create_entity_table and the Matrx ORM '
       '(aidream/packages/matrx-orm/matrx_orm/entity.py, aidream/aidream/services/associations.py) '
       'both read it, and it owns no rows of its own. audit_class=machinery is the sanctioned way to '
       'sit outside the certification universe with the reason on the row, and it is what makes '
       'iam.apply_rls REFUSE it — generating a lane set over the template the generator clones from '
       'is a loop nobody should be able to start.'),

      ('iam','permissions','permission_grant','Permission grant','system','confidential','organization','machinery',
       'THE ACCESS KERNEL''S OWN GRANT STORE. iam.entity_read_expr, iam.accessible_entity_ids and '
       'iam.discoverable_ids all read this table, so a generated policy over it would reference the '
       'access walk that reads it — the recursive 42P17 db-rules §6d names. audit_class=machinery is '
       'the sanctioned way to sit outside the certification universe with the reason on the row, and '
       'it is what makes iam.apply_rls REFUSE this table. Registered so the class regime can SEE it.')
    ) as v(sch, tbl, token, label, variant, dclass, lscope, aclass, reason)
  loop
    insert into platform.entity_types (
      token, schema_name, table_name, label, rls_variant, is_active, is_listed, is_component,
      is_versioned, has_soft_delete, audit_class, audit_class_reason,
      data_class, default_list_scope, data_class_reason, notes)
    values (r.token, r.sch, r.tbl, r.label, r.variant, true, false, false,
            false, false, r.aclass,
            case when r.aclass = 'machinery' then r.reason else null end,
            r.dclass::platform.data_class, r.lscope::platform.list_scope,
            r.reason || v_seen, v_seen);
    -- The BEFORE INSERT trigger nulls a ledger's list_scope and (before §0) nulled its class; assert
    -- the row landed as declared rather than trusting it.
    if (select data_class from platform.entity_types where token = r.token) is distinct from r.dclass::platform.data_class then
      raise exception 'dd159: % was registered with data_class % but the row holds %',
        r.token, r.dclass, (select data_class::text from platform.entity_types where token = r.token);
    end if;
  end loop;
end $$;

-- The two component registrations, WITH the composition edge that makes them resolvable.
-- A component with no composition parent is a registry defect (three already exist); registering one
-- without its edge would add a fourth and `iam.class_lanes` would resolve it to `private` by the
-- safe-default rule rather than by its parent.
do $$
begin
  insert into platform.entity_types (
    token, schema_name, table_name, label, rls_variant, is_active, is_listed, is_component,
    is_versioned, has_soft_delete, notes)
  values
    ('udt_document_snapshot','workbench','udt_document_snapshots','Document snapshot','component',
     true, false, true, false, false,
     'A snapshot of workbench.udt_documents. Its access IS the document''s (db-rules §6d-1) and its '
     'live policy already reads the parent. Registered by DD-159 batch 1; NOT regenerated.'),
    ('udt_workbook_snapshot','workbench','udt_workbook_snapshots','Workbook snapshot','component',
     true, false, true, false, false,
     'A snapshot of workbench.udt_workbooks. Its access IS the workbook''s (db-rules §6d-1) and its '
     'live policy already reads the parent. Registered by DD-159 batch 1; NOT regenerated.');

  insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note)
  values
    ('udt_document_snapshot','udt_document','document_id','composition',
     'DD-159: the edge iam.class_lanes walks to resolve the snapshot''s class from the document.'),
    ('udt_workbook_snapshot','workbook','workbook_id','composition',
     'DD-159: the edge iam.class_lanes walks to resolve the snapshot''s class from the workbook.')
  on conflict do nothing;
end $$;

-- ═════════════════════════════════════════════ 4. what is now registered, and what is not
do $$
declare v_reg int; v_left int;
begin
  select count(*) into v_reg from platform.entity_types e
    join _b48_scope s on s.sch = e.schema_name and s.tbl = e.table_name where e.is_active;
  if v_reg <> 47 then
    raise exception 'dd159: % of the 251 are now registered, not the 47 this batch declares', v_reg;
  end if;
  select count(*) into v_left from _b48_scope s
   where not exists (select 1 from platform.entity_types e
                      where e.schema_name = s.sch and e.table_name = s.tbl);
  raise notice 'dd159: 47 registered; % client-readable relations remain outside the registry '
    '(28 of them are partitions of history.row_versions, which is itself one of them)', v_left;
end $$;

-- ═════════════════════════════════════════════ 5. THE PROOF: no door moved
--
-- The same 1,255 measurements, re-run. Registration is supposed to grant nobody anything; this is
-- where that stops being a claim. A single changed answer in EITHER direction aborts the migration —
-- over-tightening is as serious a defect as a stranger let in (db-rules §6).
do $$
declare v_diff text; v_n int;
begin
  perform pg_temp._b48_measure('_b48_after');

  select string_agg(format('%s.%s/%s: %s -> %s', b.sch, b.tbl, b.identity,
                           coalesce(b.readable::text,'refused'), coalesce(a.readable::text,'refused')), '; '),
         count(*)
    into v_diff, v_n
    from _b48_before b
    join _b48_after  a on a.sch=b.sch and a.tbl=b.tbl and a.identity=b.identity
   where b.readable is distinct from a.readable;

  if v_n > 0 then
    raise exception 'dd159: registration MOVED % of the % reads it promised not to touch: %',
      v_n, (select count(*) from _b48_before), left(v_diff, 2000);
  end if;

  raise notice 'dd159: % relation/identity reads identical before and after across all 251 tables '
    'and 5 identities (anon, platform admin, an owner, an org admin, a plain member)',
    (select count(*) from _b48_before);
end $$;
