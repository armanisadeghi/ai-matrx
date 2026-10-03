-- draft: claude-w2w round 3 in clone proof
-- chair-step: it REPLACES the bodies of three lane-9 scope doors — custom.context_item_write, custom.context_item_archive, custom.context_item_restore (signatures, SECURITY DEFINER, search_path and grants unchanged). None of them calls public.create_context_item / update_context_item / delete_context_item / restore_context_item any more, or reads the old scope tables to decide: the context field, its scope type, its organization, whether it is live and the next sort place come from the record store (custom.scope_item_row_of gives the field's words in the old shape); the access rules and sentences are the old functions' own, word for word (an organization admin or the server; the row branch's platform admin; no move to the store ladder, chair item CA1). The store Field is written FIRST through the lane-9 store half custom._ctx_store_item, named in custom.context_door_row so the follow and the store's side-effect twin leave it to the door; the old row is then written as the IMAGE with today's own statements (only the words a caller named change, as before), so every old trigger — the suggestion sweep, dataset provisioning, the review date — fires as it did; the store half is handed the image row once more, and the twin runs for the Field after the old triggers. A word sent as JSON null on the plain path keeps the word, as update_context_item's COALESCE did. No new door, no grant, no change to the chair's record doors or the access ladder.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_item_write(uuid, uuid, jsonb) 5995fa185cc8c1a4e69d44ae5102c919345db8684a7d5caaf55b991c51910443
-- based-on: custom.context_item_archive(uuid) 0e8d9a003368e9664e29854265ee092623a22ece931d4ce03d2260fdb6063d38
-- based-on: custom.context_item_restore(uuid) 545b46f5520d6551a54be7b4bb0dd9100bd384a204085850b6c25a201d65dec5
-- lock: custom
--
-- Inverse: migrations/inverse/scopesw2w_the_context_field_doors_write_the_store_first_down.sql.
-- Order: after scopesw2w_the_scope_type_door_writes_the_store_first.sql (custom.context_door_row in the follow and
-- the twin).
--
-- THE USE CASE. Cedar Ridge Physical Therapy's Practice Area gains a "Referral source" context field, renames it,
-- keeps it away from assistants, retires it and brings it back. Every decision is read from the record store and
-- the store Field is written first; the old context_items row follows as the image until wave 3.
-- Guards: scripts/campaign-tests/scopesw2w_the_context_field_doors_write_the_store_first_same_answer.sql and the
-- platform writers' suite.

CREATE OR REPLACE FUNCTION custom.context_item_write(p_item_id uuid, p_scope_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s        jsonb := coalesce(p_spec, '{}'::jsonb);
  v_row    jsonb;
  v_org    uuid;
  v_type   uuid;
  v_id     uuid;
  v_f      custom.record;
  v_t      custom.record;
  v_cur    jsonb;
  v_spec   jsonb;
  v_sort   smallint;
  v_img    context.context_items;
  v_rowupdate boolean := false;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  if p_item_id is null then
    -- public.create_context_item's own checks and sentences, on the store Table.
    select t.* into v_t from custom.record t
     where t.id = p_scope_type_id and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
       and t.deleted_at is null;
    v_org := v_t.organization_id;
    v_type := p_scope_type_id;
    if v_org is null then
      perform platform.refuse_not_found(format('active scope type %s not found', p_scope_type_id));
    end if;
    if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
      raise exception 'organization admin required for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    perform context.validate_dataset_template_source(
      case when jsonb_typeof(s -> 'reference_source') = 'object' then s -> 'reference_source' end, v_org);
    -- THE NEXT PLACE among the type's active context fields (the store keeps sort + 2).
    v_sort := coalesce((s ->> 'sort_order')::smallint,
      (select (coalesce(max(nullif(f.data ->> 'sort', '')::int - 2), 0) + 1)::smallint
         from custom.record f
        where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
          and f.data ->> 'entity_definition_id' = v_type::text and f.deleted_at is null
          and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items'
          and coalesce((f.metadata #>> '{moved_from,carried,is_active}')::boolean, true)));
    v_id := pg_catalog.gen_random_uuid();
    v_spec := jsonb_build_object(
      'id', v_id, 'scope_type_id', v_type, 'key', s -> 'key', 'display_name', s -> 'display_name',
      'description', coalesce(s ->> 'description', ''), 'category', s -> 'category',
      'value_type', coalesce(s ->> 'value_type', 'string'), 'fetch_hint', coalesce(s ->> 'fetch_hint', 'on_demand'),
      'sensitivity', coalesce(s ->> 'sensitivity', 'internal'), 'status', 'active', 'source_type', 'manual',
      'tags', coalesce(s -> 'tags', '[]'::jsonb), 'slug', custom._ctx_scope_slug(s ->> 'key'), 'sort_order', v_sort,
      'created_by', auth.uid(),
      'allowed_reference_types', case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then s -> 'allowed_reference_types' end,
      'max_items', coalesce((s ->> 'max_items')::int, 1),
      'allowed_scope_type_ids', case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then s -> 'allowed_scope_type_ids' end,
      'reference_source', case when jsonb_typeof(s -> 'reference_source') = 'object' then s -> 'reference_source' end,
      'is_active', true, 'deleted_at', null, 'depends_on', '[]'::jsonb);
  else
    -- THE FIELD, BY ITS ID, FROM THE STORE (any state), and its Table.
    select f.* into v_f from custom.record f
      join custom.record t on t.organization_id = f.organization_id and t.id::text = f.data ->> 'entity_definition_id'
                          and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
     where f.id = p_item_id and f.data_class = 'field' and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
    v_org := v_f.organization_id;
    v_type := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
    v_rowupdate := exists (select 1 from jsonb_each(s) e where jsonb_typeof(e.value) = 'null')
                   or s ?| array['custom_component', 'review_interval_days', 'allowed_reference_types', 'max_items',
                                 'allowed_scope_type_ids', 'reference_source'];
    if v_rowupdate then
      -- THE ROW POLICY'S OWN QUESTION, BY NAME (lane SCOPES-OLD-WRITERS): a platform admin, or an admin of the
      -- field's organization; a field the caller may not change answers exactly as a missing one.
      if v_org is null or not (public.is_platform_admin() or coalesce(iam.has_org_admin(v_org), false)) then
        raise exception 'There is no such context field you may change.' using errcode = '42501',
            detail = jsonb_build_object('item_id', p_item_id)::text;
      end if;
    else
      -- public.update_context_item's own checks and sentences: an active field.
      if v_org is null or v_f.deleted_at is not null then
        perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
      end if;
      if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
        raise exception 'organization admin required for this organization' using errcode = '42501',
                detail = jsonb_build_object('org', v_org)::text;
      end if;
    end if;
    -- The field's words in the old shape, from the store, with what the caller changed applied as the old
    -- statement applies it (named keys on the row path; non-null words on the plain path).
    v_cur := custom.scope_item_row_of(v_f) || jsonb_build_object(
      'scope_type_id', v_type, 'created_by', v_f.created_by, 'deleted_at', v_f.deleted_at,
      'is_active', coalesce((v_f.metadata #>> '{moved_from,carried,is_active}')::boolean, true),
      'review_interval_days', v_f.data -> 'review_interval_days', 'depends_on', coalesce(v_f.data -> 'depends_on', '[]'::jsonb),
      'status_note', v_f.data -> 'status_note', 'source_type', 'manual');
    if v_rowupdate then
      select v_cur || coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_spec
        from jsonb_each(s) e
       where e.key in ('display_name', 'description', 'category', 'value_type', 'fetch_hint', 'sensitivity', 'tags',
                       'sort_order', 'status', 'status_note', 'custom_component', 'review_interval_days',
                       'allowed_reference_types', 'max_items', 'allowed_scope_type_ids', 'reference_source');
      if s ? 'max_items' then
        v_spec := v_spec || jsonb_build_object('max_items', coalesce((s ->> 'max_items')::int, 1));
      end if;
    else
      select v_cur || coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_spec
        from jsonb_each(s) e
       where e.key in ('display_name', 'description', 'category', 'value_type', 'fetch_hint', 'sensitivity', 'tags',
                       'sort_order', 'status', 'status_note')
         and jsonb_typeof(e.value) <> 'null';
    end if;
  end if;

  -- 1. THE STORE, FIRST, held back from the follow and the twin.
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform set_config('custom.context_door_row', coalesce(v_id, p_item_id)::text, true);
  perform custom._ctx_store_item(v_org, v_type, coalesce(v_id, p_item_id), v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);

  -- 2. THE IMAGE, with today's own statements.
  if p_item_id is null then
    insert into context.context_items (id, scope_type_id, key, display_name, description, category, value_type, fetch_hint,
                                       sensitivity, status, source_type, tags, slug, sort_order, created_by,
                                       allowed_reference_types, max_items, allowed_scope_type_ids, reference_source)
    values (v_id, v_type, s ->> 'key', s ->> 'display_name', coalesce(s ->> 'description', ''), s ->> 'category',
            coalesce(s ->> 'value_type', 'string')::public.context_value_type,
            coalesce(s ->> 'fetch_hint', 'on_demand')::public.context_fetch_hint,
            coalesce(s ->> 'sensitivity', 'internal')::public.context_sensitivity, 'active', 'manual',
            coalesce(array(select jsonb_array_elements_text(s -> 'tags')), '{}'::text[]), nullif(s ->> 'slug', ''), v_sort,
            (select auth.uid()),
            case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_reference_types')) end,
            coalesce((s ->> 'max_items')::int, 1),
            case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_scope_type_ids'))::uuid[] end,
            case when jsonb_typeof(s -> 'reference_source') = 'object' then s -> 'reference_source' end)
    returning * into v_img;
  elsif v_rowupdate then
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
    returning * into v_img;
    if v_img.id is null then
      raise exception 'There is no such context field you may change.' using errcode = '42501',
          detail = jsonb_build_object('item_id', p_item_id)::text;
    end if;
  else
    update context.context_items
       set display_name = coalesce(s ->> 'display_name', display_name),
           description  = coalesce(s ->> 'description', description),
           category     = coalesce(s ->> 'category', category),
           value_type   = coalesce((s ->> 'value_type')::public.context_value_type, value_type),
           fetch_hint   = coalesce((s ->> 'fetch_hint')::public.context_fetch_hint, fetch_hint),
           sensitivity  = coalesce((s ->> 'sensitivity')::public.context_sensitivity, sensitivity),
           tags         = coalesce(case when s ? 'tags' then array(select jsonb_array_elements_text(s -> 'tags')) end, tags),
           sort_order   = coalesce((s ->> 'sort_order')::smallint, sort_order),
           status       = coalesce((s ->> 'status')::public.context_item_status, status),
           status_note  = coalesce(s ->> 'status_note', status_note),
           updated_at   = now()
     where id = p_item_id
    returning * into v_img;
    if v_img.id is null then
      perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
    end if;
  end if;
  perform set_config('custom.context_door_row', '', true);

  -- 3. THE IMAGE'S OWN WORDS BACK, and 4. the twin after the old triggers when step 3 changed nothing.
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  v_did := custom._ctx_store_item(v_org, v_type, v_img.id, to_jsonb(v_img)) ->> 'did';
  perform custom._ctx_mark(v_was);
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(
      v_org, v_img.id, custom.field_kernel_id(), case when p_item_id is null then 'created' else 'updated' end)));
  end if;

  v_row := to_jsonb(v_img);
  perform custom.assert_client_may_reach(v_org, 'custom.context_item_write');
  return custom._ctx_answer(v_org, v_img.id, v_row);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_item_archive(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f      custom.record;
  v_org    uuid;
  v_type   uuid;
  v_spec   jsonb;
  v_img    context.context_items;
  v_was    text;
  v_actor  text;
  v_did    text;
  v_now    timestamptz := now();
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  select f.* into v_f from custom.record f
    join custom.record t on t.organization_id = f.organization_id and t.id::text = f.data ->> 'entity_definition_id'
                        and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
   where f.id = p_item_id and f.data_class = 'field' and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
  v_org := v_f.organization_id;
  v_type := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
  -- public.delete_context_item's own checks and sentences.
  if v_org is null or v_f.deleted_at is not null then
    perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
  end if;
  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for this organization' using errcode = '42501',
            detail = jsonb_build_object('org', v_org)::text;
  end if;
  v_spec := custom.scope_item_row_of(v_f) || jsonb_build_object(
    'scope_type_id', v_type, 'created_by', v_f.created_by, 'deleted_at', v_now, 'is_active', false,
    'review_interval_days', v_f.data -> 'review_interval_days', 'depends_on', coalesce(v_f.data -> 'depends_on', '[]'::jsonb),
    'status_note', v_f.data -> 'status_note', 'source_type', 'manual');

  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform set_config('custom.context_door_row', p_item_id::text, true);
  perform custom._ctx_store_item(v_org, v_type, p_item_id, v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);

  update context.context_items
     set deleted_at = v_now, is_active = false, updated_at = v_now
   where id = p_item_id
  returning * into v_img;
  perform set_config('custom.context_door_row', '', true);
  if v_img.id is null then
    perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
  end if;

  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  v_did := custom._ctx_store_item(v_org, v_type, p_item_id, to_jsonb(v_img)) ->> 'did';
  perform custom._ctx_mark(v_was);
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(v_org, p_item_id, custom.field_kernel_id(), 'updated')));
  end if;

  perform custom.assert_client_may_reach(v_org, 'custom.context_item_archive');
  return custom._ctx_answer(v_org, p_item_id, jsonb_build_object('id', v_img.id, 'deleted_at', v_img.deleted_at));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_item_restore(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f      custom.record;
  v_org    uuid;
  v_type   uuid;
  v_spec   jsonb;
  v_img    context.context_items;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  select f.* into v_f from custom.record f
    join custom.record t on t.organization_id = f.organization_id and t.id::text = f.data ->> 'entity_definition_id'
                        and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
   where f.id = p_item_id and f.data_class = 'field' and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
  v_org := v_f.organization_id;
  v_type := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
  -- public.restore_context_item's own checks and sentences.
  if v_org is null then
    perform platform.refuse_not_found(format('context item %s not found', p_item_id));
  end if;
  if v_f.deleted_at is null and coalesce((v_f.metadata #>> '{moved_from,carried,is_active}')::boolean, true) then
    perform custom.assert_client_may_reach(v_org, 'custom.context_item_restore');
    return custom._ctx_answer(v_org, p_item_id,
             jsonb_build_object('id', p_item_id, 'restored', false, 'detail', 'It is already in use.'));
  end if;
  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for this organization' using errcode = '42501',
            detail = jsonb_build_object('org', v_org)::text;
  end if;
  v_spec := custom.scope_item_row_of(v_f) || jsonb_build_object(
    'scope_type_id', v_type, 'created_by', v_f.created_by, 'deleted_at', null, 'is_active', true,
    'review_interval_days', v_f.data -> 'review_interval_days', 'depends_on', coalesce(v_f.data -> 'depends_on', '[]'::jsonb),
    'status_note', v_f.data -> 'status_note', 'source_type', 'manual');

  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform set_config('custom.context_door_row', p_item_id::text, true);
  perform custom._ctx_store_item(v_org, v_type, p_item_id, v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);

  update context.context_items
     set deleted_at = null, is_active = true, updated_at = now()
   where id = p_item_id
  returning * into v_img;
  perform set_config('custom.context_door_row', '', true);
  if v_img.id is null then
    perform platform.refuse_not_found(format('context item %s not found', p_item_id));
  end if;

  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  v_did := custom._ctx_store_item(v_org, v_type, p_item_id, to_jsonb(v_img)) ->> 'did';
  perform custom._ctx_mark(v_was);
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(v_org, p_item_id, custom.field_kernel_id(), 'updated')));
  end if;

  perform custom.assert_client_may_reach(v_org, 'custom.context_item_restore');
  return custom._ctx_answer(v_org, p_item_id, jsonb_build_object('id', v_img.id, 'restored', true));
end;
$function$;
