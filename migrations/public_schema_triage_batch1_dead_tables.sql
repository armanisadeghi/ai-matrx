-- public_schema_triage_batch1_dead_tables.sql
-- APPLIED LIVE 2026-08-12 via aidream direct connection (Supabase MCP auth unavailable mid-session).
-- Triage: common-docs/operations/public-schema-triage.md (batches 1-3).
-- 18 verified-empty dead tables DROPPED outright (Arman ruling 2026-08-12: truly empty + zero
-- callers skips graveyard); 5 dead-with-rows tables SET SCHEMA graveyard (rows preserved:
-- dashboard_saved_views=2, microservice_project=1, full_spectrum_positions=12, ts_check_runs=1,
-- site_metadata=9). Uncalled cld_* RPC family dropped. Registries cleaned (entity_types,
-- shareable_resource_registry, mtx_public_url_guard) + platform.deprecated_relations ledgered.
-- Idempotent: every drop/move is guarded by to_regclass; emptiness re-checked in-transaction.
do $$
declare
  t text;
  n bigint;
  drop_list text[] := array[
    'agent_run_stage','agent_run','user_memory',
    'cld_share_links','cld_file_permissions','cld_user_group_members','cld_user_groups',
    'cld_file_versions','cld_files','cld_folders','cld_uploads_inflight',
    'agenda_run','agenda_task','window_sessions','forbidden_urls','analysis_recipes',
    'applet_containers','container_fields'];
  gy_list text[] := array[
    'dashboard_saved_views','microservice_project','full_spectrum_positions','ts_check_runs','site_metadata'];
  r record;
begin
  for r in
    select pol.polname, c.relname from pg_policy pol
    join pg_class c on c.oid=pol.polrelid
    where c.relnamespace='public'::regnamespace and c.relname = any(drop_list)
  loop
    execute format('drop policy %I on public.%I', r.polname, r.relname);
  end loop;

  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace='public'::regnamespace
      and p.proname in ('cld_get_effective_permission','cld_get_user_file_tree')
  loop
    execute format('drop function %s', r.sig);
  end loop;

  foreach t in array drop_list loop
    if to_regclass('public.'||t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise exception 'ABORT: public.% has % rows — was empty at triage; investigate before dropping', t, n;
      end if;
      execute format('drop table public.%I', t);
    end if;
  end loop;

  if to_regclass('public.site_metadata') is not null then
    execute 'drop trigger if exists site_metadata_public_url_guard on public.site_metadata';
    delete from public.mtx_public_url_guard where schema_name='public' and table_name='site_metadata';
  end if;
  foreach t in array gy_list loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I set schema graveyard', t);
    end if;
  end loop;

  delete from platform.shareable_resource_registry where table_name='analysis_recipes';
  delete from platform.entity_types where schema_name='public' and table_name in ('analysis_recipes','window_sessions');
  update platform.entity_types set is_active=false
    where schema_name='public' and table_name in ('dashboard_saved_views','microservice_project');

  insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
  select 'public.'||x.old_t, x.new_r, x.arch, x.why
  from (values
    ('agent_run',            'chat.agent_run',            null,                                'dead public twin of chat.agent_run; 0 rows'),
    ('agent_run_stage',      'chat.agent_run_stage',      null,                                'dead public twin; 0 rows'),
    ('user_memory',          'users.user_memory',         null,                                'dead public twin; 0 rows'),
    ('cld_files',            'files.files',               null,                                'cld_ family superseded by files.*; 0 rows'),
    ('cld_folders',          'files.folders',             null,                                'superseded; 0 rows'),
    ('cld_file_versions',    'files.file_versions',       null,                                'superseded; 0 rows'),
    ('cld_uploads_inflight', 'files.uploads_inflight',    null,                                'superseded; 0 rows'),
    ('cld_share_links',      'DELETED — no successor',    null,                                'feature not carried into matrx-files; 0 rows, no consumers'),
    ('cld_file_permissions', 'DELETED — no successor',    null,                                'only consumer was uncalled cld RPC; 0 rows'),
    ('cld_user_groups',      'DELETED — no successor',    null,                                'no consumers; 0 rows'),
    ('cld_user_group_members','DELETED — no successor',   null,                                'no consumers; 0 rows'),
    ('agenda_task',          'matrx-extend sch_* tables', null,                                'superseded by matrx-extend sch_*; drop documented in its migration step 7 but never applied'),
    ('agenda_run',           'matrx-extend sch_* tables', null,                                'superseded; 0 rows'),
    ('window_sessions',      'DELETED — FE IndexedDB',    null,                                'FE window persistence moved to IndexedDB/localStorage; 0 rows, no consumers'),
    ('forbidden_urls',       'DELETED — no successor',    null,                                'scraper-era leftover; 0 rows, ORM scaffolding only'),
    ('analysis_recipes',     'files.analysis',            null,                                'redaction/analysis config superseded; 0 rows'),
    ('container_fields',     'DELETED — no successor',    null,                                'applet-builder junction; FKs pointed into graveyard; 0 rows'),
    ('applet_containers',    'DELETED — no successor',    null,                                'applet-builder junction; 0 rows'),
    ('dashboard_saved_views','GRAVEYARDED',               'graveyard.dashboard_saved_views',   'no code consumers in any repo; 2 rows preserved'),
    ('microservice_project', 'GRAVEYARDED',               'graveyard.microservice_project',    'no consumers; 1 row preserved'),
    ('full_spectrum_positions','GRAVEYARDED',             'graveyard.full_spectrum_positions', '2025 recruiting content, no feature; 12 rows preserved'),
    ('ts_check_runs',        'GRAVEYARDED',               'graveyard.ts_check_runs',           'writer removed from FE scripts; 1 row preserved'),
    ('site_metadata',        'web.* marketing schema',    'graveyard.site_metadata',           'client-site SEO metadata superseded by web schema; 9 rows preserved')
  ) as x(old_t, new_r, arch, why)
  on conflict do nothing;
end $$;
