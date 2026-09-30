-- draft: SCOPES-OLD-WRITERS rehearsal and shadow compare not yet run
-- chair-step: lane SCOPES-OLD-WRITERS (L11 of common-docs/projects/data-doctrine-adoption/v5/SCOPES-CUTOVER-PLAN.md, Phase 3.1). Three old scope writers stop writing context.* themselves and write through the record store's scope doors (custom.context_*): the agents' structure tool public.scope_system_apply (census S6), the knowledge accepts public.accept_scope_suggestion / accept_context_item_suggestion (S7), and a class's join code and access mode public.edu_class_join_code / edu_class_set_access (S8). The ten scope doors that call the old public write functions become SECURITY DEFINER so the next file can take those functions away from clients: they decide the caller exactly as before (the old functions' own checks by auth.uid(), then custom.assert_scope_door / custom._ctx_answer), and the one door that also wrote a row under the caller's row policy (context_item_write's column branch) now asks that policy's own question by name. Two doors adopt what scope_system could do and they could not (Arman's law 2026-09-29: the old path's better parts first): a scope type's parent and a cleared "max per record" (context_type_write), and a scope's parent (context_scope_write). Nothing is created, nothing is dropped, no table is touched, no row of data moves. Proof: scripts/campaign-tests/scopesoldwriters_red_green.sql (RED before: the catalogue census names five old writers; GREEN after: none, and every writer's effect on context.* and the store equals the old body's in a rolled-back shadow compare).
-- based-on: custom.context_type_write(uuid, uuid, jsonb) 7c5dcfdb54bcc009748c7fd587261c0f6d1a1eff5b0c9b0fd149eae32c0e46fb
-- based-on: custom.context_scope_write(uuid, uuid, uuid, jsonb) 3f393f455a253a58e6e72fef19a04e63716ef2a2799a42bda391ac96ddedd491
-- based-on: custom.context_item_write(uuid, uuid, jsonb) f26d4aecd864dcab2ba87fe73b85821ed8af7ab2adffaf9aea4f60e0dab6c526
-- based-on: public.scope_system_apply(uuid, jsonb) 589694d3a4183c026230b5adf727b052884fc0c0d5f5c82efc2cf52a513b16f8
-- based-on: public.accept_scope_suggestion(uuid, uuid) ee7db4c2cd562895f4e7d457e5693cfa5b8a036ff31e540dc67a6f244ea064a6
-- based-on: public.accept_context_item_suggestion(uuid) b5edaf743bfb9893402815f3bbe6ba6a4aa0a21363a79f32a265fe81616ffe0b
-- based-on: public.edu_class_join_code(uuid, text) 936ce0a6961f4ff95957e81b4bdcf65c3e68b2568b699fa8452b815dcf945510
-- based-on: public.edu_class_set_access(uuid, text) cfe85999045aed0d3f7730e9ac080d4a2db57ac99d6d7f97f3cb2a55087bd125
-- lane: SCOPES-OLD-WRITERS
-- INVERSE: migrations/inverse/scopesoldwriters_the_old_writers_write_through_the_scope_doors_down.sql
-- window-class: eight function bodies replaced, seven functions' SECURITY attribute changed, ten register rows' reason updated; no table, policy, trigger or grant touched; no relation lock above what CREATE OR REPLACE FUNCTION takes.

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 1 · THE SCOPE DOORS DECIDE IN THEIR OWN RIGHT (SECURITY DEFINER)
-- ══════════════════════════════════════════════════════════════════════════════════════════
--
-- Until now the ten doors below were SECURITY INVOKER wrappers: each called an old public write
-- function (create_scope, update_scope_type, delete_context_item, set_entity_scopes …) AS THE
-- CALLER, so a client could only use the door while it also held EXECUTE on the old function —
-- which is exactly the grant Phase 3 takes away. As definers they reach the old bodies in the
-- owner's right, and every decision is unchanged:
--   · the old function still decides by auth.uid() (the JWT claim survives the definer boundary);
--   · custom.assert_scope_door / custom._ctx_answer still decide by custom.caller_role() (the
--     `role` GUC, which does not move either);
--   · the organization lookups that fed _ctx_answer now read context.* without the caller's row
--     policy — they only ever run after the old function has already decided, and _ctx_answer
--     re-asks the store's ladder before it says anything;
--   · context_item_write's column branch (one UPDATE of context.context_items that used to lean on
--     the row policy context_items_update) asks that policy's own predicate by name first:
--     is_platform_admin() OR iam.has_org_admin(<the item's organization>), and refuses with the
--     same sentence a row the policy hid got before.

CREATE OR REPLACE FUNCTION custom.context_type_write(p_organization_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row jsonb;
  v_org uuid := p_organization_id;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
  v_parent uuid;
begin
  if p_type_id is null then
    if v_org is null then
      raise exception 'A new scope type needs the organization it belongs to.' using errcode = '22004';
    end if;
    perform custom.assert_scope_door(v_org, 'custom.context_type_write');
    v_row := public.create_scope_type(
      v_org, s ->> 'label_singular', s ->> 'label_plural', nullif(s ->> 'parent_type_id', '')::uuid,
      coalesce(s ->> 'icon', 'folder'), coalesce(s ->> 'description', ''),
      coalesce((s ->> 'sort_order')::smallint, 0::smallint), (s ->> 'max_assignments')::smallint,
      coalesce(array(select jsonb_array_elements_text(s -> 'default_variable_keys')), '{}'::text[]),
      s ->> 'color', nullif(s ->> 'slug', ''));
  elsif s ? 'parent_type_id' or (s ? 'max_assignments' and jsonb_typeof(s -> 'max_assignments') = 'null') then
    -- A PARENT MOVED OR A LIMIT CLEARED (lane SCOPES-OLD-WRITERS): what the agents' structure tool
    -- could always do and public.update_scope_type cannot (it COALESCEs every column and has no
    -- parent). One row write, under update_scope_type's own check, in its own sentences.
    select t.organization_id into v_org from context.scope_types t where t.id = p_type_id and t.deleted_at is null;
    if v_org is null then
      perform platform.refuse_not_found(format('active scope type %s not found', p_type_id));
    end if;
    if (auth.role() = 'service_role' or public.is_platform_admin() or iam.has_org_access(v_org)) is not true then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    perform custom.assert_scope_door(v_org, 'custom.context_type_write');
    v_parent := nullif(s ->> 'parent_type_id', '')::uuid;
    if s ? 'parent_type_id' and v_parent is not null and (
         v_parent = p_type_id
         or not exists (select 1 from context.scope_types st
                         where st.id = v_parent and st.organization_id = v_org and st.deleted_at is null)
         or exists (with recursive under as (
                      select st.id from context.scope_types st where st.parent_type_id = p_type_id
                      union
                      select st.id from context.scope_types st join under u on st.parent_type_id = u.id)
                    select 1 from under where under.id = v_parent)) then
      raise exception 'That parent is not a scope type of this organization this type can sit under.'
        using errcode = '22023',
              hint = 'A scope type''s parent is another live scope type of the same organization, and never the type itself or one of its own children.';
    end if;
    update context.scope_types t
       set parent_type_id = case when s ? 'parent_type_id' then v_parent else t.parent_type_id end,
           label_singular = coalesce(s ->> 'label_singular', t.label_singular),
           label_plural = coalesce(s ->> 'label_plural', t.label_plural),
           icon = coalesce(s ->> 'icon', t.icon),
           description = coalesce(s ->> 'description', t.description),
           sort_order = coalesce((s ->> 'sort_order')::smallint, t.sort_order),
           max_assignments_per_entity = case when s ? 'max_assignments' then (s ->> 'max_assignments')::smallint
                                             else t.max_assignments_per_entity end,
           color = coalesce(s ->> 'color', t.color),
           slug = coalesce(nullif(s ->> 'slug', ''), t.slug),
           updated_at = now()
     where t.id = p_type_id
    returning to_jsonb(t.*) into v_row;
  else
    v_row := public.update_scope_type(
      p_type_id, s ->> 'label_singular', s ->> 'label_plural', s ->> 'icon', s ->> 'description',
      (s ->> 'sort_order')::smallint, (s ->> 'max_assignments')::smallint, s ->> 'color', nullif(s ->> 'slug', ''));
    v_org := (v_row ->> 'organization_id')::uuid;
    perform custom.assert_scope_door(v_org, 'custom.context_type_write');
  end if;
  return custom._ctx_answer(coalesce(v_org, (v_row ->> 'organization_id')::uuid), (v_row ->> 'id')::uuid, v_row);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_scope_write(p_organization_id uuid, p_scope_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row jsonb;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
  v_org uuid;
  v_parent uuid;
begin
  if p_scope_id is null then
    perform custom.assert_scope_door(p_organization_id, 'custom.context_scope_write');
    v_row := public.create_scope(
      p_organization_id, p_type_id, s ->> 'name', nullif(s ->> 'parent_scope_id', '')::uuid,
      coalesce(s ->> 'description', ''), coalesce(s -> 'settings', '{}'::jsonb), nullif(s ->> 'slug', ''),
      (s ->> 'sort_order')::smallint);
  elsif s ? 'parent_scope_id' then
    -- A SCOPE MOVED UNDER ANOTHER (lane SCOPES-OLD-WRITERS): what the agents' structure tool could
    -- always do and public.update_scope cannot (it has no parent). One row write, under
    -- update_scope's own check, in its own sentence; the parent is a live scope of the same
    -- organization and never the scope itself or one of its own descendants.
    select sc.organization_id into v_org from context.scopes sc where sc.id = p_scope_id;
    if v_org is null or not (public.is_platform_admin() or iam.has_org_access(v_org)) then
      raise exception 'not authorized to update scope' using errcode = '42501',
              detail = jsonb_build_object('scope_id', p_scope_id)::text;
    end if;
    v_parent := nullif(s ->> 'parent_scope_id', '')::uuid;
    if v_parent is not null and (
         v_parent = p_scope_id
         or not exists (select 1 from context.scopes p
                         where p.id = v_parent and p.organization_id = v_org and p.deleted_at is null)
         or exists (with recursive under as (
                      select c.id from context.scopes c where c.parent_scope_id = p_scope_id
                      union
                      select c.id from context.scopes c join under u on c.parent_scope_id = u.id)
                    select 1 from under where under.id = v_parent)) then
      raise exception 'That parent is not a scope of this organization this scope can sit under.'
        using errcode = '22023',
              hint = 'A scope''s parent is another live scope of the same organization, and never the scope itself or one of its own children.';
    end if;
    update context.scopes sc
       set parent_scope_id = v_parent,
           name = coalesce(s ->> 'name', sc.name),
           description = coalesce(s ->> 'description', sc.description),
           settings = case when s ? 'settings' then coalesce(s -> 'settings', sc.settings) else sc.settings end,
           slug = coalesce(nullif(s ->> 'slug', ''), sc.slug),
           sort_order = coalesce((s ->> 'sort_order')::smallint, sc.sort_order),
           updated_at = now()
     where sc.id = p_scope_id
    returning to_jsonb(sc.*) into v_row;
    v_row := v_row || jsonb_build_object('type_label',
      (select st.label_singular from context.scope_types st where st.id = (v_row ->> 'scope_type_id')::uuid));
  else
    v_row := public.update_scope(
      p_scope_id, s ->> 'name', s ->> 'description', case when s ? 'settings' then s -> 'settings' end,
      nullif(s ->> 'slug', ''), (s ->> 'sort_order')::smallint);
  end if;
  if p_scope_id is not null then
    perform custom.assert_scope_door((v_row ->> 'organization_id')::uuid, 'custom.context_scope_write');
  end if;
  return custom._ctx_answer((v_row ->> 'organization_id')::uuid, (v_row ->> 'id')::uuid, v_row);
end;
$function$;

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
  return custom._ctx_answer(v_org, (v_row ->> 'id')::uuid, v_row);
end;
$function$;

-- The seven doors whose bodies need nothing but the owner's right to reach the old function.
ALTER FUNCTION custom.context_type_archive(uuid) SECURITY DEFINER;
ALTER FUNCTION custom.context_type_restore(uuid) SECURITY DEFINER;
ALTER FUNCTION custom.context_scope_archive(uuid) SECURITY DEFINER;
ALTER FUNCTION custom.context_scope_restore(uuid) SECURITY DEFINER;
ALTER FUNCTION custom.context_item_archive(uuid) SECURITY DEFINER;
ALTER FUNCTION custom.context_item_restore(uuid) SECURITY DEFINER;
ALTER FUNCTION custom.context_tags_set(text, uuid, uuid[]) SECURITY DEFINER;

-- The register says what each door is, truthfully.
update platform.client_callable_door d
   set reason = regexp_replace(d.reason, '^SECURITY INVOKER ', 'SECURITY DEFINER ')
                || ' (SCOPES-OLD-WRITERS 2026-09-29: a definer, so it reaches the old function in the owner''s right while clients no longer hold EXECUTE on it; the old function still decides by auth.uid(), and the door by custom.caller_role().)'
 where d.schema_name = 'custom'
   and d.function_name in ('context_type_write', 'context_type_archive', 'context_type_restore',
                           'context_scope_write', 'context_scope_archive', 'context_scope_restore',
                           'context_item_write', 'context_item_archive', 'context_item_restore',
                           'context_tags_set')
   and d.reason like 'SECURITY INVOKER %';

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 2 · S6 — THE AGENTS' STRUCTURE TOOL WRITES THROUGH THE DOORS
-- ══════════════════════════════════════════════════════════════════════════════════════════
--
-- Same arguments, same organization-admin gate first, same stable-key resolution, same receipt
-- ({organization_id, applied, results[{op, id, record}]}, each record read back from the row it
-- names). Every scope, scope type, context item and value write goes through custom.context_*;
-- the table-template operations (workbench) are untouched. Differences, each on purpose:
--   · an `id` of another organization's row is no longer "found" (it used to update nothing and
--     hand back that row); it answers like an id that does not exist;
--   · archiving a scope archives its descendants too (public.delete_scope's own rule);
--   · a value goes through the value door (store first in a store organization), which refuses in
--     its own words instead of writing a value the caller could not have written by hand.

CREATE OR REPLACE FUNCTION public.scope_system_apply(p_org_id uuid, p_operations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  op jsonb; kind text; v_id uuid; v_type_id uuid; v_parent_id uuid; v_item_id uuid; v_scope_id uuid;
  v_template_id uuid; v_row jsonb; v_results jsonb := '[]'::jsonb; v_value jsonb; v_value_type text;
  v_spec jsonb; v_answer jsonb; k text;
begin
  if iam.has_org_admin(p_org_id) is not true then
    raise exception 'organization admin required for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception 'operations must be an array' using errcode = '22023';
  end if;

  for op in select * from jsonb_array_elements(p_operations) loop
    kind := op->>'op'; v_id := null; v_type_id := null; v_parent_id := null;
    v_item_id := null; v_scope_id := null; v_template_id := null; v_row := null; v_spec := '{}'::jsonb;

    if kind = 'upsert_scope_type' then
      if op ? 'id' then
        select st.id into v_id from context.scope_types st
         where st.id = (op->>'id')::uuid and st.organization_id = p_org_id;
      end if;
      if v_id is null and not (op ? 'id') then
        select id into v_id from context.scope_types
        where organization_id = p_org_id and deleted_at is null and slug = op->>'key';
      end if;
      v_parent_id := null;
      if op ? 'parent_key' then
        select id into v_parent_id from context.scope_types
        where organization_id = p_org_id and deleted_at is null and slug = op->>'parent_key';
      end if;
      if v_id is null and not (op ? 'id') then
        v_answer := custom.context_type_write(p_org_id, null, jsonb_strip_nulls(jsonb_build_object(
          'label_singular', op->>'label_singular',
          'label_plural', coalesce(op->>'label_plural', (op->>'label_singular') || 's'),
          'parent_type_id', v_parent_id,
          'icon', coalesce(op->>'icon', 'folder'),
          'description', coalesce(op->>'description', ''),
          'color', coalesce(op->>'color', ''),
          'sort_order', coalesce((op->>'sort_order')::smallint, 0),
          'max_assignments', nullif(op->>'max_assignments', '')::smallint,
          'default_variable_keys', coalesce(op->'default_variable_keys', '[]'::jsonb),
          'slug', op->>'key')));
        v_id := (v_answer -> 'row' ->> 'id')::uuid;
      elsif v_id is not null then
        foreach k in array array['label_singular', 'label_plural', 'icon', 'description', 'color'] loop
          if op->>k is not null then v_spec := v_spec || jsonb_build_object(k, op->>k); end if;
        end loop;
        if op->>'sort_order' is not null then
          v_spec := v_spec || jsonb_build_object('sort_order', (op->>'sort_order')::smallint);
        end if;
        if op ? 'max_assignments' then
          v_spec := v_spec || jsonb_build_object('max_assignments', nullif(op->>'max_assignments', '')::smallint);
        end if;
        if op ? 'parent_key' then
          v_spec := v_spec || jsonb_build_object('parent_type_id', v_parent_id);
        end if;
        perform custom.context_type_write(p_org_id, v_id, v_spec);
      end if;
      select to_jsonb(st) into v_row from context.scope_types st where id = v_id;

    elsif kind = 'archive_scope_type' then
      select id into v_id from context.scope_types
      where organization_id = p_org_id and deleted_at is null
        and (id::text = op->>'id' or slug = op->>'key');
      if v_id is not null then
        perform custom.context_type_archive(v_id);
      end if;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    elsif kind = 'upsert_context_item' then
      v_type_id := public._scope_system_resolve_type_id(p_org_id, op, 'context item');
      if op ? 'id' then
        select ci.id into v_item_id from context.context_items ci
         where ci.id = (op->>'id')::uuid and ci.scope_type_id = v_type_id;
      else
        select id into v_item_id from context.context_items
        where scope_type_id = v_type_id and is_active and deleted_at is null and key = op->>'key';
      end if;
      if op->'reference_source'->>'container_type' = 'dataset_template' then
        if not (op->'reference_source' ? 'template_id') and op->'reference_source' ? 'template_name' then
          select id into v_template_id from workbench.udt_dataset_templates
          where organization_id = p_org_id and is_active
            and lower(name) = lower(op->'reference_source'->>'template_name');
          if v_template_id is null then
            raise exception 'table template % not found',
              op->'reference_source'->>'template_name' using errcode = '22023';
          end if;
          op := jsonb_set(op, '{reference_source,template_id}', to_jsonb(v_template_id::text), true);
        end if;
        perform context.validate_dataset_template_source(op->'reference_source', p_org_id);
      end if;
      if v_item_id is null and not (op ? 'id') then
        v_answer := custom.context_item_write(null, v_type_id, jsonb_strip_nulls(jsonb_build_object(
          'key', op->>'key',
          'display_name', coalesce(op->>'display_name', op->>'key'),
          'description', coalesce(op->>'description', ''),
          'category', op->>'category',
          'tags', coalesce(op->'tags', '[]'::jsonb),
          'value_type', coalesce(op->>'value_type', 'string'),
          'fetch_hint', coalesce(op->>'fetch_hint', 'on_demand'),
          'sensitivity', coalesce(op->>'sensitivity', 'internal'),
          'slug', coalesce(op->>'slug', op->>'key'),
          'sort_order', coalesce((op->>'sort_order')::smallint, 0),
          'allowed_reference_types', case when op ? 'allowed_reference_types' then op->'allowed_reference_types' end,
          'max_items', coalesce((op->>'max_items')::integer, 1),
          'allowed_scope_type_ids', case when op ? 'allowed_scope_type_ids' then op->'allowed_scope_type_ids' end,
          'reference_source', op->'reference_source')));
        v_item_id := (v_answer -> 'row' ->> 'id')::uuid;
        if op ? 'custom_component' and v_item_id is not null then
          perform custom.context_item_write(v_item_id, v_type_id,
            jsonb_build_object('custom_component', op->'custom_component'));
        end if;
      elsif v_item_id is not null then
        foreach k in array array['display_name', 'description', 'value_type', 'fetch_hint', 'sensitivity'] loop
          if op->>k is not null then v_spec := v_spec || jsonb_build_object(k, op->>k); end if;
        end loop;
        if op ? 'category' then v_spec := v_spec || jsonb_build_object('category', op->'category'); end if;
        if op->>'sort_order' is not null then
          v_spec := v_spec || jsonb_build_object('sort_order', (op->>'sort_order')::smallint);
        end if;
        if op->>'max_items' is not null then
          v_spec := v_spec || jsonb_build_object('max_items', (op->>'max_items')::integer);
        end if;
        foreach k in array array['allowed_reference_types', 'allowed_scope_type_ids', 'reference_source', 'custom_component'] loop
          if op ? k then v_spec := v_spec || jsonb_build_object(k, op->k); end if;
        end loop;
        if v_spec <> '{}'::jsonb then
          perform custom.context_item_write(v_item_id, v_type_id, v_spec);
        end if;
      end if;
      select to_jsonb(ci) into v_row from context.context_items ci where id = v_item_id;
      v_id := v_item_id;

    elsif kind = 'archive_context_item' then
      select ci.id into v_id
      from context.context_items ci
      join context.scope_types st on st.id = ci.scope_type_id
      where st.organization_id = p_org_id and ci.deleted_at is null
        and (ci.id::text = op->>'id' or (st.slug = op->>'scope_type_key' and ci.key = op->>'key'));
      if v_id is not null then
        perform custom.context_item_archive(v_id);
      end if;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    elsif kind = 'upsert_scope' then
      v_type_id := public._scope_system_resolve_type_id(p_org_id, op, 'scope');
      v_parent_id := null;
      if op ? 'parent_key' then
        select id into v_parent_id from context.scopes
        where organization_id = p_org_id and deleted_at is null and slug = op->>'parent_key';
      end if;
      if op ? 'id' then
        select s.id into v_scope_id from context.scopes s
         where s.id = (op->>'id')::uuid and s.organization_id = p_org_id;
      else
        select id into v_scope_id from context.scopes
        where organization_id = p_org_id and scope_type_id = v_type_id
          and deleted_at is null and slug = op->>'key';
      end if;
      if v_scope_id is null and not (op ? 'id') then
        v_answer := custom.context_scope_write(p_org_id, null, v_type_id, jsonb_strip_nulls(jsonb_build_object(
          'name', op->>'name',
          'parent_scope_id', v_parent_id,
          'description', coalesce(op->>'description', ''),
          'settings', coalesce(op->'settings', '{}'::jsonb),
          'slug', op->>'key',
          'sort_order', coalesce((op->>'sort_order')::smallint, 0))));
        v_scope_id := (v_answer -> 'row' ->> 'id')::uuid;
      elsif v_scope_id is not null then
        if op->>'name' is not null then v_spec := v_spec || jsonb_build_object('name', op->>'name'); end if;
        if op->>'description' is not null then v_spec := v_spec || jsonb_build_object('description', op->>'description'); end if;
        if op ? 'settings' then v_spec := v_spec || jsonb_build_object('settings', op->'settings'); end if;
        if op->>'sort_order' is not null then
          v_spec := v_spec || jsonb_build_object('sort_order', (op->>'sort_order')::smallint);
        end if;
        if op ? 'parent_key' then v_spec := v_spec || jsonb_build_object('parent_scope_id', v_parent_id); end if;
        perform custom.context_scope_write(p_org_id, v_scope_id, v_type_id, v_spec);
      end if;
      select to_jsonb(s) into v_row from context.scopes s where id = v_scope_id;
      v_id := v_scope_id;

    elsif kind = 'archive_scope' then
      select id into v_id from context.scopes
      where organization_id = p_org_id and deleted_at is null
        and (id::text = op->>'id' or slug = op->>'key');
      if v_id is not null then
        perform custom.context_scope_archive(v_id);
      end if;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    elsif kind = 'set_value' then
      select s.id, s.scope_type_id into v_scope_id, v_type_id
      from context.scopes s
      where s.organization_id = p_org_id and s.deleted_at is null
        and (s.id::text = op->>'scope_id' or s.slug = op->>'scope_key');
      select ci.id, ci.value_type::text into v_item_id, v_value_type
      from context.context_items ci
      where ci.scope_type_id = v_type_id and ci.is_active and ci.deleted_at is null
        and (ci.id::text = op->>'context_item_id' or ci.key = op->>'item_key');
      if v_scope_id is null or v_item_id is null then
        raise exception 'scope or context item not found for value operation' using errcode = '22023';
      end if;
      v_value := op->'value';
      v_answer := custom.context_value_write(jsonb_strip_nulls(jsonb_build_object(
        'context_item_id', v_item_id,
        'scope_id', v_scope_id,
        'value_text', case when v_value_type in ('string', 'email', 'url', 'phone', 'color', 'markdown', 'reference')
                           then v_value#>>'{}' end,
        'value_number', case when v_value_type in ('number', 'percent') then (v_value#>>'{}')::numeric end,
        'value_boolean', case when v_value_type = 'boolean' then (v_value#>>'{}')::boolean end,
        'value_json', case when v_value_type in ('object', 'array', 'currency') then v_value end,
        'value_date', case when v_value_type = 'date' then (v_value#>>'{}')::date end,
        'value_timestamp', case when v_value_type = 'datetime' then (v_value#>>'{}')::timestamptz end,
        'value_time', case when v_value_type = 'time' then (v_value#>>'{}')::time end,
        'value_document_url', case when v_value_type = 'document' then v_value#>>'{}' end,
        'change_summary', coalesce(op->>'change_summary', 'Updated by scope_system tool'),
        'source_type', 'ai_generated')));
      if coalesce((v_answer ->> 'ok')::boolean, false) is not true then
        raise exception '%', coalesce(v_answer #>> '{error,message}', 'the value could not be written')
          using errcode = case v_answer #>> '{error,code}'
                            when 'forbidden' then '42501' when 'unauthorized' then '42501'
                            when 'invalid_argument' then '22023' when 'not_found' then '22023'
                            else 'P0001' end;
      end if;
      select to_jsonb(x) into v_row from context.context_item_values x where x.id = (v_answer #>> '{data,id}')::uuid;
      v_id := v_row->>'id';

    elsif kind = 'upsert_table_template' then
      if op ? 'id' then
        v_template_id := (op->>'id')::uuid;
      else
        select id into v_template_id from workbench.udt_dataset_templates
        where organization_id = p_org_id and is_active and lower(name) = lower(op->>'name');
      end if;
      if v_template_id is null then
        insert into workbench.udt_dataset_templates (
          organization_id, name, description, created_by, updated_by
        ) values (
          p_org_id, op->>'name', coalesce(op->>'description', ''), (select auth.uid()), (select auth.uid())
        ) returning id into v_template_id;
        insert into workbench.udt_dataset_template_fields (
          template_id, field_name, display_name, data_type, field_order,
          is_required, default_value, validation_rules
        )
        select
          v_template_id, f->>'field_name', coalesce(f->>'display_name', f->>'field_name'),
          coalesce(f->>'data_type', 'string')::public.field_data_type,
          coalesce((f->>'field_order')::integer, ord::integer - 1),
          coalesce((f->>'is_required')::boolean, false),
          f->'default_value', f->'validation_rules'
        from jsonb_array_elements(coalesce(op->'fields', '[]'::jsonb)) with ordinality as x(f, ord);
      else
        update workbench.udt_dataset_templates set
          name = coalesce(op->>'name', name),
          description = coalesce(op->>'description', description),
          updated_by = (select auth.uid()),
          updated_at = now()
        where id = v_template_id and organization_id = p_org_id;
      end if;
      select to_jsonb(t) into v_row from workbench.udt_dataset_templates t where id = v_template_id;
      v_id := v_template_id;

    elsif kind = 'archive_table_template' then
      select id into v_id from workbench.udt_dataset_templates
      where organization_id = p_org_id and is_active
        and (id::text = op->>'id' or lower(name) = lower(op->>'name'));
      update workbench.udt_dataset_templates
        set is_active = false, updated_by = (select auth.uid()), updated_at = now()
      where id = v_id;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    else
      raise exception 'unknown scope-system operation %', kind using errcode = '22023';
    end if;

    if v_id is null then
      perform platform.refuse_not_found(format('operation %s did not match or create a record', kind));
    end if;
    v_results := v_results || jsonb_build_array(
      jsonb_build_object('op', kind, 'id', v_id, 'record', v_row)
    );
  end loop;

  return jsonb_build_object(
    'organization_id', p_org_id,
    'applied', jsonb_array_length(v_results),
    'results', v_results
  );
end;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 3 · S7 — THE KNOWLEDGE SYSTEM'S SUGGESTION ACCEPTS WRITE THROUGH THE DOORS
-- ══════════════════════════════════════════════════════════════════════════════════════════
--
-- Same arguments, same checks and sentences first (acting user, the suggestion is the caller's
-- and pending, the caller is a member / an owner or admin), same answer. The type, the scope,
-- each seeded value and the field go through custom.context_*. Differences, on purpose: a new
-- scope is ordered after its siblings (public.create_scope's rule) instead of at 0; a seeded value
-- the value door refuses refuses the accept in the door's words (the old insert wrote it past
-- every check). A field made from a suggestion keeps the status the old insert gave it ('stub':
-- defined, not yet filled) so nothing downstream sees it differently.

CREATE OR REPLACE FUNCTION public.accept_scope_suggestion(p_suggestion_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid           UUID := auth.uid();
  v_sugg          RECORD;
  v_org           UUID;
  v_type_id       UUID;
  v_scope_id      UUID;
  v_seeded        INT  := 0;
  v_key           TEXT;
  v_val           TEXT;
  v_item_id       UUID;
  v_answer        JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','unauthorized','message','no acting user'));
  END IF;

  SELECT * INTO v_sugg
    FROM rag.scope_suggestions
   WHERE id = p_suggestion_id AND user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','not_found','message','suggestion not found'));
  END IF;
  IF v_sugg.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','invalid_argument',
        'message','suggestion is not pending (status=' || v_sugg.status || ')'));
  END IF;

  v_org := COALESCE(p_organization_id, v_sugg.organization_id);
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','invalid_argument',
        'message','no organization: pass p_organization_id'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.organization_member om
                  WHERE om.organization_id = v_org AND om.user_id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden_org',
        'message','caller is not a member of this organization'));
  END IF;

  IF v_sugg.scope_type_id IS NOT NULL THEN
    SELECT id INTO v_type_id FROM context.scope_types
     WHERE id = v_sugg.scope_type_id AND organization_id = v_org;
  END IF;
  IF v_type_id IS NULL THEN
    SELECT id INTO v_type_id FROM context.scope_types
     WHERE organization_id = v_org
       AND (lower(label_singular) = lower(v_sugg.scope_type_label)
            OR lower(label_plural) = lower(v_sugg.scope_type_label))
     ORDER BY created_at LIMIT 1;
  END IF;
  IF v_type_id IS NULL THEN
    v_answer := custom.context_type_write(v_org, NULL, jsonb_build_object(
      'label_singular', v_sugg.scope_type_label,
      'label_plural', v_sugg.scope_type_label || 's'));
    v_type_id := (v_answer -> 'row' ->> 'id')::uuid;
  END IF;

  v_answer := custom.context_scope_write(v_org, NULL, v_type_id,
    jsonb_build_object('name', v_sugg.suggested_name));
  v_scope_id := (v_answer -> 'row' ->> 'id')::uuid;

  PERFORM context._assert_scope_readable(v_scope_id, 'editor');

  FOR v_key, v_val IN
    SELECT key, value FROM jsonb_each_text(COALESCE(v_sugg.suggested_slot_values, '{}'::jsonb))
  LOOP
    SELECT id INTO v_item_id FROM context.context_items
     WHERE scope_type_id = v_type_id AND key = v_key
       AND is_active IS DISTINCT FROM false
     LIMIT 1;
    IF v_item_id IS NOT NULL AND v_val IS NOT NULL THEN
      v_answer := custom.context_value_write(jsonb_build_object(
        'context_item_id', v_item_id,
        'scope_id', v_scope_id,
        'value_text', v_val,
        'source_type', 'ai_enriched',
        'change_summary', 'Seeded from scope suggestion ' || v_sugg.id));
      IF coalesce((v_answer ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'The suggestion''s value for "%" could not be written: %', v_key,
          coalesce(v_answer #>> '{error,message}', 'the value door refused it')
          USING ERRCODE = CASE v_answer #>> '{error,code}' WHEN 'forbidden' THEN '42501'
                                                          WHEN 'invalid_argument' THEN '22023'
                                                          ELSE 'P0001' END;
      END IF;
      v_seeded := v_seeded + 1;
    END IF;
  END LOOP;

  UPDATE rag.scope_suggestions
     SET status = 'accepted', decided_at = now(), decided_by = v_uid
   WHERE id = v_sugg.id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'scope_id', v_scope_id,
    'scope_type_id', v_type_id,
    'seeded_value_count', v_seeded));
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_context_item_suggestion(p_suggestion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       UUID := auth.uid();
  v_sugg      RECORD;
  v_type_org  UUID;
  v_item_id   UUID;
  v_created   BOOLEAN := false;
  v_answer    JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','unauthorized','message','no acting user'));
  END IF;

  SELECT * INTO v_sugg
    FROM rag.context_item_suggestions
   WHERE id = p_suggestion_id AND user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','not_found','message','suggestion not found'));
  END IF;
  IF v_sugg.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','invalid_argument',
        'message','suggestion is not pending (status=' || v_sugg.status || ')'));
  END IF;

  SELECT organization_id INTO v_type_org
    FROM context.scope_types WHERE id = v_sugg.scope_type_id;
  IF v_type_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','not_found','message','scope type not found'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM iam.organization_member om
                  WHERE om.organization_id = v_type_org AND om.user_id = v_uid
                    AND om.role IN ('owner','admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden_org',
        'message','only an org owner/admin may add context items'));
  END IF;

  SELECT id INTO v_item_id FROM context.context_items
   WHERE scope_type_id = v_sugg.scope_type_id AND key = v_sugg.suggested_key
   LIMIT 1;
  IF v_item_id IS NULL THEN
    v_answer := custom.context_item_write(NULL, v_sugg.scope_type_id, jsonb_build_object(
      'key', v_sugg.suggested_key,
      'display_name', v_sugg.display_name,
      'description', COALESCE(v_sugg.rationale, ''),
      'sort_order', 0));
    v_item_id := (v_answer -> 'row' ->> 'id')::uuid;
    PERFORM custom.context_item_write(v_item_id, v_sugg.scope_type_id, jsonb_build_object('status', 'stub'));
    v_created := true;
  END IF;

  UPDATE rag.context_item_suggestions
     SET status = 'accepted', decided_at = now(), decided_by = v_uid
   WHERE id = v_sugg.id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'context_item_id', v_item_id,
    'created', v_created));
END;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 4 · S8 — A CLASS'S JOIN CODE AND ACCESS MODE ARE WRITTEN THROUGH THE SCOPE DOOR
-- ══════════════════════════════════════════════════════════════════════════════════════════
--
-- Same arguments, same checks and sentences first (signed in, a valid action / mode, the class
-- exists, the caller owns it), same answer. The settings are still merged into the class row's
-- own settings (read under a row lock, never a copy written back), and the whole merged settings
-- go through custom.context_scope_write, whose update_scope check (a member of the class's
-- organization, or a platform admin) every class owner meets (measured 2026-09-29: 37 of 37
-- class owners are members of their class's organization).

CREATE OR REPLACE FUNCTION public.edu_class_join_code(p_class uuid, p_action text DEFAULT 'get'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope public._edu_class_row;
  v_uid uuid := (select auth.uid());
  v_code text;
  v_settings jsonb;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_action not in ('get', 'rotate', 'disable') then
    raise exception 'invalid action %', p_action using errcode = '22023';
  end if;
  v_scope := public._edu_class_of(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'class owner required' using errcode = '42501';
  end if;

  v_code := v_scope.settings->>'join_code';

  if p_action = 'disable' then
    select coalesce(sc.settings, '{}'::jsonb) into v_settings from context.scopes sc where sc.id = v_scope.id for update;
    perform custom.context_scope_write(v_scope.organization_id, v_scope.id, null,
      jsonb_build_object('settings', coalesce(v_settings, '{}'::jsonb) - 'join_code'));
    return jsonb_build_object('code', null);
  end if;

  if p_action = 'rotate' or v_code is null then
    v_code := public._edu_generate_join_code();
    select coalesce(sc.settings, '{}'::jsonb) into v_settings from context.scopes sc where sc.id = v_scope.id for update;
    perform custom.context_scope_write(v_scope.organization_id, v_scope.id, null,
      jsonb_build_object('settings', jsonb_set(coalesce(v_settings, '{}'::jsonb), '{join_code}', to_jsonb(v_code))));
  end if;

  return jsonb_build_object('code', v_code);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_set_access(p_class uuid, p_access_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope public._edu_class_row; v_settings jsonb;
begin
  if p_access_mode not in ('open', 'closed', 'paid') then
    raise exception 'invalid access_mode %', p_access_mode using errcode = '22023';
  end if;
  v_scope := public._edu_class_of(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can change access mode' using errcode = '42501';
  end if;
  -- The write merges into the row's own settings (SCOPES-READS-ACCESS) and goes through the scope
  -- door (SCOPES-OLD-WRITERS): the class is read from the store, and a copy of its settings is never
  -- written back over the old row.
  select coalesce(sc.settings, '{}'::jsonb) into v_settings from context.scopes sc where sc.id = v_scope.id for update;
  perform custom.context_scope_write(v_scope.organization_id, v_scope.id, null,
    jsonb_build_object('settings', coalesce(v_settings, '{}'::jsonb) || jsonb_build_object('access_mode', p_access_mode)));
  perform public._edu_ensure_owner_membership(v_scope);
  return jsonb_build_object('status', 'ok', 'access_mode', p_access_mode);
end;
$function$;
