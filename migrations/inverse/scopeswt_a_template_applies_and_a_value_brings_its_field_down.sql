-- INVERSE of migrations/campaign/scopeswt_a_template_applies_and_a_value_brings_its_field.sql (lane SCOPES-WRITE-THROUGH).
-- chair-step: puts back the four bodies it replaced, byte for byte: custom._ctx_rekey and custom._ctx_store_value as scopeswt_scopes_are_written_in_the_store_first.sql made them, public.apply_template as production held it (which refuses every template carrying a reference field).
-- ground-standing-ok: b — this inverse runs BEFORE scopeswt_scopes_are_written_in_the_store_first_down.sql (the order is: this file, the switch's inverse, the doors' inverse, then that one); the two bodies it puts back belong to that file and are dropped by it, callees and all.
-- based-on: custom._ctx_rekey(uuid, uuid, text, text) f2da66e5aabd46ba612d4f19c7b7632e072128cf72b259a43d1feb224694db5c
-- based-on: custom._ctx_store_value(uuid, jsonb) 51722ed5e7d50c4c6a45eb95f1e5ce412968fbbf1e1492c464cffe9a7ce5f828
-- based-on: public.apply_template(uuid, uuid) 03151eafa10b9d4c247cf584baa7a4f1e9c66d0f4077c3e29f1464c84e788eaf

CREATE OR REPLACE FUNCTION custom._ctx_rekey(p_org uuid, p_type uuid, p_from text, p_to text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare v_n integer;
begin
  if p_from = p_to then return 0; end if;
  update custom.record r
     set data = (r.data - p_from)
                || jsonb_build_object(p_to, r.data -> p_from)
                || case when r.data -> '_values' ? p_from
                        then jsonb_build_object('_values', (r.data -> '_values' - p_from)
                                                           || jsonb_build_object(p_to, r.data -> '_values' -> p_from))
                        else '{}'::jsonb end
   where r.organization_id = p_org and r.table_id = p_type and r.data_class = 'record'
     and r.data ? p_from;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom._ctx_store_value(p_org uuid, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_field  custom.record;
  v_rec    custom.record;
  v_value  jsonb;
  v_src    jsonb;
  v_env    jsonb;
  v_actor  text := custom._ctx_word('actor', p_row ->> 'source_type');
begin
  if not coalesce((p_row ->> 'is_current')::boolean, true) then
    return jsonb_build_object('did', 'not_current');
  end if;
  select * into v_field from custom.record f
   where f.organization_id = p_org and f.id = (p_row ->> 'context_item_id')::uuid and f.data_class = 'field';
  select * into v_rec from custom.record r
   where r.organization_id = p_org and r.id = (p_row ->> 'scope_id')::uuid and r.data_class = 'record';
  if v_field.id is null or v_rec.id is null then
    raise exception 'The record store has no % for this value yet, so it cannot hold it.',
                    case when v_field.id is null then 'field' else 'record' end
      using errcode = '23503',
            hint = 'SCOPES-WRITE-THROUGH: a value is written after its scope and its context field. Nothing was written.';
  end if;
  if v_field.deleted_at is not null or v_rec.deleted_at is not null then
    -- An archived field or scope keeps its values as they were archived (the copy never writes them).
    return jsonb_build_object('did', 'archived');
  end if;

  v_value := custom._ctx_value_of(p_row, v_field.data);
  v_src := jsonb_build_object('kind', 'move', 'store', 'context.context_item_values',
                              'source_type', coalesce(p_row ->> 'source_type', 'manual'),
                              'feed', custom._ctx_word('source', p_row ->> 'source_type'),
                              'old_value_id', p_row ->> 'id',
                              'old_version', coalesce((p_row ->> 'version')::int, 1));
  if p_row ->> 'authored_by' is not null then
    v_src := v_src || jsonb_build_object('authored_by', p_row ->> 'authored_by');
  end if;
  if nullif(p_row ->> 'change_summary', '') is not null then
    v_src := v_src || jsonb_build_object('change_summary', p_row ->> 'change_summary');
  end if;
  v_env := jsonb_build_object('src', v_src, 'actor', v_actor,
                              'at', custom._ctx_iso(coalesce(nullif(p_row ->> 'created_at', '')::timestamptz, now())));
  if v_actor = 'agent' and p_row ->> 'authored_by' is not null then
    v_env := v_env || jsonb_build_object('on_behalf_of', p_row ->> 'authored_by');
  end if;
  if v_value is null then
    v_env := v_env || '{"absent": "none"}'::jsonb;
  end if;

  update custom.record r
     set data = (coalesce(r.data, '{}'::jsonb) || jsonb_build_object(v_field.data ->> 'key', coalesce(v_value, 'null'::jsonb)))
                || jsonb_build_object('_values', coalesce(r.data -> '_values', '{}'::jsonb)
                                                 || jsonb_build_object(v_field.data ->> 'key', v_env))
   where r.organization_id = p_org and r.id = v_rec.id;
  return jsonb_build_object('did', 'written', 'key', v_field.data ->> 'key');
end;
$function$

;

CREATE OR REPLACE FUNCTION public.apply_template(p_template_id uuid, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_template_type record;
  v_type_id_map jsonb := '{}'::jsonb;
  v_new_type_id uuid;
  v_field record;
  v_created_types jsonb := '[]'::jsonb;
  v_items_count integer := 0;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id using errcode = '42501';
  end if;

  if not exists (select 1 from context.templates t where t.id = p_template_id and t.is_active = true) then
    perform platform.refuse_not_found(format('active template %s not found', p_template_id));
  end if;

  for v_template_type in
    select * from context.template_scope_types where template_id = p_template_id order by sort_order
  loop
    insert into context.scope_types (
      organization_id, label_singular, label_plural, icon, description,
      sort_order, max_assignments_per_entity, slug
    ) values (
      p_org_id, v_template_type.label_singular, v_template_type.label_plural,
      v_template_type.icon, v_template_type.description, v_template_type.sort_order,
      v_template_type.max_assignments_per_entity,
      context.slugify(v_template_type.label_plural)   -- explicit; trigger also guarantees this
    )
    returning id into v_new_type_id;

    v_type_id_map := v_type_id_map || jsonb_build_object(v_template_type.id::text, v_new_type_id::text);
    v_created_types := v_created_types || jsonb_build_array(jsonb_build_object(
      'id', v_new_type_id, 'label_singular', v_template_type.label_singular, 'label_plural', v_template_type.label_plural));

    for v_field in
      select * from context.template_context_items where template_scope_type_id = v_template_type.id order by sort_order
    loop
      insert into context.context_items (
        scope_type_id, key, display_name, description, value_type,
        status, fetch_hint, sensitivity, source_type, created_by
      ) values (
        v_new_type_id, v_field.key, v_field.display_name, v_field.description, v_field.value_type,
        'active', 'on_demand', 'internal', 'manual', (select auth.uid())
        -- slug auto-mirrored from key by context.ensure_slug()
      );
      v_items_count := v_items_count + 1;
    end loop;
  end loop;

  for v_template_type in
    select id, parent_template_type_id from context.template_scope_types
    where template_id = p_template_id and parent_template_type_id is not null
  loop
    update context.scope_types
    set parent_type_id = (v_type_id_map ->> v_template_type.parent_template_type_id::text)::uuid
    where id = (v_type_id_map ->> v_template_type.id::text)::uuid;
  end loop;

  return jsonb_build_object(
    'template_id', p_template_id, 'organization_id', p_org_id,
    'scope_types_created', v_created_types, 'context_items_count', v_items_count);
end;
$function$

;
