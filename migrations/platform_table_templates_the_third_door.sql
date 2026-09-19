-- based-on: context.validate_dataset_template_source(jsonb, uuid) 4a2a95f7a6a71d2b91fb79bbc7d8efacae8f0e4c8bb72c7dcdeb74caa3d05c5e
--
-- THE THIRD DOOR onto workbench.udt_dataset_templates, found by walking the
-- path rather than by reading it: `platform_table_templates_reach_every_org.sql`
-- widened the picker and the provisioner, and creating the context item STILL
-- refused with "active dataset template % not found in organization %" — because
-- `create_context_item` validates the binding through this function, which reads
-- the template org-exactly too.
--
-- Same widening, same boundary: a template belongs either to the organization
-- the context item's scope type is in, or to the PLATFORM (the system
-- organization). A third organization's template is refused exactly as before.
-- The dimension/provision rules are untouched.
--
-- This is the class, not the instance: three doors read one org-scoped table
-- and all three had to learn the same sentence. There is no fourth — these are
-- every reader of `udt_dataset_templates` that gates on organization_id
-- (`select … from workbench.udt_dataset_templates` appears in exactly
-- `provision_scope_dataset`, `list_udt_dataset_templates`,
-- `validate_dataset_template_source` and `scope_system_apply`, and the last one
-- CREATES templates rather than reading one by id).

create or replace function context.validate_dataset_template_source(p_source jsonb, p_org_id uuid)
 returns uuid
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v_template_id uuid;
begin
  if p_source is null or p_source->>'container_type' <> 'dataset_template' then return null; end if;
  if coalesce(p_source->>'dimension', 'whole') <> 'whole'
     or coalesce(p_source->>'provision', 'per_scope') <> 'per_scope' then
    raise exception 'dataset_template references require dimension=whole and provision=per_scope' using errcode = '22023';
  end if;
  begin v_template_id := (p_source->>'template_id')::uuid;
  exception when others then raise exception 'dataset_template reference requires a valid template_id' using errcode = '22023'; end;
  -- The organization's own template, or a PLATFORM one (the system
  -- organization). Nothing else.
  if not exists (
    select 1 from workbench.udt_dataset_templates t
    where t.id = v_template_id
      and t.organization_id in (p_org_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
      and t.is_active
  ) then raise exception 'active dataset template % is neither this organization''s nor a platform template', v_template_id using errcode = '22023'; end if;
  return v_template_id;
end; $function$;

-- The access decision, IN DATA (platform.provision_shape_guard refuses a
-- SECURITY DEFINER function that reaches COMMIT without one). This helper has
-- no client surface at all: it is called only from inside
-- public.create_context_item / update_context_item, which do their own
-- org-admin check on the scope type's organization before calling it, and it
-- is a STABLE validator that returns a uuid and writes nothing.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('context', 'validate_dataset_template_source', 'p_source jsonb, p_org_id uuid',
   ARRAY['jsonb'::regtype, 'uuid'::regtype]::oid[],
   'p_org_id is not trusted from a caller: public.create_context_item passes the organization it resolved from the scope type AFTER its own org-admin check, and this function only answers whether p_source names an active template belonging to that organization or to the system organization (the platform starter kits). p_source is inert jsonb. NULL p_source, or a p_source that is not a dataset_template reference, returns NULL rather than raising.',
   'list-change-proposals / platform table templates',
   'server_only: reached only from inside public.create_context_item and public.update_context_item, which gate on org-admin of the scope type''s organization first; no client role holds EXECUTE and no client surface has any reason to validate a binding it is not simultaneously writing.',
   false, false)
on conflict do nothing;
