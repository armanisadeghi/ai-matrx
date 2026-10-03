-- chair-step: the inverse of scopesw2w_the_context_field_doors_write_the_store_first.sql — restores the bodies of custom.context_item_write, context_item_archive and context_item_restore exactly as production holds them on 2026-10-03 (sha256 5995fa18…, 0e8d9a00…, 545b46f5…), in which each door decides and writes through the old function and the store follows.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_item_write(uuid, uuid, jsonb) c339d0d3185d071b918b46d87be8f54695c61621dad43c251db6ed2fb133bc23
-- based-on: custom.context_item_archive(uuid) 5bb8d63c802eb650b5c6d9abe31904b90cd94ecab836677ec97943a7a44ab758
-- based-on: custom.context_item_restore(uuid) c63c09d0d56792a675b25df477a263d00edcc0e89312fad2649226ee63954bb8
-- lock: custom

CREATE OR REPLACE FUNCTION custom.context_item_write(p_item_id uuid, p_scope_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  jsonb;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
  v_org  uuid;
  v_rowupdate boolean;
begin
  if p_item_id is null then
    v_row := public.create_context_item(
      p_scope_type_id, s ->> 'key', s ->> 'display_name', coalesce(s ->> 'value_type', 'string')::public.context_value_type,
      coalesce(s ->> 'description', ''), s ->> 'category',
      coalesce(s ->> 'fetch_hint', 'on_demand')::public.context_fetch_hint,
      coalesce(s ->> 'sensitivity', 'internal')::public.context_sensitivity,
      coalesce(array(select jsonb_array_elements_text(s -> 'tags')), '{}'::text[]),
      nullif(s ->> 'slug', ''), (s ->> 'sort_order')::smallint,
      case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_reference_types')) end,
      (s ->> 'max_items')::int,
      case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_scope_type_ids'))::uuid[] end,
      case when jsonb_typeof(s -> 'reference_source') = 'object' then s -> 'reference_source' end);
  else
    v_rowupdate := exists (select 1 from jsonb_each(s) e where jsonb_typeof(e.value) = 'null')
                   or s ?| array['custom_component', 'review_interval_days', 'allowed_reference_types', 'max_items',
                                 'allowed_scope_type_ids', 'reference_source'];
    if v_rowupdate then
      -- THE ROW POLICY'S OWN QUESTION, BY NAME (lane SCOPES-OLD-WRITERS): this branch used to lean on
      -- context.context_items' policy context_items_update, which a definer does not meet. It asks
      -- that predicate — a platform admin, or an admin of the item's organization — and a row the
      -- caller may not change answers exactly as a row the policy hid did.
      select t.organization_id into v_org
        from context.context_items i join context.scope_types t on t.id = i.scope_type_id
       where i.id = p_item_id;
      if v_org is null or not (public.is_platform_admin() or coalesce(iam.has_org_admin(v_org), false)) then
        raise exception 'There is no such context field you may change.' using errcode = '42501',
            detail = jsonb_build_object('item_id', p_item_id)::text;
      end if;
      update context.context_items i
         set display_name = case when s ? 'display_name' then s ->> 'display_name' else i.display_name end,
             description = case when s ? 'description' then s ->> 'description' else i.description end,
             category = case when s ? 'category' then s ->> 'category' else i.category end,
             value_type = case when s ? 'value_type' then (s ->> 'value_type')::public.context_value_type else i.value_type end,
             fetch_hint = case when s ? 'fetch_hint' then (s ->> 'fetch_hint')::public.context_fetch_hint else i.fetch_hint end,
             sensitivity = case when s ? 'sensitivity' then (s ->> 'sensitivity')::public.context_sensitivity else i.sensitivity end,
             tags = case when s ? 'tags' then coalesce(array(select jsonb_array_elements_text(s -> 'tags')), '{}'::text[]) else i.tags end,
             sort_order = case when s ? 'sort_order' then (s ->> 'sort_order')::smallint else i.sort_order end,
             status = case when s ? 'status' then (s ->> 'status')::public.context_item_status else i.status end,
             status_note = case when s ? 'status_note' then s ->> 'status_note' else i.status_note end,
             custom_component = case when s ? 'custom_component' then case when jsonb_typeof(s -> 'custom_component') = 'null' then null else s -> 'custom_component' end else i.custom_component end,
             review_interval_days = case when s ? 'review_interval_days' then (s ->> 'review_interval_days')::int else i.review_interval_days end,
             allowed_reference_types = case when s ? 'allowed_reference_types' then case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_reference_types')) end else i.allowed_reference_types end,
             max_items = case when s ? 'max_items' then coalesce((s ->> 'max_items')::int, 1) else i.max_items end,
             allowed_scope_type_ids = case when s ? 'allowed_scope_type_ids' then case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_scope_type_ids'))::uuid[] end else i.allowed_scope_type_ids end,
             reference_source = case when s ? 'reference_source' then case when jsonb_typeof(s -> 'reference_source') = 'null' then null else s -> 'reference_source' end else i.reference_source end
       where i.id = p_item_id
      returning to_jsonb(i.*) into v_row;
      if v_row is null then
        raise exception 'There is no such context field you may change.' using errcode = '42501',
            detail = jsonb_build_object('item_id', p_item_id)::text;
      end if;
    else
      v_row := public.update_context_item(
        p_item_id, s ->> 'display_name', s ->> 'description', s ->> 'category',
        (s ->> 'value_type')::public.context_value_type, (s ->> 'fetch_hint')::public.context_fetch_hint,
        (s ->> 'sensitivity')::public.context_sensitivity,
        case when s ? 'tags' then array(select jsonb_array_elements_text(s -> 'tags')) end,
        (s ->> 'sort_order')::smallint, (s ->> 'status')::public.context_item_status, s ->> 'status_note');
    end if;
  end if;
  select t.organization_id into v_org from context.scope_types t where t.id = (v_row ->> 'scope_type_id')::uuid;
  if v_org is not null then
    perform custom.assert_client_may_reach(v_org, 'custom.context_item_write');
  end if;
  return custom._ctx_answer(v_org, (v_row ->> 'id')::uuid, v_row);
end;
$function$;


CREATE OR REPLACE FUNCTION custom.context_item_archive(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid := (select t.organization_id from context.context_items i join context.scope_types t on t.id = i.scope_type_id where i.id = p_item_id);
  v_row jsonb;
begin
  -- The old function decides first, in its own sentences; then the one ladder answers for this door by
  -- its own name (SCOPES-OLD-WRITERS: a definer door goes through the ladder itself).
  v_row := public.delete_context_item(p_item_id);
  if v_org is not null then
    perform custom.assert_client_may_reach(v_org, 'custom.context_item_archive');
  end if;
  return custom._ctx_answer(v_org, p_item_id, v_row);
end;
$function$;


CREATE OR REPLACE FUNCTION custom.context_item_restore(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid := (select t.organization_id from context.context_items i join context.scope_types t on t.id = i.scope_type_id where i.id = p_item_id);
  v_row jsonb;
begin
  -- The old function decides first, in its own sentences; then the one ladder answers for this door by
  -- its own name (SCOPES-OLD-WRITERS: a definer door goes through the ladder itself).
  v_row := public.restore_context_item(p_item_id);
  if v_org is not null then
    perform custom.assert_client_may_reach(v_org, 'custom.context_item_restore');
  end if;
  return custom._ctx_answer(v_org, p_item_id, v_row);
end;
$function$;


