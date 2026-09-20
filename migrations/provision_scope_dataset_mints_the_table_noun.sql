-- based-on: context.provision_scope_dataset(uuid, uuid) 202266f808475abc8948fd72129d28d499d44f9d4d8111b222c4d149632125b3
--
-- THE FENCE NAMED THE WRONG NOUN, so a scope's table reached the agent as a
-- sentence instead of as its rows.
--
-- `context.provision_scope_dataset` writes the scope's context value as a
-- reference fence, and it minted `directive_v1_reference_dataset`. In the
-- reference registry (aidream `services/references/__init__.py`) the noun
-- `dataset` is a RecordRef — "Pointer to one Data Table row by id" — resolved
-- by the generic `_render_record`, whose heading fields do not even include
-- `table_name`. So the prompt received the dataset's DESCRIPTION string.
--
-- The noun that expands to rows is `table`: `TableRef{table_id, table_name?}`
-- → `UdtTableResolver.resolve_table` → `fetch_full_table(limit=100)` → one
-- "col: val | col: val" line per row. That is the whole point of holding a
-- table per scope, so this replaces the minted noun with `table` and gives the
-- item the fields that model declares.
--
-- Nobody hit this because nobody could: `context.scope_dataset_instances` and
-- `workbench.udt_dataset_templates` both held ZERO rows until today — the
-- per-scope table path was built, trigger-wired and never once exercised. It
-- is exercised now by the "Known defects" template, which is exactly why it
-- had to be right before anyone depends on it.
--
-- Everything else in this body is byte-identical to the live definition
-- (0522_kind_directives_context_fns.sql). In particular the fence is still
-- built as TEXT with `__kind` FIRST, because jsonb normalizes key order at rest
-- and would silently destroy the first-key streaming read.
--
-- Existing values: none exist to migrate (zero instances). A value written by
-- the old body would keep pointing at the dataset noun; re-provisioning is a
-- no-op that returns the existing dataset id without rewriting the value, so if
-- one ever turns up it is rewritten by hand, not by a sweep this file does not
-- need.

create or replace function context.provision_scope_dataset(p_item_id uuid, p_scope_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_item context.context_items; v_scope context.scopes; v_template workbench.udt_dataset_templates;
  v_dataset_id uuid; v_owner uuid; v_fence text; v_label text;
begin
  select * into v_item from context.context_items where id=p_item_id and is_active and deleted_at is null;
  select * into v_scope from context.scopes where id=p_scope_id and deleted_at is null;
  if not found or v_item.id is null or v_item.scope_type_id <> v_scope.scope_type_id then return null; end if;
  if v_item.reference_source->>'container_type' <> 'dataset_template' then return null; end if;
  select * into v_template from workbench.udt_dataset_templates
   where id=(v_item.reference_source->>'template_id')::uuid and is_active;
  if not found or v_template.organization_id <> v_scope.organization_id then
    raise exception 'dataset template binding is invalid for context item %', p_item_id using errcode='22023';
  end if;
  select dataset_id into v_dataset_id from context.scope_dataset_instances
   where context_item_id=p_item_id and scope_id=p_scope_id;
  if v_dataset_id is not null then return v_dataset_id; end if;
  v_owner := coalesce(auth.uid(), v_scope.created_by, v_item.created_by, v_template.created_by);
  if v_owner is null then raise exception 'cannot provision template dataset without an owner' using errcode='23502'; end if;
  v_label := v_scope.name || ' — ' || v_item.display_name;
  perform set_config('app.udt_template_provisioning','on',true);
  insert into workbench.udt_datasets (
    table_name, description, user_id, organization_id, validation_mode,
    template_id, template_version, created_by, updated_by
  ) values (
    v_label,
    'Template-backed context table for ' || v_scope.name || ' / ' || v_item.display_name,
    v_owner, v_scope.organization_id, 'strict', v_template.id, v_template.version, v_owner, v_owner
  ) returning id into v_dataset_id;
  insert into workbench.udt_dataset_fields (
    table_id, field_name, display_name, data_type, field_order, is_required,
    default_value, validation_rules, user_id, organization_id, created_by, updated_by
  ) select v_dataset_id, f.field_name, f.display_name, f.data_type, f.field_order,
      f.is_required, f.default_value, f.validation_rules, v_owner, v_scope.organization_id, v_owner, v_owner
    from workbench.udt_dataset_template_fields f where f.template_id=v_template.id order by f.field_order;
  insert into context.scope_dataset_instances (
    context_item_id, scope_id, dataset_id, template_id, template_version, created_by
  ) values (p_item_id, p_scope_id, v_dataset_id, v_template.id, v_template.version, v_owner)
  on conflict (context_item_id, scope_id) do nothing;
  -- Kind Directives two-key shell — __kind FIRST (jsonb normalizes key order at
  -- rest, so the fence is built as TEXT to preserve first-key streaming reads).
  -- The noun is `table`, whose resolver expands the reference to the table's
  -- ROWS; `dataset` is a record pointer and renders the row's description.
  v_fence := '```matrx' || chr(10)
    || '{"__kind":"directive_v1_reference_table","items":'
    || jsonb_build_array(jsonb_build_object('table_id',v_dataset_id,'table_name',v_label,'label',v_label))::text
    || '}' || chr(10) || '```';
  perform context.write_context_value(
    p_item_id=>p_item_id, p_scope_id=>p_scope_id, p_value_text=>v_fence,
    p_change_summary=>'Provisioned template-backed dataset', p_source_type=>'system', p_actor=>v_owner
  );
  return v_dataset_id;
end; $function$;
