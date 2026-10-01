-- INVERSE of migrations/campaign/switchsteptwo_b_the_new_system_stops_asking_the_older_tables.sql (lane SWITCH-STEP-TWO):
-- the 18 bodies and the two pick-list views exactly as they were, and the carried choice order taken off again
-- (only the positions this file wrote: metadata.option_position_carried = 'switch-step-two').
-- 🚨 Apply only after the older tables are back in workbench (the move inverses): these bodies read them.
-- lane: SWITCH-STEP-TWO

do $$ begin
  if to_regclass('workbench.udt_structured_list_items') is null then
    raise exception 'refused: the older tables are still in the graveyard. Move them back first (the step-two move inverses).';
  end if;
end $$;

CREATE OR REPLACE FUNCTION platform.table_lives_in(p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org  uuid;
  v_live boolean;
begin
  if p_table_id is null then
    return null;
  end if;
  select d.organization_id, d.deleted_at is null into v_org, v_live
    from workbench.udt_datasets d where d.id = p_table_id;
  if not found then
    return 'record';
  end if;
  if v_live and coalesce((platform._cutover_seam_last_done('older_tables', v_org)).direction, 'old') = 'old' then
    return 'older';
  end if;
  if exists (select 1 from custom.record t
              where t.organization_id = v_org and t.id = p_table_id
                and t.data_class = 'table' and t.deleted_at is null) then
    return 'record';
  end if;
  return 'older';
end;
$function$;

CREATE OR REPLACE FUNCTION platform.list_lives_in(p_list_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org   uuid;
  v_live  boolean;
  v_found boolean;
begin
  if p_list_id is null then
    return null;
  end if;
  select true, l.organization_id, l.deleted_at is null into v_found, v_org, v_live
    from workbench.udt_structured_lists l where l.id = p_list_id;
  if v_found is not true then
    return 'record';
  end if;
  if v_live then
    return 'older';
  end if;
  if platform._older_list_moved_by_switch(p_list_id)
     and exists (select 1 from custom.record t
                  where t.organization_id = v_org and t.id = p_list_id
                    and t.data_class = 'table' and t.deleted_at is null) then
    return 'record';
  end if;
  return 'older';
end;
$function$;

CREATE OR REPLACE FUNCTION platform._older_table_moved_by_switch(p_table_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce((
    select d.deleted_at is not null
       and d.metadata ? 'moved_to'
       and (platform._cutover_seam_last_done('older_tables', d.organization_id)).direction = 'new'
      from workbench.udt_datasets d
     where d.id = p_table_id), false);
$function$;

CREATE OR REPLACE FUNCTION platform._older_list_moved_by_switch(p_list_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce((
    select l.deleted_at is not null
       and l.metadata ? 'moved_to'
       and l.organization_id is not null
       and (platform._cutover_seam_last_done('older_tables', l.organization_id)).direction = 'new'
      from workbench.udt_structured_lists l
     where l.id = p_list_id), false);
$function$;

CREATE OR REPLACE FUNCTION custom._older_table_copy_refusal(p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_name text;
  v_org  uuid;
begin
  if p_table_id is null or platform.table_lives_in(p_table_id) is distinct from 'older' then
    return null;
  end if;
  select d.organization_id, coalesce(nullif(d.table_name, ''), 'this table')
    into v_org, v_name
    from workbench.udt_datasets d where d.id = p_table_id and d.deleted_at is null;
  if not found then
    return null;
  end if;
  -- A PERSON TESTS THE COPY (COPY-WRITABLE). Her own write is allowed; the fence notes it and
  -- the switch replaces it with the older table's rows.
  if platform.write_is_a_persons_own() then
    return null;
  end if;
  -- THE NAME ONLY TO WHO MAY OPEN THE COPY (SUITE-HEALTH-3). The same may-open ladder every
  -- door asks, about the copy by its id. A caller it refuses is still refused the write; the
  -- sentence just names nothing. A copy that is not in the record store is not named either.
  if exists (select 1 from custom.record r where r.id = p_table_id) then
    begin
      perform custom.assert_client_may_open(v_org, p_table_id, 'custom._older_table_copy_refusal', 'viewer', 'table');
    exception when insufficient_privilege or null_value_not_allowed then
      v_name := 'this table';
    end;
  else
    v_name := 'this table';
  end if;
  return format('This is the new system''s test copy of %s; the older table is still the one in use for agents, automations and integrations until an owner switches Data tables on the organization''s settings page. Write it at /data/%s.',
                v_name, p_table_id);
end;
$function$;

CREATE OR REPLACE FUNCTION custom._older_table_copy_verdict(p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if p_table_id is null or platform.table_lives_in(p_table_id) is distinct from 'older' then
    return null;
  end if;
  if not exists (select 1 from workbench.udt_datasets d where d.id = p_table_id and d.deleted_at is null) then
    return null;
  end if;
  if platform.write_is_a_persons_own() then
    return 'person';
  end if;
  return custom._older_table_copy_refusal(p_table_id);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.table_copy_evaluation_state(p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid     uuid := auth.uid();
  v_claims  jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_org     uuid;
  v_live    boolean;
  v_lives   text;
  v_copy    boolean;
  v_writes  bigint; v_rows bigint; v_edited bigint; v_added bigint; v_settings bigint;
begin
  if v_uid is null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
    raise exception 'Sign in to ask about a table.' using errcode = '42501';
  end if;
  if p_table_id is null then
    return jsonb_build_object('table_id', null, 'found', false);
  end if;
  -- The same answer for a table this person cannot open and a table that does not exist.
  if v_uid is not null and not custom.has_visibility(v_uid, 'record', p_table_id, 'viewer'::public.permission_level) then
    return jsonb_build_object('table_id', p_table_id, 'found', false);
  end if;
  select d.organization_id, d.deleted_at is null into v_org, v_live
    from workbench.udt_datasets d where d.id = p_table_id;
  v_lives := platform.table_lives_in(p_table_id);
  v_copy  := v_lives = 'older' and coalesce(v_live, false)
             and exists (select 1 from custom.record t where t.organization_id = v_org and t.id = p_table_id
                            and t.data_class = 'table' and t.deleted_at is null);
  select coalesce(sum(e.writes), 0), count(*),
         count(*) filter (where e.data_class = 'record' and not e.created),
         count(*) filter (where e.data_class = 'record' and e.created),
         count(*) filter (where e.data_class <> 'record')
    into v_writes, v_rows, v_edited, v_added, v_settings
    from platform.cutover_evaluation_write e
   where e.organization_id = v_org and e.table_id = p_table_id and e.replaced_at is null;
  return jsonb_build_object(
    'table_id', p_table_id,
    'found', true,
    'test_copy', v_copy,
    'writable_by_people', true,
    'older_table_live', coalesce(v_live, false),
    'agents_write', coalesce(v_lives, 'record'),
    'evaluation_writes_since_copy', v_writes,
    'rows_touched', v_rows,
    'rows_edited', v_edited,
    'rows_added', v_added,
    'settings_changed', v_settings,
    'says', case when v_copy
                 then 'Test copy: your edits here are replaced by the older table at switch time.'
                 else null end,
    'detail', case when v_copy
                   then 'Agents, automations and integrations still write the older table until an owner switches Data tables in the organization''s settings. '
                        || case when v_rows = 0 then 'Nothing has been changed here yet.'
                                else format('%s %s changed here so far (%s edited, %s added, %s settings); the switch puts them back to the older table and archives the added ones, in a log.',
                                            v_rows, case when v_rows = 1 then 'row' else 'rows' end, v_edited, v_added, v_settings) end
                   else null end);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.where_lists_live(p_list_ids uuid[])
 RETURNS TABLE(list_id uuid, lives_in text, address text, why text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_me     uuid  := auth.uid();
begin
  if v_me is null and v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
    raise exception 'Sign in to ask where a list lives.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_list_ids), 0) > 1000 then
    raise exception 'Ask about at most 1000 lists at once (% were asked).', cardinality(p_list_ids) using errcode = '22023';
  end if;
  return query
    select i.id,
           h.lives_in,
           '/lists/' || i.id::text,
           case h.lives_in
             when 'older' then 'It is an older pick list: the Lists pages, list pickers and the agents'' picklist tool read and write the older list.'
             else 'It lives in the new system (the record store) as a Table of choices, same id; the store''s own doors decide whether you may open it.'
           end
      from (select distinct u.id from unnest(coalesce(p_list_ids, '{}'::uuid[])) as u(id) where u.id is not null) i
      cross join lateral (select platform.list_lives_in(i.id) as lives_in) l
      -- WHO MAY BE TOLD `older` (the same rule custom.where_tables_live keeps): a person is told
      -- an older list's home only when she may open it; anyone else hears `record`, the word an
      -- id nobody minted answers, and the store's doors then say "not found" for it.
      cross join lateral (
        select case
                 when l.lives_in is distinct from 'older' or v_me is null then l.lives_in
                 when exists (select 1 from workbench.udt_structured_lists o
                               where o.id = i.id
                                 and (o.user_id = v_me or o.created_by = v_me or o.is_public or o.public_read)) then l.lives_in
                 when coalesce(iam.has_access('structured_list', i.id, 'viewer'::public.permission_level), false) then l.lives_in
                 when custom.has_visibility(v_me, 'record', i.id, 'viewer'::public.permission_level) then l.lives_in
                 else 'record'
               end as lives_in) h;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.where_tables_live(p_table_ids uuid[])
 RETURNS TABLE(table_id uuid, lives_in text, why text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_me     uuid  := auth.uid();
begin
  if v_me is null and v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
    raise exception 'Sign in to ask where a table lives.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_table_ids), 0) > 1000 then
    raise exception 'Ask about at most 1000 tables at once (% were asked).', cardinality(p_table_ids) using errcode = '22023';
  end if;
  return query
    select i.id,
           h.lives_in,
           case h.lives_in
             when 'older' then 'It is an older table, and the older table is the one agents, automations and integrations read and write until an owner switches Data tables on the organization''s settings page. Its copy in the new system (if it has one) is a test copy: people may edit it, and the switch replaces those edits with the older table''s rows.'
             else 'It lives in the new system (the record store); the store''s own doors decide whether you may open it.'
           end
      from (select distinct u.id from unnest(coalesce(p_table_ids, '{}'::uuid[])) as u(id) where u.id is not null) i
      cross join lateral (select platform.table_lives_in(i.id) as lives_in) l
      -- WHO MAY BE TOLD `older` (SUITE-HEALTH-3). A person is told an older table's home only
      -- when she may open it: the older store's own read rule for her, or the one ladder on its
      -- record-store copy. Anyone else hears `record` — the word an id nobody minted answers —
      -- and the store's doors then say "not found" for it exactly as for that id. No person
      -- (the service lane, the store owner) is answered as before.
      cross join lateral (
        select case
                 when l.lives_in is distinct from 'older' or v_me is null then l.lives_in
                 when workbench.dataset_readable_by(v_me, i.id) then l.lives_in
                 when custom.has_visibility(v_me, 'record', i.id, 'viewer'::public.permission_level) then l.lives_in
                 else 'record'
               end as lives_in) h;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.table_list_everywhere(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables jsonb;
  v_org    uuid;
  v_all    jsonb := '[]'::jsonb;
begin
  -- NO ORGANIZATION NAMED = the optional organization FILTER left off (org-filter sweep, 2026-09-29;
  -- access-belongs-to-the-person): the Tables the caller may open in EVERY organization she belongs
  -- to. Each organization is asked through this same door with its name, so it meets its own wall
  -- and its own ladder below; this only adds the answers together, each row already carrying its
  -- organization_id. An organization whose wall refuses (42501) contributes nothing. No permission
  -- is changed by this branch.
  if p_organization_id is null then
    if v_me is null then
      return jsonb_build_object('success', true, 'tables', '[]'::jsonb);
    end if;
    for v_org in
      select m.organization_id
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
    loop
      begin
        v_all := v_all || coalesce(custom.table_list_everywhere(v_org) -> 'tables', '[]'::jsonb);
      exception when insufficient_privilege then
        continue;
      end;
    end loop;
    select coalesce(jsonb_agg(x order by (x ->> 'last_activity_at') desc nulls last, (x ->> 'created_at') desc), '[]'::jsonb)
      into v_tables from jsonb_array_elements(v_all) x;
    return jsonb_build_object('success', true, 'tables', v_tables);
  end if;

  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_list_everywhere');

  with visible as (
    select v as id from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v
  ),
  store as (
    select jsonb_build_object(
             'id', t.id,
             'table_name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
             'description', t.data ->> 'description',
             'version', t.version,
             'user_id', t.created_by,
             'is_public', false,
             'visibility', t.visibility::text,
             'organization_id', t.organization_id,
             'created_at', t.created_at,
             'updated_at', t.updated_at,
             'last_activity_at', greatest(t.updated_at,
                                   (select max(r.updated_at) from custom.record r
                                     where r.organization_id = t.organization_id and r.table_id = t.id)),
             'row_count', (select count(*) from custom.record r
                            where r.organization_id = t.organization_id and r.table_id = t.id
                              and r.data_class = 'record' and r.deleted_at is null),
             'field_count', (select count(*) from custom.record f
                              where f.organization_id = t.organization_id and f.table_id = custom.field_kernel_id()
                                and f.data_class = 'field' and f.deleted_at is null
                                and f.data ->> 'entity_definition_id' = t.id::text),
             'store', 'records')
           -- SC-1 PLACEMENT: who keeps it, and whether the context picker offers it.
           || custom.table_placement(t.organization_id, t.id, t.data, false) as doc
      from custom.record t
      join visible v on v.id = t.id
     where t.organization_id = p_organization_id
       and t.table_id = custom.table_kernel_id()
       and t.data_class = 'table'
       and t.deleted_at is null
  ),
  older as (
    select jsonb_build_object(
             'id', ut.id, 'table_name', ut.table_name, 'description', ut.description,
             'version', ut.version, 'user_id', ut.user_id, 'is_public', ut.is_public,
             'row_ordering_config', ut.row_ordering_config, 'visibility', ut.visibility::text,
             'organization_id', ut.organization_id, 'created_at', ut.created_at,
             'updated_at', ut.updated_at,
             'last_activity_at', greatest(ut.updated_at, ut.created_at,
                                   (select max(r.updated_at) from workbench.udt_dataset_rows r where r.table_id = ut.id and r.deleted_at is null),
                                   (select max(f.updated_at) from workbench.udt_dataset_fields f where f.table_id = ut.id and f.deleted_at is null)),
             'row_count', (select count(*) from workbench.udt_dataset_rows where table_id = ut.id and deleted_at is null),
             'field_count', (select count(*) from workbench.udt_dataset_fields where table_id = ut.id and deleted_at is null),
             'store', 'older',
             -- An older table is always a person's own.
             'kept_by_the_app', false, 'kept_for', null, 'offered_as_context', false) as doc
      from workbench.udt_datasets ut
     where ut.user_id = v_me
       and ut.organization_id = p_organization_id
       and ut.deleted_at is null
  )
  select coalesce(jsonb_agg(x.doc order by (x.doc ->> 'last_activity_at') desc nulls last,
                                           (x.doc ->> 'created_at') desc), '[]'::jsonb)
    into v_tables
    from (select doc from store union all select doc from older) x;

  return jsonb_build_object('success', true, 'tables', v_tables);
end
$function$;

CREATE OR REPLACE FUNCTION custom.pick_list_index_everywhere()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := custom.query_principal();
  v_lists    jsonb := '[]'::jsonb;
  v_archived jsonb := '[]'::jsonb;
  v_one      jsonb;
  v_org      uuid;
begin
  if v_me is null then
    return jsonb_build_object('lists', '[]'::jsonb, 'archived_ids', '[]'::jsonb);
  end if;
  for v_org in
    select o.id
      from iam.organization_member m
      join iam.organizations o on o.id = m.organization_id and o.archived_at is null
     where m.user_id = v_me
  loop
    -- THE WALL, as custom.assert_client_may_reach admits a signed-in person; a store that is off
    -- has nothing to list.
    continue when not iam.has_org_access(v_org);
    continue when not custom.store_is_open(v_org);
    v_one := custom._pick_list_index_of(v_org, v_me);
    v_lists := v_lists || (v_one -> 'lists');
    v_archived := v_archived || (v_one -> 'archived_ids');
  end loop;
  -- The caller's own older lists that belong to no organization (they move at the final switch).
  v_lists := v_lists || coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id,
             'list_name', coalesce(nullif(btrim(l.list_name), ''), 'Untitled list'),
             'description', nullif(btrim(l.description), ''),
             'item_count', (select count(*) from workbench.udt_structured_list_items i
                             where i.list_id = l.id and i.deleted_at is null),
             'updated_at', l.updated_at,
             'created_by', l.user_id,
             'organization_id', null,
             'organization_name', null,
             'lives_in', 'older'))
      from workbench.udt_structured_lists l
     where l.organization_id is null and l.user_id = v_me and l.deleted_at is null), '[]'::jsonb);
  return jsonb_build_object('lists', v_lists, 'archived_ids', v_archived);
end;
$function$;

CREATE OR REPLACE FUNCTION custom._pick_list_index_of(p_organization_id uuid, p_me uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- NOT a door, and SECURITY INVOKER: it runs with the rights of the door that calls it, which has
  -- already decided the caller. One organization's lists, both stores.
  with vis as (
    select v as id from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v
  ),
  org as (select o.id, o.name::text as name from iam.organizations o where o.id = p_organization_id),
  store as (
    select jsonb_build_object(
             'id', t.id,
             'list_name', coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled list'),
             'description', nullif(btrim(t.data ->> 'description'), ''),
             'item_count', (select count(*) from custom.record c
                             where c.organization_id = p_organization_id and c.table_id = t.id
                               and c.data_class = 'record' and c.deleted_at is null),
             'updated_at', t.updated_at,
             'created_by', t.created_by,
             'organization_id', p_organization_id,
             'organization_name', (select name from org),
             'lives_in', 'record') as doc
      from custom.record t
      join vis on vis.id = t.id
     where t.organization_id = p_organization_id
       and t.table_id = custom.table_kernel_id()
       and t.data_class = 'table'
       and t.deleted_at is null
       and platform._is_store_pick_list(t.metadata)
       and platform.list_lives_in(t.id) = 'record'
  ),
  older as (
    select jsonb_build_object(
             'id', l.id,
             'list_name', coalesce(nullif(btrim(l.list_name), ''), 'Untitled list'),
             'description', nullif(btrim(l.description), ''),
             'item_count', (select count(*) from workbench.udt_structured_list_items i
                             where i.list_id = l.id and i.deleted_at is null),
             'updated_at', l.updated_at,
             'created_by', l.user_id,
             'organization_id', p_organization_id,
             'organization_name', (select name from org),
             'lives_in', 'older') as doc
      from workbench.udt_structured_lists l
     where l.organization_id = p_organization_id
       and l.user_id = p_me
       and l.deleted_at is null
  )
  select jsonb_build_object(
           'lists', coalesce((select jsonb_agg(doc order by lower(doc ->> 'list_name'), doc ->> 'id')
                                from (select doc from store union all select doc from older) x), '[]'::jsonb),
           'archived_ids', coalesce((select jsonb_agg(t.id order by t.deleted_at desc)
                                       from custom.record t
                                      where t.organization_id = p_organization_id
                                        and t.table_id = custom.table_kernel_id()
                                        and t.data_class = 'table'
                                        and t.deleted_at is not null
                                        and platform._is_store_pick_list(t.metadata)), '[]'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION platform._store_pick_list_document(p_list_id uuid, p_viewer uuid, p_shape text DEFAULT 'detail'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_t      custom.record;
  v_editor boolean;
begin
  select t.* into v_t
    from custom.record t
   where t.id = p_list_id and t.data_class = 'table' and t.deleted_at is null
   limit 1;
  if v_t.id is null then
    return null;
  end if;
  if p_viewer is not null
     and not coalesce(custom.has_visibility(p_viewer, 'record', p_list_id, 'viewer'::public.permission_level), false) then
    return null;
  end if;
  v_editor := p_viewer is null
              or coalesce(custom.has_visibility(p_viewer, 'record', p_list_id, 'editor'::public.permission_level), false);

  return jsonb_build_object(
    'list_id', v_t.id,
    'list_name', coalesce(nullif(v_t.data ->> 'name', ''), 'List'),
    'description', v_t.data ->> 'description',
    'created_at', v_t.created_at,
    'updated_at', v_t.updated_at,
    'is_public', false,
    'public_read', false,
    'organization_id', v_t.organization_id,
    'lives_in', 'record',
    'address', '/lists/' || v_t.id::text,
    'table_address', '/data/' || v_t.id::text,
    'moved_to', case when platform._older_list_moved_by_switch(v_t.id) then workbench.older_table_moved_to(v_t.id) end,
    'items_grouped', (
      select jsonb_object_agg(g.group_name, g.items)
        from (
          select coalesce(nullif(c.data ->> 'group_name', ''), 'Ungrouped') as group_name,
                 jsonb_agg(
                   case when p_shape = 'selection' then
                     jsonb_build_object('id', c.id, 'label', c.data ->> 'name', 'help_text', c.data ->> 'help_text',
                                        'group_name', c.data ->> 'group_name', 'icon_name', c.data ->> 'icon')
                   else
                     jsonb_build_object('id', c.id, 'label', c.data ->> 'name',
                                        'description', case when v_editor then c.data ->> 'description' end,
                                        'help_text', c.data ->> 'help_text')
                   end
                   order by coalesce(o.created_at, c.created_at), c.id) as items
            from custom.record c
            left join workbench.udt_structured_list_items o on o.id = c.id
           where c.organization_id = v_t.organization_id
             and c.table_id = v_t.id
             and c.data_class = 'record'
             and c.deleted_at is null
             and (p_viewer is null
                  or coalesce(custom.has_visibility(p_viewer, 'record', c.id, 'viewer'::public.permission_level), false))
           group by 1
        ) g)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION platform.custom_field_defs(p_target_kind text, p_organization_id uuid, p_target_token text DEFAULT NULL::text, p_definition_id uuid DEFAULT NULL::uuid, p_include_archived boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(jsonb_agg(x ORDER BY ord, key), '[]'::jsonb)
    FROM (
      SELECT d.field_order AS ord, d.field_key AS key,
             jsonb_build_object(
               'field_key',              d.field_key,
               'field_type',             d.field_type,
               'display_name',           d.display_name,
               'field_order',            d.field_order,
               'is_required',            d.is_required,
               'is_multi',               d.is_multi,
               'default_value',          d.default_value,
               'validation_rules',       d.validation_rules,
               'display_config',         d.display_config,
               'reference_target_token', d.reference_target_token,
               'reference_target_definition_id', d.reference_target_definition_id,
               'sensitivity_tier',       d.sensitivity_tier,
               'ai_exposure',            d.ai_exposure,
               'is_indexed',             d.is_indexed,
               'index_state',            d.index_state,
               'archived',               (d.archived_at IS NOT NULL),
               'options',
                 CASE
                   WHEN d.options IS NOT NULL THEN d.options
                   WHEN d.option_list_id IS NOT NULL THEN (
                     SELECT COALESCE(jsonb_agg(to_jsonb(i.label::text) ORDER BY i.group_name NULLS FIRST, i.label), '[]'::jsonb)
                       FROM workbench.udt_structured_list_items i
                      WHERE i.list_id = d.option_list_id
                        AND i.deleted_at IS NULL
                        AND i.organization_id = p_organization_id )
                 END
             ) AS x
        FROM platform.custom_field_definition d
       WHERE d.organization_id = p_organization_id
         AND d.deleted_at IS NULL
         AND d.target_kind = p_target_kind
         AND (p_target_kind <> 'entity_table'  OR d.target_token = p_target_token)
         AND (p_target_kind <> 'custom_entity' OR d.target_definition_id = p_definition_id)
         AND (p_include_archived OR d.archived_at IS NULL)
    ) s
$function$;

CREATE OR REPLACE FUNCTION platform._custom_field_definition_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_target   record;
  v_defn     record;
  v_schema   text;
  v_table    text;
  v_used     boolean;
  v_count    integer;
  v_cap      integer;
  v_opt_cap  integer;
  v_label_cap integer;
  v_list_org uuid;
  v_rank     jsonb := '{"standard":0,"confidential":1,"restricted":2}'::jsonb;
  v_ai_rank  jsonb := '{"allowed":0,"aggregate_only":1,"never":2}'::jsonb;
BEGIN
  IF NEW.target_kind = 'entity_table' THEN
    SELECT * INTO v_target FROM platform.custom_field_target
     WHERE target_token = NEW.target_token AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'custom_field_definition: token % is not a registered custom-field target', NEW.target_token
        USING ERRCODE = 'check_violation',
              HINT = 'Participation is a row in platform.custom_field_target, never a hardcoded list. A platform admin adds it with platform.adopt_custom_fields(token, ...).';
    END IF;
    IF NOT v_target.is_enabled THEN
      RAISE EXCEPTION 'custom_field_definition: custom fields are disabled for target %', NEW.target_token
        USING ERRCODE = 'check_violation',
              HINT = 'Set platform.custom_field_target.is_enabled = true for this token; a platform admin owns that row.';
    END IF;

    IF (v_rank -> NEW.sensitivity_tier)::int > (v_rank -> v_target.sensitivity_ceiling)::int THEN
      RAISE EXCEPTION 'custom_field_definition: sensitivity_tier % exceeds the % ceiling on target %',
        NEW.sensitivity_tier, v_target.sensitivity_ceiling, NEW.target_token
        USING ERRCODE = 'check_violation',
              HINT = 'A custom field is never a side door around a sensitivity tier (SPEC-EXTENSIBILITY 2.1). Raise the target ceiling deliberately, or lower the field.';
    END IF;
    IF (v_ai_rank -> NEW.ai_exposure)::int < (v_ai_rank -> v_target.ai_exposure_ceiling)::int THEN
      RAISE EXCEPTION 'custom_field_definition: ai_exposure % is looser than the % ceiling on target %',
        NEW.ai_exposure, v_target.ai_exposure_ceiling, NEW.target_token
        USING ERRCODE = 'check_violation',
              HINT = 'AR B2.20: the target''s AI sensitivity ceiling reaches custom fields. Equal or stricter, never looser.';
    END IF;
  ELSE
    SELECT * INTO v_defn FROM platform.custom_entity_definition
     WHERE id = NEW.target_definition_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      raise exception 'custom_field_definition: custom object does not exist' using ERRCODE = 'foreign_key_violation',
            detail = jsonb_build_object('target_definition_id', NEW.target_definition_id)::text;
    END IF;
    IF v_defn.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'custom_field_definition: a field may not be defined on another organization''s custom object'
        USING ERRCODE = 'check_violation',
              HINT = 'Tenant isolation is inherited, never re-implemented: the field row and the definition row carry the same organization_id.';
    END IF;
    IF (v_rank -> NEW.sensitivity_tier)::int > (v_rank -> v_defn.sensitivity_tier)::int THEN
      RAISE EXCEPTION 'custom_field_definition: sensitivity_tier % exceeds the custom object''s % tier',
        NEW.sensitivity_tier, v_defn.sensitivity_tier
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.reference_target_token IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = NEW.reference_target_token AND is_active) THEN
    RAISE EXCEPTION 'custom_field_definition: reference_target_token % is not an active entity token', NEW.reference_target_token
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reference_target_definition_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM platform.custom_entity_definition
                      WHERE id = NEW.reference_target_definition_id
                        AND organization_id = NEW.organization_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'custom_field_definition: reference_target_definition_id must name a live custom object in the same organization'
      USING ERRCODE = 'check_violation';
  END IF;

  -- RD-3's honest defect, defended: workbench.udt_structured_lists.organization_id is
  -- NULLABLE live (legacy). A NULL-org or foreign-org list is refused here rather than
  -- becoming a cross-org read at render time.
  IF NEW.option_list_id IS NOT NULL THEN
    SELECT organization_id INTO v_list_org FROM workbench.udt_structured_lists WHERE id = NEW.option_list_id;
    IF v_list_org IS NULL OR v_list_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'custom_field_definition: option_list_id must name a structured list owned by this organization'
        USING ERRCODE = 'check_violation',
              HINT = 'RD-3 ratchet item: workbench.udt_structured_lists.organization_id is nullable live, which conflicts with NO NULL ORG. The pointer path defends against it instead of trusting it.';
    END IF;
  END IF;

  IF NEW.options IS NOT NULL THEN
    v_opt_cap   := platform.extensibility_knob_int('custom_fields.max_options_per_select', NEW.organization_id);
    v_label_cap := platform.extensibility_knob_int('custom_fields.max_option_label_chars', NEW.organization_id);
    IF jsonb_array_length(NEW.options) > v_opt_cap THEN
      RAISE EXCEPTION 'custom_field_definition: % options exceeds the limit of % (extensibility.custom_fields.max_options_per_select)',
        jsonb_array_length(NEW.options), v_opt_cap
        USING ERRCODE = 'check_violation',
              HINT = 'The limit is a knob, not a constant. An organization admin can raise it through the extensibility settings; a platform admin can raise the platform default.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(NEW.options) e
       WHERE char_length(COALESCE(CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' ELSE e ->> 'label' END,
                                  CASE WHEN jsonb_typeof(e) = 'object' THEN e ->> 'value' ELSE '' END, '')) > v_label_cap
    ) THEN
      RAISE EXCEPTION 'custom_field_definition: an option label exceeds % characters (extensibility.custom_fields.max_option_label_chars)', v_label_cap
        USING ERRCODE = 'check_violation',
              HINT = 'An option label is a label, not a document. The limit is a knob.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.target_kind = 'entity_table' THEN
      v_cap := platform.extensibility_knob_int('custom_fields.max_fields_per_target', NEW.organization_id, NEW.target_token);
      SELECT count(*) INTO v_count FROM platform.custom_field_definition
       WHERE organization_id = NEW.organization_id AND target_kind = 'entity_table'
         AND target_token = NEW.target_token AND deleted_at IS NULL AND archived_at IS NULL;
    ELSE
      v_cap := platform.extensibility_knob_int('custom_entities.max_fields_per_definition', NEW.organization_id, NULL, NEW.target_definition_id);
      SELECT count(*) INTO v_count FROM platform.custom_field_definition
       WHERE organization_id = NEW.organization_id AND target_kind = 'custom_entity'
         AND target_definition_id = NEW.target_definition_id AND deleted_at IS NULL AND archived_at IS NULL;
    END IF;
    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'custom_field_definition: this target already holds % of a maximum % custom fields', v_count, v_cap
        USING ERRCODE = 'check_violation',
              HINT = 'Limit: ' || CASE WHEN NEW.target_kind = 'entity_table'
                                       THEN 'extensibility.custom_fields.max_fields_per_target'
                                       ELSE 'extensibility.custom_entities.max_fields_per_definition' END ||
                     '. An organization admin raises it in the extensibility settings; archiving a field frees a slot.';
    END IF;
  END IF;

  -- THE THREE IMMUTABLE COLUMNS (2.2) -- once any value has been written.
  -- Changing any of them silently re-interprets every stored value.
  IF TG_OP = 'UPDATE' AND (
       NEW.field_key IS DISTINCT FROM OLD.field_key
    OR NEW.field_type IS DISTINCT FROM OLD.field_type
    OR NEW.reference_target_token IS DISTINCT FROM OLD.reference_target_token) THEN

    v_used := false;
    IF OLD.target_kind = 'entity_table' THEN
      SELECT et.schema_name, et.table_name INTO v_schema, v_table
        FROM platform.entity_types et WHERE et.token = OLD.target_token;
      IF v_schema IS NOT NULL THEN
        -- Scoped by organization_id (indexed) so the containment test never walks another
        -- tenant's rows. jsonb_path_ops does not serve `?`, which is why this is
        -- deliberately an org-scoped scan on a rare admin action and not a hot path.
        EXECUTE format(
          'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE organization_id = $1 AND custom ? $2 LIMIT 1)',
          v_schema, v_table) INTO v_used USING OLD.organization_id, OLD.field_key;
      END IF;
    ELSE
      SELECT EXISTS (SELECT 1 FROM platform.custom_record
                      WHERE entity_definition_id = OLD.target_definition_id
                        AND data ? OLD.field_key LIMIT 1) INTO v_used;
    END IF;

    IF v_used THEN
      RAISE EXCEPTION 'custom_field_definition: field_key / field_type / reference_target_token are immutable once values exist for %', OLD.field_key
        USING ERRCODE = 'check_violation',
              HINT = 'Changing any of them silently re-interprets every stored value. The supported path is: archive this definition, create a new one, migrate deliberately (SPEC-EXTENSIBILITY 2.2).';
    END IF;
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION platform.data_tables_born_in_the_new_system_for_me()
 RETURNS TABLE(organization_id uuid, organization_name text, table_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  -- SWITCH-BACK-CARRIES: a table made in the new system while its organization was switched lives
  -- only there (no older table has its id). After Switch back the home would lose it — it lists
  -- switched organizations' tables where they live and everyone else's from the older store — so it
  -- asks here and lists these too, where they live. Only organizations I am a member of, that are
  -- on the old side now, and only tables made after that organization's first switch.
  select o.id, o.name::text, t.id
    from iam.organization_member m
    join iam.organizations o on o.id = m.organization_id and o.archived_at is null
    cross join lateral platform._cutover_seam_last_done('older_tables', o.id) p
    join lateral (select min(x.pressed_at) as first_at from platform.cutover_seam_press x
                   where x.seam_key = 'older_tables' and x.organization_id = o.id
                     and x.outcome = 'done' and x.direction = 'new') f on f.first_at is not null
    join custom.record t on t.organization_id = o.id and t.data_class = 'table' and t.deleted_at is null
                        and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
                        and t.created_at > f.first_at
                        and not exists (select 1 from workbench.udt_datasets d where d.id = t.id)
   where m.user_id = (select auth.uid())
     and p.direction = 'old'
   order by o.name, t.id;
$function$;

CREATE OR REPLACE FUNCTION platform.resolve_id(p_id uuid, p_side text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_side      text := lower(nullif(btrim(coalesce(p_side, '')), ''));
  v_store     jsonb;
  v_has_new   boolean;
  v_has_old   boolean;
  v_old_org   uuid;
  v_old_live  boolean;
  v_pick      text;
  v_kind      text;
  v_org       uuid;
  v_path      text;
  v_live      boolean := true;
  v_type      uuid;
  v_sides     jsonb;
  c_not_yours constant text :=
    'This link does not open anything for the account you are signed in with. It may belong to '
    'somebody else, or it may have been mistyped. Check which account you are signed in as, or '
    'ask whoever sent it to share it with you.';
begin
  if p_id is null then
    raise exception 'platform.resolve_id: which id?' using errcode = '22004';
  end if;
  if v_side is not null and v_side not in ('new', 'old') then
    raise exception 'A table has an older side and a new side, and "%" is neither.', p_side
      using errcode = '22023',
            hint = 'Ask for side=new or side=old, or leave it out to open the one the id lives on.';
  end if;
  if (select auth.uid()) is null then
    return jsonb_build_object('state', 'not_yours', 'says', c_not_yours);
  end if;

  -- The record store answers for its own objects, walled by its own doors.
  v_store := custom.where_id_opens(p_id);

  -- The older store answers through its own row security: this function is SECURITY INVOKER,
  -- so the SELECT below sees exactly the datasets /data/<id> itself would read.
  select d.organization_id, d.deleted_at is null
    into v_old_org, v_old_live
    from workbench.udt_datasets d
   where d.id = p_id;
  v_has_old := found;
  v_has_new := v_store is not null and v_store ->> 'kind' = 'table';

  if v_has_old or v_has_new then
    v_sides := jsonb_build_object('old', v_has_old, 'new', v_has_new);
    if (v_side = 'new' and not v_has_new) or (v_side = 'old' and not v_has_old) then
      return jsonb_build_object(
        'state', 'no_such_side', 'kind', 'table',
        'organization_id', case when v_has_new then (v_store ->> 'organization_id')::uuid else v_old_org end,
        'sides', v_sides,
        'says', case v_side
                  when 'new' then 'This table has no new side yet: it is still only in the older tables. Open it without side= to see it there.'
                  else 'This table has no older side: it was made in the new tables. Open it without side= to see it.'
                end);
    end if;
    v_pick := coalesce(v_side,
                case
                  when v_has_new and v_has_old then
                    case when coalesce((v_store ->> 'live')::boolean, true) and not v_old_live
                         then 'new' else 'old' end
                  when v_has_new then 'new'
                  else 'old'
                end);
    if v_pick = 'new' then
      v_kind := 'table';
      v_org  := (v_store ->> 'organization_id')::uuid;
      v_path := v_store ->> 'path';
      v_live := coalesce((v_store ->> 'live')::boolean, true);
    else
      v_kind := 'older_table';
      v_org  := v_old_org;
      v_path := '/data/' || p_id::text;
      v_live := v_old_live;
    end if;
    -- Asked for by name, a side opens even archived: comparing is the point of asking.
    if v_side is not null then
      v_live := true;
    end if;

  elsif v_side is not null then
    return jsonb_build_object('state', 'not_yours', 'says', c_not_yours);

  elsif v_store is not null then
    v_kind := v_store ->> 'kind';
    v_org  := (v_store ->> 'organization_id')::uuid;
    v_path := v_store ->> 'path';
    v_live := coalesce((v_store ->> 'live')::boolean, true);

  else
    -- Everything else, asked as the person through each table's own row security.
    select 'document', d.organization_id, '/documents/' || d.id::text, d.deleted_at is null
      into v_kind, v_org, v_path, v_live
      from workbench.udt_documents d where d.id = p_id;
    if v_kind is null then
      select 'conversation', c.organization_id, '/chat/' || c.id::text, c.deleted_at is null
        into v_kind, v_org, v_path, v_live
        from chat.conversation c where c.id = p_id;
    end if;
    -- SCOPES-READS-REST (2026-09-29): a scope (a Record), a scope type (a Table) and a context item
    -- (a Field) are the record store's own objects and are answered by custom.where_id_opens above;
    -- the older context tables are no longer asked.
  end if;

  if v_kind is null then
    return jsonb_build_object('state', 'not_yours', 'says', c_not_yours);
  end if;

  if v_path is null then
    return jsonb_build_object(
      'state', 'no_screen', 'kind', v_kind, 'organization_id', v_org,
      'says', 'This is part of how a table is built — a column, a rule or a person row — and it has no screen of its own. Open the table it belongs to.');
  end if;

  if not v_live then
    return jsonb_build_object(
      'state', 'in_trash', 'kind', v_kind, 'organization_id', v_org,
      'says', 'This was archived. Nothing was deleted: it can be brought back from where it lived.');
  end if;

  -- THE OBJECT'S ORGANIZATION, NAMED ON THE ADDRESS, through the platform's one rule for it
  -- (platform.link_carries_its_organization, `?org=`) — never the caller's selection.
  if v_org is not null then
    v_path := platform.link_carries_its_organization(v_path, v_org);
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'state', 'opens', 'kind', v_kind, 'organization_id', v_org, 'path', v_path,
    'sides', v_sides));
end;
$function$;

CREATE OR REPLACE FUNCTION public._trash_kind_rows(p_uid uuid, p_org uuid, p_member uuid, p_kinds text[], p_limit integer, p_offset integer)
 RETURNS TABLE(artifact_kind text, entity_token text, label text, id uuid, title text, deleted_at timestamp with time zone, organization_id uuid, is_mine boolean, owner_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. The person (personal mode) or the organization (organization mode, gated by the
-- caller) is the filter; there is no per-row access check and no organization-wide walk here.
-- lane TRASH-TABLES: the record store's Tables and Records, after the registry kinds.
-- lane TRASH-COVERAGE-2: a row whose parent is archived (platform.archived_parent_of) is titled
-- "<title> (in <parent>)" — it is listed, never hidden, and its restore brings the parent back first.
-- A scope type's Field (context_item) carries no organization_id; in organization mode its
-- organization is its scope type's.
-- lane TRASH-COVERAGE-2 (second file): the "(in <parent>)" suffix is computed AFTER the page is cut —
-- an outer select over the limited rows — so it costs one parent lookup per LISTED row, never one per
-- candidate row (org_trash_list file for AI Matrx measured 890.7 ms with it inside the sort; ceiling 300).
-- lane TRASH-COVERAGE-2 (third file): Organization Trash reads a table that carries visibility as TWO
-- bounded index walks — the organization's shared rows, and the caller's own personal rows — instead
-- of one walk that filters out every member's personal row (AI Matrx: 75,540 archived personal files,
-- 3 shared; the one walk read all of them to find three).
-- lane STORE-RESTORE-DOORS: five more record-store kinds — a Field, a Rule, a link between Records, a
-- document template and a dashboard, each removed on its own — read through public._trash_store_children
-- (one predicate with the counts) and titled by public._trash_store_title; restored through their own
-- store door (public._trash_store_restore).
-- lane SCOPES-READS-REST (2026-09-29): the registry's three context kinds (scope_type, scope,
-- context_item) are read from the record store through public._trash_context_rows, never from context.*.
declare
  rec record;
  v_rel regclass;
  v_title text;
  v_org text;
  v_cols text;
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_window int;
  v_title_expr text;
  v_parented boolean;
  v_q text;
  v_wrap text;
  v_kind text[];
begin
  if p_uid is null then return; end if;
  v_window := v_limit + v_offset;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.title_column, e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null
       and e.is_active
       and (p_kinds is null or e.user_artifact_kind = any(p_kinds))
     order by e.user_artifact_kind
  loop
    begin
      if rec.sch = 'context' and rec.token in ('scope_type', 'scope', 'context_item') then
        return query
        select rec.kind::text, rec.token::text, rec.label::text, x.id, x.title,
               x.deleted_at, x.organization_id, (x.owner_id = p_uid), x.owner_id
          from public._trash_context_rows(rec.token, p_uid, p_org, p_member) x
         order by x.deleted_at desc, x.id
         limit v_limit offset v_offset;
        continue;
      end if;

      v_rel := to_regclass(format('%I.%I', rec.sch, rec.tbl));
      if v_rel is null then continue; end if;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        -- Vault credentials: the owner's own, only. Organization mode never lists them.
        if p_org is not null then continue; end if;
        return query execute format(
          'select %L::text, %L::text, %L::text, t.id, t.display_name::text,
                  t.deleted_at, t.organization_id, true, t.user_id
             from users.credential_items t
            where t.user_id = $1 and t.deleted_at is not null
            order by t.deleted_at desc, t.id
            limit %s offset %s',
          rec.kind, rec.token, rec.label, v_limit, v_offset)
          using p_uid;
        continue;
      end if;

      v_title := null;
      -- A scope type's own name is its plural label ("Service areas"); its title_column is the slug.
      select a.attname into v_title
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = any (array['label_plural', coalesce(rec.title_column, '')])
       order by (a.attname <> 'label_plural')
       limit 1;
      if v_title is null then
        select a.attname into v_title
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname = any (array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'])
         order by array_position(array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'], a.attname::text)
         limit 1;
      end if;
      v_org := null;
      select a.attname into v_org
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = 'organization_id'
       limit 1;

      v_title_expr := case when v_title is null then 'null::text' else format('left(t.%I::text, 200)', v_title) end;
      -- The comment kind's title rule (a suggestion shows its replacement, a comment its body, else the quote).
      if rec.token = 'comment' then v_title_expr := 'left(platform.comment_trash_title(t), 200)'; end if;
      -- A Data table row has no title column: its own words, then the table it sits in.
      if rec.token = 'udt_dataset_rows' then
        v_title_expr := 'left(coalesce(nullif(btrim(coalesce(t.data ->> ''name'', t.data ->> ''title'', custom._first_words(t.data))), ''''), ''Untitled row'')'
          || ' || '' (in '' || coalesce((select nullif(btrim(d.table_name), '''') from workbench.udt_datasets d where d.id = t.table_id), ''a table'') || '')'', 200)';
      end if;
      v_parented := rec.token in ('folder', 'file', 'hr_employment', 'workflow_trigger', 'processed_document')
        or exists (select 1 from platform.soft_delete_edge s
                    where s.child_schema = rec.sch and s.child_table = rec.tbl and s.action = 'cascade');
      v_wrap := null;
      if v_parented then
        v_wrap := format(
          'select y.a, y.b, y.c, y.id, '
          || 'coalesce((select coalesce(nullif(btrim(y.t), ''''), ''Untitled'') || '' (in '' || '
          || 'coalesce(nullif(btrim(ap.parent_title), ''''), ''an archived item'') || '')'' '
          || 'from platform.archived_parent_of(%L, y.id) ap limit 1), y.t), '
          || 'y.d, y.o, y.m, y.w from (%%s) y(a, b, c, id, t, d, o, m, w) order by y.d desc, y.id',
          rec.token);
      end if;

      if p_org is not null and v_org is null then continue; end if;

      v_cols := format('%L::text, %L::text, %L::text, t.id, %s, t.deleted_at, %s, (t.%I = $1), t.%I',
        rec.kind, rec.token, rec.label,
        v_title_expr,
        case when v_org is null then 'null::uuid' else format('t.%I', v_org) end,
        rec.owner_col, rec.owner_col);

      if p_org is null then
        -- PERSONAL: what I own, plus what was named to me. Each branch is its own indexed read.
        v_q := format(
          'select * from (
             (select %1$s from %2$I.%3$I t
               where t.%4$I = $1 and t.deleted_at is not null
               order by t.deleted_at desc, t.id limit %5$s)
             union all
             (select %1$s from %2$I.%3$I t
               where t.deleted_at is not null
                 and t.%4$I is distinct from $1
                 and t.id in (select g.resource_id from iam.permissions g
                               where g.granted_to_user_id = $1
                                 and g.resource_type = %6$L
                                 and coalesce(g.status, ''active'') <> ''rejected''
                                 and (g.expires_at is null or g.expires_at > now()))
               order by t.deleted_at desc, t.id limit %5$s)
           ) x
           order by x.deleted_at desc, x.id
           limit %7$s offset %8$s',
          v_cols, rec.sch, rec.tbl, rec.owner_col, v_window, rec.token, v_limit, v_offset);
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid;
      else
        -- ORGANIZATION: this organization's archived rows, optionally one member's. The caller gated it.
        -- A PERSONAL row (visibility = personal) belongs to its owner alone — a member's private
        -- highlight or note never shows in the organization's Trash (verify RC-B11 round 3; access
        -- is personal, Arman 2026-09-23). Its owner still sees it in their own Trash.
        if iam.table_has_visibility(rec.sch, rec.tbl) then
          v_q := format(
            'select * from (
               (select %1$s from %2$I.%3$I t
                 where t.%4$I = $2 and t.deleted_at is not null
                   and ($3::uuid is null or t.%5$I = $3)
                   and t.visibility is distinct from ''personal''
                 order by t.deleted_at desc, t.id limit %8$s)
               union all
               (select %1$s from %2$I.%3$I t
                 where t.%5$I = $1 and t.deleted_at is not null
                   and t.%4$I = $2
                   and ($3::uuid is null or t.%5$I = $3)
                   and t.visibility = ''personal''
                 order by t.deleted_at desc, t.id limit %8$s)
             ) x
             order by x.deleted_at desc, x.id
             limit %6$s offset %7$s',
            v_cols, rec.sch, rec.tbl, v_org, rec.owner_col, v_limit, v_offset, v_window);
        else
          v_q := format(
            'select %1$s from %2$I.%3$I t
              where t.%4$I = $2 and t.deleted_at is not null
                and ($3::uuid is null or t.%5$I = $3)
              order by t.deleted_at desc, t.id
              limit %6$s offset %7$s',
            v_cols, rec.sch, rec.tbl, v_org, rec.owner_col, v_limit, v_offset);
        end if;
        if v_wrap is not null then v_q := format(v_wrap, v_q); end if;
        return query execute v_q using p_uid, p_org, p_member;
      end if;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;

  -- ── THE RECORD STORE (lane TRASH-TABLES) ────────────────────────────────────────────────────
  -- One physical table (custom.record) holds every Table and Record, so the registry loop above
  -- cannot describe them. Same two modes, same person/organization filter, restored by
  -- custom.record_restore through entity_undelete / org_trash_restore (token `record`).
  -- ── PASSAGE LINKS (annotation trash) ─────────────────────────────────────────────────────────
  -- Only anchored_to associations the person made, removed on their own; personal Trash only (see
  -- the file header). The rest of platform.associations never reaches /trash.
  if p_kinds is null or 'passage_link' = any (p_kinds) then
    return query
    select 'passage_link'::text, 'passage_link'::text, 'Passage link'::text, a.id,
           left(platform.passage_link_trash_title(a), 200),
           a.deleted_at, a.organization_id, (a.created_by = p_uid), a.created_by
      from platform.associations a
     where a.role = 'anchored_to' and a.deleted_at is not null and a.deleted_via_type is null
       and p_org is null and a.created_by = p_uid
     order by a.deleted_at desc, a.id
     limit v_limit offset v_offset;
  end if;

  if to_regclass('custom.record') is null then return; end if;

  if p_kinds is null or 'table' = any (p_kinds) then
    if p_org is null then
      return query
      select 'table'::text, 'record'::text, 'Table'::text, x.id,
             coalesce(nullif(btrim(x.data ->> 'name'), ''), 'Untitled table'),
             x.deleted_at, x.organization_id, (x.created_by = p_uid), x.created_by
        from (
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.created_by = p_uid and t.data_class = 'table' and t.deleted_at is not null
            order by t.deleted_at desc, t.id limit v_window)
          union all
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.data_class = 'table' and t.deleted_at is not null
              and t.created_by is distinct from p_uid
              and t.id in (select g.resource_id from iam.permissions g
                            where g.granted_to_user_id = p_uid
                              and g.resource_type = 'record'
                              and coalesce(g.status, 'active') <> 'rejected'
                              and (g.expires_at is null or g.expires_at > now()))
            order by t.deleted_at desc, t.id limit v_window)
        ) x
       order by x.deleted_at desc, x.id
       limit v_limit offset v_offset;
    else
      return query
      select 'table'::text, 'record'::text, 'Table'::text, t.id,
             coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
             t.deleted_at, t.organization_id, (t.created_by = p_uid), t.created_by
        from custom.record t
       where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is not null
         and (p_member is null or t.created_by = p_member)
       order by t.deleted_at desc, t.id
       limit v_limit offset v_offset;
    end if;
  end if;

  if p_kinds is null or 'record' = any (p_kinds) then
    -- A Record archived on its own, while its Table is live. One inside an archived Table comes
    -- back with the Table, so it is not a second Trash row.
    return query
    select 'record'::text, 'record'::text, 'Record'::text, y.id,
           format('%s (in %s)',
                  coalesce(nullif(btrim(custom.record_words(y.organization_id, y.id)), ''), 'Untitled record'),
                  coalesce(nullif(btrim(y.table_name), ''), 'a table')),
           y.deleted_at, y.organization_id, (y.created_by = p_uid), y.created_by
      from (
        select x.id, x.deleted_at, x.organization_id, x.created_by, x.table_name
          from (
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name' as table_name
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.created_by = p_uid and r.data_class = 'record' and r.deleted_at is not null
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.data_class = 'record' and r.deleted_at is not null
                and r.created_by is distinct from p_uid
                and r.id in (select g.resource_id from iam.permissions g
                              where g.granted_to_user_id = p_uid
                                and g.resource_type = 'record'
                                and coalesce(g.status, 'active') <> 'rejected'
                                and (g.expires_at is null or g.expires_at > now()))
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is not null
                and r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is not null
                and (p_member is null or r.created_by = p_member)
              order by r.deleted_at desc, r.id limit v_window)
          ) x
         order by x.deleted_at desc, x.id
         limit v_limit offset v_offset
      ) y
     order by y.deleted_at desc, y.id;
  end if;

  -- ── THE STORE'S OWN THINGS, removed on their own (lane STORE-RESTORE-DOORS) ──────────────────
  foreach v_kind slice 1 in array array[['field','Field'],['rule','Rule'],['relation','Link'],['doc_template','Document template'],['dashboard','Dashboard']] loop
    continue when p_kinds is not null and not (v_kind[1] = any (p_kinds));
    return query
    select v_kind[1], 'record'::text, v_kind[2], y.id,
           coalesce(public._trash_store_title(y.organization_id, y.id), 'Untitled'),
           y.deleted_at, y.organization_id, (y.created_by = p_uid), y.created_by
      from (select c.id, c.organization_id, c.deleted_at, c.created_by
              from public._trash_store_children(p_uid, p_org, p_member, v_kind[1], v_window) c
             order by c.deleted_at desc, c.id
             limit v_limit offset v_offset) y
     order by y.deleted_at desc, y.id;
  end loop;
end;
$function$;

create or replace view workbench.pick_list_live with (security_invoker = true) as
SELECT l.id,
    (l.list_name)::text AS list_name,
    l.description,
    l.user_id,
    l.organization_id,
    l.is_public,
    l.public_read,
    l.created_at,
    l.updated_at,
    'older'::text AS lives_in
   FROM workbench.udt_structured_lists l
  WHERE (l.deleted_at IS NULL)
UNION ALL
 SELECT t.id,
    COALESCE(NULLIF((t.data ->> 'name'::text), ''::text), 'List'::text) AS list_name,
    (t.data ->> 'description'::text) AS description,
    t.created_by AS user_id,
    t.organization_id,
    false AS is_public,
    false AS public_read,
    COALESCE(o.created_at, t.created_at) AS created_at,
    t.updated_at,
    'record'::text AS lives_in
   FROM (custom.record t
     LEFT JOIN workbench.udt_structured_lists o ON ((o.id = t.id)))
  WHERE ((t.table_id = custom.table_kernel_id()) AND (t.data_class = 'table'::text) AND (t.deleted_at IS NULL) AND platform._is_store_pick_list(t.metadata) AND ((o.id IS NULL) OR ((o.deleted_at IS NOT NULL) AND platform._older_list_moved_by_switch(o.id))));

create or replace view workbench.pick_list_item_live with (security_invoker = true) as
SELECT i.id,
    i.list_id,
    (i.label)::text AS label,
    i.description,
    i.help_text,
    (i.group_name)::text AS group_name,
    (i.icon_name)::text AS icon_name,
    i.organization_id,
    i.created_at,
    i.updated_at,
    'older'::text AS lives_in
   FROM (workbench.udt_structured_list_items i
     JOIN workbench.udt_structured_lists l ON (((l.id = i.list_id) AND (l.deleted_at IS NULL))))
  WHERE (i.deleted_at IS NULL)
UNION ALL
 SELECT c.id,
    c.table_id AS list_id,
    (c.data ->> 'name'::text) AS label,
    (c.data ->> 'description'::text) AS description,
    (c.data ->> 'help_text'::text) AS help_text,
    (c.data ->> 'group_name'::text) AS group_name,
    (c.data ->> 'icon'::text) AS icon_name,
    c.organization_id,
    COALESCE(oi.created_at, c.created_at) AS created_at,
    c.updated_at,
    'record'::text AS lives_in
   FROM ((workbench.pick_list_live pl
     JOIN custom.record c ON (((c.organization_id = pl.organization_id) AND (c.table_id = pl.id))))
     LEFT JOIN workbench.udt_structured_list_items oi ON ((oi.id = c.id)))
  WHERE ((pl.lives_in = 'record'::text) AND (c.data_class = 'record'::text) AND (c.deleted_at IS NULL));

select set_config('app.actor_system', 'switchsteptwo_b inverse (the carried choice order taken off)', true);
update custom.record r set metadata = (r.metadata - 'option_position') - 'option_position_carried'
 where r.data_class = 'record' and r.metadata ->> 'option_position_carried' = 'switch-step-two';
select set_config('app.actor_system', '', true);
