-- additive: no
-- PICK-LISTS-ACCESS (2026-10-10). REPAIRS an unplanned narrowing in picklists_a_a_*: custom.pick_list_get and custom.pick_list_update
-- put the organization wall (assert_client_may_open / assert_client_may_change -> assert_client_may_reach) in front of the list. The
-- public RPCs they replace (get_user_list_with_items, update_user_list) had NO wall: they asked the one ladder about the list alone, so a
-- person outside the organization who holds only a direct share of the list was let in. Behind the wall that same person was refused
-- whenever the organization's external-principal knob is off. Policy: tighten-access-only-with-an-access-plan.
-- THE FIX: both doors ask the ladder for the list alone again, through the sanctioned entry point custom.effective_level (the highest rung
-- the one ladder admits for this person on this list; the store's own field-write door asks the same), and refuse with the sentences the
-- public RPCs used. No wall, no new reader of the retiring row column (T-13 untouched), no kernel edit. The write doors the update calls
-- keep their own walls exactly as in the public RPC. pick_list_for_selection already answered through platform._store_pick_list_document
-- for the caller (no wall) and is unchanged.
-- lane: PICK-LISTS-ACCESS
-- INVERSE: migrations/inverse/picklists_b_an_outside_share_still_opens_its_pick_list_down.sql
-- based-on: custom.pick_list_get(uuid) 5d20c1a087e9510e1cfd9f7fc915acdf22d729430fcb12d07e55379884753037
-- based-on: custom.pick_list_update(uuid, text, text, jsonb) 9f6cde3a79cd5f7ce4c68f9a5a74c1de4f31c22bdcac25ff880dedef6f92479c

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
  if p_list_id is null then
    raise exception 'viewer access required for this list' using errcode = '42501',
          detail = jsonb_build_object('list_id', p_list_id)::text;
  end if;
  if auth.role() <> 'service_role' then
    select t.organization_id into v_org from custom.record t where t.id = p_list_id and t.data_class = 'table' limit 1;
    -- The one ladder, asked about the list alone (a direct share to a non-member counts; no organization wall).
    if v_org is null
       or not coalesce(custom.effective_level((select auth.uid()), v_org, p_list_id, 'record') >= 'viewer'::public.permission_level, false) then
      raise exception 'viewer access required for this list' using errcode = '42501',
            detail = jsonb_build_object('list_id', p_list_id)::text;
    end if;
  end if;
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
  -- The one ladder, asked about the list alone (a direct share to a non-member counts; no organization wall).
  if auth.role() <> 'service_role'
     and not coalesce(custom.effective_level((select auth.uid()), v_org, p_list_id, 'record') >= 'editor'::public.permission_level, false) then
    raise exception 'owner access required for this list' using errcode = '42501',
          detail = jsonb_build_object('list_id', p_list_id)::text;
  end if;
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

update platform.client_callable_door
   set reason = case function_name
     when 'pick_list_get' then 'Same gate as public.get_user_list_with_items: refuses unless the one ladder (custom.effective_level, the list alone, no organization wall) gives the caller viewer on the list, so a direct share to a non-member still opens it; answers only that list.'
     else 'Same gate as public.update_user_list: refuses unless the one ladder (custom.effective_level, the list alone, no organization wall) gives the caller editor on the list, so a direct editor share to a non-member still works; writes only that list and its choices, through the store write doors.' end
 where schema_name = 'custom' and function_name in ('pick_list_get', 'pick_list_update');
