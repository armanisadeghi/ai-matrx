-- based-on: context.provision_scope_dataset(uuid, uuid) 69835aad613d96ca7b77d2033801b6b6c7bd2b8349786f7144aee3485835372a
-- based-on: public.list_udt_dataset_templates(uuid) e5bae9fa425b803cc41699aeaec98a05060175b5e67231835f5a5015fe3021fd
--
-- A PLATFORM TABLE TEMPLATE, usable by every organization.
--
-- `workbench.udt_dataset_templates` is org-scoped, and both doors read it
-- org-exactly: `provision_scope_dataset` REFUSES a template whose
-- organization_id is not the scope's, and `list_udt_dataset_templates` returns
-- only the caller org's rows — so the "Per-scope table template" picker in the
-- context-item form shows nothing at all to an organization that has not
-- authored its own. That makes a platform starter kit impossible to ship, which
-- is the same gap the 34 scope templates in `context.templates` solved by being
-- global.
--
-- The narrowest fix that keeps the tenancy boundary intact: BOTH doors also
-- accept the SYSTEM organization's templates (39c38960-d30c-4840-b0c1-c9960de95582),
-- and nothing else. A third organization's template is refused exactly as
-- before. Rows still land in the scope's own organization: the provisioner
-- copies the template's FIELDS and writes `v_scope.organization_id` on the
-- dataset and every field, so no data crosses a tenant.
--
-- `list_udt_dataset_templates` keeps its `iam.has_org_access` gate unchanged —
-- this widens WHICH TEMPLATES a caller sees, never WHICH ORGANIZATION a caller
-- may ask about — and marks each row `is_platform` so a picker can group them.

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
  -- A template belongs either to the scope's own organization, or to the
  -- PLATFORM (the system organization) — a platform starter kit such as "Known
  -- defects" is authored once and used by every organization, exactly like the
  -- 34 scope templates. Any third organization's template is still refused.
  if not found or v_template.organization_id not in (
       v_scope.organization_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid) then
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

create or replace function public.list_udt_dataset_templates(p_org_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if iam.has_org_access(p_org_id) is not true then raise exception 'not authorized for organization %',p_org_id using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t)
      || jsonb_build_object('is_platform', t.organization_id <> p_org_id)
      || jsonb_build_object('fields',coalesce((
      select jsonb_agg(to_jsonb(f) order by f.field_order) from workbench.udt_dataset_template_fields f where f.template_id=t.id
    ),'[]'::jsonb)) order by (t.organization_id <> p_org_id), lower(t.name))
    from workbench.udt_dataset_templates t
   where t.organization_id in (p_org_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
     and t.is_active),'[]'::jsonb);
end; $function$;
