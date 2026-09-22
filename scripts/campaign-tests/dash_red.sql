-- scripts/campaign-tests/dash_red.sql — THE RED TWIN of dash_green.sql (lane DASHBOARDS).
--
-- Each block below puts the REAL pre-fix bytes back, inside a transaction that is rolled
-- back, and asserts that the thing the green suite proves right goes WRONG. A guard nobody
-- has watched fail is not a guard.
--
-- Run: <scratchpad>/p.sh -f scripts/campaign-tests/dash_red.sql

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'dash_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $red$
declare
  c_admin  uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana   uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss   text := current_user;
  v_org    uuid := gen_random_uuid();
  v_home   uuid; v_tbl uuid; v_dash uuid; v_id uuid;
  v_out    jsonb; v_msg text; v_n integer; v_i integer; v_this jsonb;
  v_red    integer := 0;
begin
  perform set_config('app.actor_system', 'campaign-test/dash_red.sql', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'DASH red suite', 'dash-red-' || replace(v_org::text,'-',''), 'DRS', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active'),
         (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'),
         ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"');
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, custom.organization_kernel_id(), 'record', jsonb_build_object('name','Workspace'), c_admin)
  returning id into v_home;

  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this suite did not take the seat — current_user is %', current_user;
  end if;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Jobs','slug','jobs','description','','type','entity','display','list',
    'ordered', false,'weight','light','retention_days',30,'row_order','sorted',
    'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
    'agent_writable', true,'label_singular','Job','label_plural','Jobs','title_field','title',
    'fields', jsonb_build_array(jsonb_build_object('name','title'), jsonb_build_object('name','stage'),
                                jsonb_build_object('name','owner')),
    'parent_id', v_home));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','title','name','title','field_type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','stage','name','stage','field_type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','owner','name','owner','field_type','text'));
  for v_i in 1..20 loop
    v_id := custom.record_write(v_org, v_tbl, jsonb_build_object(
      'title','Job ' || lpad(v_i::text,2,'0'),
      'stage',(array['New','Scheduled','In progress','Awaiting parts','Done'])[1 + (v_i % 5)],
      'owner',case when v_i % 2 = 0 then 'Dana' else 'Marcus' end));
  end loop;
  perform set_config('role', v_boss, true);
  update custom.record set created_by = c_admin, visibility = 'personal'::platform.visibility
   where organization_id = v_org and table_id = v_tbl;
  update custom.record set created_by = c_admin where organization_id = v_org and id = v_tbl;
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
  select 'record', r.id, c_dana, 'viewer', 'active'
    from custom.record r where r.organization_id = v_org and r.table_id = v_tbl and r.data ->> 'owner' = 'Dana';
  perform set_config('role', 'authenticated', true);

  v_this := jsonb_build_object('from', to_char(date_trunc('month', now()),'YYYY-MM-DD'),
                               'to',   to_char(date_trunc('month', now()) + interval '1 month','YYYY-MM-DD'));
  v_dash := custom.dashboard_declare(v_org, v_tbl, 'Jobs this month',
    jsonb_build_array(
      jsonb_build_object('title','Opened this month','kind','number','filter', jsonb_build_object('created_at', v_this)),
      jsonb_build_object('title','By stage','kind','column','group_by', jsonb_build_array('stage'))));

  -- ══ RED 1 — THE AGGREGATE DOOR WITH NO WINDOW ARM ═════════════════════════════════════
  -- W4-AGG's filter loop, verbatim: every value is read with `->> key`, so an object renders
  -- as its JSON TEXT and is compared to a field. "This month" then matches nothing at all.
  perform set_config('role', v_boss, true);
  create or replace function custom.agg_sql(
    p_organization_id uuid, p_table_id uuid, p_group_by jsonb default '[]'::jsonb,
    p_measures jsonb default '[]'::jsonb, p_bucket jsonb default null::jsonb,
    p_filter jsonb default '{}'::jsonb, p_limit integer default 200,
    p_required text default 'viewer'::text)
  returns text language plpgsql stable set search_path to 'pg_catalog' as $f$
  declare v_where text[] := '{}'; v_key text;
  begin
    for v_key in select k from jsonb_object_keys(coalesce(p_filter,'{}'::jsonb)) k loop
      v_where := array_append(v_where, format('%s = %L', custom.agg_value_sql(v_key), p_filter ->> v_key));
    end loop;
    return format($q$ select '{}'::jsonb as groups,
                             jsonb_build_object('count', count(*)::numeric) as measures,
                             count(*)::bigint as row_count
                        from custom.record r
                       where r.organization_id = %L::uuid and r.table_id = %L::uuid
                         and r.deleted_at is null and %s %s limit 1 $q$,
      p_organization_id, p_table_id,
      custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                   p_required::public.permission_level, 'r'),
      case when cardinality(v_where) = 0 then '' else 'and ' || array_to_string(v_where,' and ') end);
  end $f$;
  perform set_config('role', 'authenticated', true);
  select (a.measures ->> 'count')::integer into v_n
    from custom.record_aggregate(v_org, v_tbl, '[]'::jsonb, '[]'::jsonb, null,
         jsonb_build_object('created_at', v_this), 200, 'viewer') a;
  if v_n = 20 then
    raise exception 'RED 1 DID NOT GO RED: the pre-fix door still answered twenty for "this month"';
  end if;
  raise notice 'RED 1 — the pre-fix aggregate door answers % for "this month" instead of 20: an object filter was compared as JSON TEXT and matched nothing', v_n;
  v_red := v_red + 1;

  -- ══ RED 2 — A BLOCK NOBODY JUDGED ═════════════════════════════════════════════════════
  -- dashboard_block_normalize with the Field check taken out: a block naming a column that
  -- does not exist is SAVED, and the person finds out a month later when the frame is empty.
  perform set_config('role', v_boss, true);
  create or replace function custom.dashboard_block_normalize(
    p_organization_id uuid, p_subject_table_id uuid, p_block jsonb)
  returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog' as $f$
  begin
    return jsonb_build_object(
      'title', coalesce(p_block ->> 'title', 'Block'),
      'kind',  coalesce(p_block ->> 'kind', 'number'),
      'table_id', coalesce(nullif(p_block ->> 'table_id','')::uuid, p_subject_table_id),
      'group_by', coalesce(p_block -> 'group_by', '[]'::jsonb),
      'measures', coalesce(p_block -> 'measures', jsonb_build_array(jsonb_build_object('op','count'))),
      'bucket', p_block -> 'bucket',
      'filter', coalesce(p_block -> 'filter', '{}'::jsonb),
      'limit', 50, 'span', 6);
  end $f$;
  perform set_config('role', 'authenticated', true);
  begin
    perform custom.dashboard_declare(v_org, v_tbl, 'Unjudged',
      jsonb_build_array(jsonb_build_object('kind','bar','group_by', jsonb_build_array('salary'))));
    raise notice 'RED 2 — a block grouped by "salary", a column this table does not have, was SAVED without a word';
    v_red := v_red + 1;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise exception 'RED 2 DID NOT GO RED: the unjudged normalizer still refused it: %', v_msg;
  end;

  -- ══ RED 3 — THE DASHBOARD LIST NARROWED BY THE DASHBOARD RECORD'S OWN VISIBILITY ══════
  -- The silent half of the defect the proof found: under shared_only the member's list simply
  -- came back empty, with no sentence at all.
  perform set_config('role', v_boss, true);
  create or replace function custom.dashboards(p_organization_id uuid, p_table_id uuid default null)
  returns table(dashboard_id uuid, table_id uuid, name text, blocks jsonb, presentation jsonb,
                block_count integer, version integer, created_at timestamptz, updated_at timestamptz)
  language plpgsql stable security definer set search_path to 'pg_catalog' as $f$
  begin
    perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboards');
    return query
      select d.id, nullif(d.data ->> 'subject_table_id','')::uuid, d.data ->> 'name',
             coalesce(d.data -> 'blocks','[]'::jsonb), coalesce(d.data -> 'presentation','{}'::jsonb),
             jsonb_array_length(coalesce(d.data -> 'blocks','[]'::jsonb)), d.version, d.created_at, d.updated_at
        from custom.record d
       where d.organization_id = p_organization_id
         and d.table_id = custom.presentation_kernel_id()
         and d.data_class = custom.dashboard_class()
         and d.deleted_at is null
         and d.id in (select v from custom.query_visible_ids(p_organization_id,
                                                             custom.presentation_kernel_id()) v)
         and (p_table_id is null or nullif(d.data ->> 'subject_table_id','')::uuid = p_table_id);
  end $f$;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into v_n from custom.dashboards(v_org, v_tbl) d;
  if v_n <> 0 then
    raise exception 'RED 3 DID NOT GO RED: the member still saw % dashboards', v_n;
  end if;
  raise notice 'RED 3 — the member of this organization is shown ZERO of its dashboards, silently, with no sentence at all';
  v_red := v_red + 1;

  -- ══ RED 4 — READING A DASHBOARD ASKED ABOUT THE DASHBOARD RECORD ═════════════════════
  -- The loud half: she is refused the whole canvas rather than given her own numbers.
  perform set_config('role', v_boss, true);
  create or replace function custom.dashboard_run(p_organization_id uuid, p_dashboard_id uuid,
                                                  p_filter jsonb default '{}'::jsonb)
  returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog' as $f$
  begin
    perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_run');
    perform custom.assert_client_may_change(p_organization_id, p_dashboard_id, 'custom.dashboard_run',
                                            'viewer'::public.permission_level, 'dashboard');
    return jsonb_build_object('blocks', '[]'::jsonb);
  end $f$;
  perform set_config('role', 'authenticated', true);
  begin
    perform custom.dashboard_run(v_org, v_dash, '{}'::jsonb);
    raise exception 'RED 4 DID NOT GO RED: the pre-fix door let the member through';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%do not have access to this dashboard%' then
      raise exception 'RED 4 went red for the wrong reason: %', v_msg;
    end if;
    raise notice 'RED 4 — "%" — the whole canvas, refused, to a member of the organization that owns it', v_msg;
    v_red := v_red + 1;
  end;

  if v_red <> 4 then
    raise exception 'only % of 4 blocks went red', v_red;
  end if;
  raise notice '=== 4 of 4 BLOCKS RED ===';
end
$red$;

rollback;
