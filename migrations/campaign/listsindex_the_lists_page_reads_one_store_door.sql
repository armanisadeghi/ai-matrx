-- additive: yes
--
-- LISTS-INDEX (lane HANDOVER, 2026-09-27) — THE LISTS PAGE READS ONE STORE DOOR.
--
-- Two new client doors, nothing replaced, dropped or revoked; no row is written.
--
-- THE USE CASE. The owner of Cedar Ridge Physical Therapy opens Lists to see every pick list her
-- organization keeps and make a new one. /lists/v3 read `workbench.udt_structured_lists` straight
-- from the browser (her own older lists) and asked `get_user_lists_summary` for the rest. The ruling
-- (coordinator, 2026-09-27): the Lists page reads the store only, through ONE list-index primitive
-- that the organization's Lists tab and the list pickers reuse.
--
--   custom.pick_list_index(p_organization_id)  one organization: the wall first
--       (custom.assert_client_may_reach), then every Table of choices the store's own visibility lets
--       the caller open (custom.query_visible_ids over the Table kernel, as custom.table_list_everywhere),
--       with its choice count; and, until the final switch archives them, the caller's OWN live older
--       lists of that organization (user_id = the caller, as custom.table_list_everywhere's older half),
--       marked lives_in 'older' so the page opens them where they live. Plus the ids of the
--       organization's archived Tables of choices, for the page's archive disclosure (it lists their
--       names from the store's own archive door, which decides who sees them).
--   custom.pick_list_index_everywhere()  the same for every organization the caller is a member of
--       and admitted to, plus her own older lists with no organization.
--
-- Guard: matrx-frontend/scripts/campaign-tests/listsindex_the_lists_page_reads_one_store_door.sql
-- Inverse: migrations/inverse/listsindex_the_lists_page_reads_one_store_door_down.sql

create or replace function custom._pick_list_index_of(p_organization_id uuid, p_me uuid)
 returns jsonb
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
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

create or replace function custom.pick_list_index(p_organization_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pick_list_index');
  return custom._pick_list_index_of(p_organization_id, v_me);
end;
$function$;

create or replace function custom.pick_list_index_everywhere()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
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

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   anonymous_callers, signed_in_callers, argument_rules)
values
  ('custom', 'pick_list_index', 'p_organization_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/listsindex_the_lists_page_reads_one_store_door.sql (lane HANDOVER)',
   'The Lists page''s one read. p_organization_id is checked by custom.assert_client_may_reach before anything is read. The store half is narrowed to custom.query_visible_ids(org, table kernel), so it never names a Table of choices the caller may not open; the older half is the caller''s OWN live older lists (user_id = the caller), as custom.table_list_everywhere. archived_ids names only ids of the organization''s archived Tables of choices; their names come from the store''s archive door.',
   false, true,
   jsonb_build_object('version', 1, 'arguments', jsonb_build_object('p_organization_id', jsonb_build_object(
     'type', 'uuid', 'position', 1, 'entity', 'organization',
     'check', 'this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
     'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
     'verified', '2026-09-27 lane HANDOVER — written with this body')),
     'declared_at', '2026-09-27 lane HANDOVER', 'declared_by', 'listsindex_the_lists_page_reads_one_store_door.sql')),
  ('custom', 'pick_list_index_everywhere', '', array[]::oid[],
   'migrations/campaign/listsindex_the_lists_page_reads_one_store_door.sql (lane HANDOVER)',
   'Takes no argument: it answers only for the signed-in principal (custom.query_principal), walks only organizations that person is a member of and admitted to (iam.has_org_access) with an open store, each through the same body as custom.pick_list_index, and adds the person''s own older lists with no organization.',
   false, true, null);

grant execute on function custom.pick_list_index(uuid) to authenticated;
grant execute on function custom.pick_list_index_everywhere() to authenticated;
