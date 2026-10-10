-- INVERSE of migrations/campaign/picklists_b_an_outside_share_still_opens_its_pick_list.sql (lane PICK-LISTS-ACCESS): restores the picklists_a_a_* bodies (organization wall first) and the door reasons.
-- lane: PICK-LISTS-ACCESS

create or replace function custom.pick_list_get(p_list_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_org uuid;
begin
  select t.organization_id into v_org from custom.record t where t.id = p_list_id and t.data_class = 'table' limit 1;
  if v_org is null then
    raise exception 'viewer access required for this list' using errcode = '42501',
          detail = jsonb_build_object('list_id', p_list_id)::text;
  end if;
  -- The store's one door order: the organization wall, then the row on the one ladder (viewer).
  perform custom.assert_client_may_open(v_org, p_list_id, 'custom.pick_list_get', 'viewer'::public.permission_level, 'list');
  return public._d31_impl_get_user_list_with_items(p_list_id);
end;
$function$;

create or replace function custom.pick_list_update(
  p_list_id uuid,
  p_list_name text default null,
  p_description text default null,
  p_items jsonb default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_org  uuid;
  v_item jsonb;
  v_rows jsonb[];
  v_old  uuid;
begin
  select t.organization_id into v_org
    from custom.record t where t.id = p_list_id and t.data_class = 'table' and t.deleted_at is null limit 1;
  if v_org is null then
    raise exception 'there is no list with that id in the new system' using errcode = '02000',
          detail = jsonb_build_object('list_id', p_list_id)::text;
  end if;
  perform custom.assert_client_may_change(v_org, p_list_id, 'custom.pick_list_update', 'editor'::public.permission_level, 'list');
  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'A list''s items are a list of choices, each with a label.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_list_name, '')), '') is not null or p_description is not null then
    perform custom.record_update(v_org, p_list_id, jsonb_strip_nulls(jsonb_build_object(
      'name', nullif(btrim(coalesce(p_list_name, '')), ''), 'description', p_description)));
  end if;
  if p_items is not null then
    for v_old in select c.id from custom.record c
                  where c.organization_id = v_org and c.table_id = p_list_id
                    and c.data_class = 'record' and c.deleted_at is null loop
      perform custom.record_delete(v_org, v_old);
    end loop;
    for v_item in select * from jsonb_array_elements(p_items) loop
      continue when coalesce(nullif(btrim(coalesce(v_item ->> 'Label', v_item ->> 'label')), ''), '') = '';
      v_rows := v_rows || jsonb_strip_nulls(jsonb_build_object(
        'name', coalesce(v_item ->> 'Label', v_item ->> 'label'),
        'description', coalesce(v_item ->> 'Description', v_item ->> 'description'),
        'help_text', coalesce(v_item ->> 'Help Text', v_item ->> 'help_text'),
        'group_name', coalesce(v_item ->> 'Group', v_item ->> 'group_name'),
        'icon', coalesce(v_item ->> 'icon_name', v_item ->> 'icon')));
    end loop;
    if coalesce(cardinality(v_rows), 0) > 0 then
      perform custom.record_write_many(v_org, p_list_id, v_rows);
    end if;
  end if;
  return platform._store_pick_list_document(p_list_id, null, 'detail') - 'items_grouped'
         || jsonb_build_object('items', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'id', c.id, 'label', c.data ->> 'name', 'description', c.data ->> 'description',
                       'help_text', c.data ->> 'help_text', 'group_name', c.data ->> 'group_name') order by c.created_at, c.id)
                from custom.record c
               where c.organization_id = v_org and c.table_id = p_list_id
                 and c.data_class = 'record' and c.deleted_at is null), '[]'::jsonb));
end;
$function$;

update platform.client_callable_door set reason = case function_name when 'pick_list_get' then 'Same gate as public.get_user_list_with_items: refuses unless the caller may VIEW the list on the store ladder (custom.assert_client_may_open viewer) before it reads anything; answers only that list.' else 'Same gate as public.update_user_list: refuses unless the caller may EDIT the list on the store ladder (custom.assert_client_may_change editor) before it writes; writes only that list and its choices, through the store write doors.' end where schema_name = 'custom' and function_name in ('pick_list_get','pick_list_update');
