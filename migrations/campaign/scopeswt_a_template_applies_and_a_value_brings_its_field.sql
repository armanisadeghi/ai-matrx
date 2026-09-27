-- chair-step: lane SCOPES-WRITE-THROUGH, follow-up found by walking a born-on-the-store organization through the product's own paths. (1) custom._ctx_rekey read `r.data -> '_values' - p_from` as `r.data -> ('_values' - p_from)` and refused every template whose type carries an item called "description" (Brand & Identity); parenthesised. (2) custom._ctx_store_value lands the Field and the scope from their image when a value arrives before them, instead of refusing ("a declared Field is added first, never a refusal"). (3) public.apply_template gives a reference item what it may point at (a scope of its own type — every business template's "Reports To"): context_items_reference_types_required refused 26 of the 34 templates in every organization, old or new. (public.apply_template_definition has the same defect, no caller in any repository and no client grant; it is left for its owner, named in PROGRESS-SCOPES-WRITE-THROUGH.md.)
-- based-on: custom._ctx_rekey(uuid, uuid, text, text) 1eba2820190b0b6a72df0f0ab2e17466897cc8d9fc80a4d46037646e9bf03d96
-- based-on: custom._ctx_store_value(uuid, jsonb) 34d5a723773ad3e8905749bece3b96f552f7222985a501c0f95e75e2490f0755
-- based-on: public.apply_template(uuid, uuid) 0840ce114644c251f7067621712cee7ff7141e72e4a13e21d0988543a501802e
-- lane: SCOPES-WRITE-THROUGH
-- INVERSE: migrations/inverse/scopeswt_a_template_applies_and_a_value_brings_its_field_down.sql
-- window-class: function bodies only. Applied directly (owner, 2026-09-24).
--
-- THE USE CASE. A dental practice made today applies the "Dental Practice" template during
-- onboarding: its Team Members type lands with "Reports To" pointing at another team member, in
-- the old tables and in the record store in the same save; a practice applying "Brand & Identity"
-- lands its "description" field without the store refusing the rename of the scope's own column.

create or replace function custom._ctx_rekey(p_org uuid, p_type uuid, p_from text, p_to text)
 returns integer
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare v_n integer;
begin
  if p_from = p_to then return 0; end if;
  update custom.record r
     set data = (r.data - p_from)
                || jsonb_build_object(p_to, r.data -> p_from)
                || case when (r.data -> '_values') ? p_from
                        then jsonb_build_object('_values', ((r.data -> '_values') - p_from)
                                                           || jsonb_build_object(p_to, (r.data -> '_values') -> p_from))
                        else '{}'::jsonb end
   where r.organization_id = p_org and r.table_id = p_type and r.data_class = 'record'
     and r.data ? p_from;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

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
  -- A VALUE BRINGS ITS FIELD AND ITS SCOPE (SC-2', "a declared Field is added first, never a
  -- refusal"): a value written for an item or a scope the store has not been handed yet (an old
  -- writer that inserted the three rows in one statement batch, a row written before the switch)
  -- lands them from the image first.
  if v_field.id is null then
    perform custom._ctx_store_item(p_org, i.scope_type_id, i.id, to_jsonb(i))
       from context.context_items i where i.id = (p_row ->> 'context_item_id')::uuid;
    select * into v_field from custom.record f
     where f.organization_id = p_org and f.id = (p_row ->> 'context_item_id')::uuid and f.data_class = 'field';
  end if;
  if v_rec.id is null then
    perform custom._ctx_store_scope(p_org, s.scope_type_id, s.id, to_jsonb(s))
       from context.scopes s where s.id = (p_row ->> 'scope_id')::uuid;
    select * into v_rec from custom.record r
     where r.organization_id = p_org and r.id = (p_row ->> 'scope_id')::uuid and r.data_class = 'record';
  end if;
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
$function$;

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
      -- A REFERENCE FIELD POINTS AT A SCOPE OF ITS OWN TYPE (SCOPES-WRITE-THROUGH). Every business
      -- template's "Reports To" is "the team member this person reports to", and a reference item
      -- must name what it may point at (context_items_reference_types_required): without this, 26 of
      -- the 34 templates could not be applied at all.
      insert into context.context_items (
        scope_type_id, key, display_name, description, value_type,
        status, fetch_hint, sensitivity, source_type, created_by,
        allowed_reference_types, allowed_scope_type_ids
      ) values (
        v_new_type_id, v_field.key, v_field.display_name, v_field.description, v_field.value_type,
        'active', 'on_demand', 'internal', 'manual', (select auth.uid()),
        case when v_field.value_type = 'reference' then array['scope'] end,
        case when v_field.value_type = 'reference' then array[v_new_type_id] end
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
$function$;
