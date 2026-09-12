-- platform_registry_admin_shows_class_dd137b8a_restore_columns — FIVE COLUMNS THE ADMIN SCREEN
-- READS WERE DROPPED BY DD-137b8. A defect this lane found in its own work, minutes after shipping
-- it, and it is the exact class this workspace's migration rules exist to prevent.
--
-- WHAT HAPPENED. `public.admin_entity_types_list()` could not have its row type changed in place
-- (42P13), so DD-137b8 dropped and recreated it — FROM THE COLUMN LIST IN THE ORIGINAL MIGRATION
-- FILE, `migrations/entity_types_admin_rpcs.sql`. But the LIVE function had moved on since that
-- file was written: a later migration had added `agent_writable`, `content_role`,
-- `reference_category`, `reference_pickable` and `title_column`, and the generated
-- `types/database.types.ts` proves it (the `admin_entity_types_list` Returns block lists all five).
-- Recreating from the file therefore DELETED five columns the live admin screen renders —
-- `EntityTypesClient.tsx` reads `row.agent_writable`, `row.reference_pickable`, `row.title_column`
-- and `row.content_role` directly.
--
-- 🚨 THE RULE THIS BREAKS, RESTATED SO IT IS NOT LEARNED TWICE: THE DATABASE IS THE SOURCE OF
-- TRUTH, NOT THE FILES. A migration that rebuilds an object must rebuild it from the LIVE
-- definition (`pg_get_functiondef`), never from the last file that happened to create it — the same
-- lesson DD-137b7 had already learned about parameter defaults, one file earlier, in this same
-- lane. The restore below is written from the generated types, which ARE a projection of the live
-- catalogue, and the assertion at the bottom checks every one of the five by name.
DROP FUNCTION IF EXISTS public.admin_entity_types_list();
CREATE OR REPLACE FUNCTION public.admin_entity_types_list()
RETURNS TABLE (
  token text, schema_name text, table_name text, label text,
  base_tier smallint, is_versioned boolean, has_soft_delete boolean,
  is_listed boolean, is_component boolean, is_module boolean,
  category text, default_scopeable boolean,
  default_visibility text, default_members_can_add boolean,
  default_needs_approval boolean, default_auto_ingest boolean,
  rls_variant text, table_ref text,
  is_active boolean, notes text,
  -- restored: added to the live function after entity_types_admin_rpcs.sql was written
  agent_writable boolean, content_role text, reference_category text,
  reference_pickable boolean, title_column text,
  -- DD-137b: the two axes, and the lane the class closes
  data_class text, data_class_reason text, default_list_scope text,
  suppress_platform_admin_lane boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.token, e.schema_name, e.table_name, e.label,
         e.base_tier, e.is_versioned, e.has_soft_delete,
         e.is_listed, e.is_component, e.is_module,
         e.category, e.default_scopeable,
         e.default_visibility::text, e.default_members_can_add,
         e.default_needs_approval, e.default_auto_ingest,
         e.rls_variant, e.table_ref::text,
         e.is_active, e.notes,
         e.agent_writable, e.content_role, e.reference_category,
         e.reference_pickable, e.title_column,
         e.data_class::text, e.data_class_reason, e.default_list_scope::text,
         e.suppress_platform_admin_lane
  FROM platform.entity_types e
  WHERE public.is_super_admin()
  ORDER BY e.is_active DESC, e.token;
$$;

REVOKE ALL ON FUNCTION public.admin_entity_types_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_entity_types_list() TO authenticated, service_role;

do $$
declare v_res text; v_col text;
begin
  select pg_get_function_result(p.oid) into v_res from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_entity_types_list';
  -- Every column the live screen reads, by name. A list is only a guard if it is the WHOLE list.
  foreach v_col in array array[
    'token text','schema_name text','table_name text','label text','base_tier smallint',
    'is_versioned boolean','has_soft_delete boolean','is_listed boolean','is_component boolean',
    'is_module boolean','category text','default_scopeable boolean','default_visibility text',
    'default_members_can_add boolean','default_needs_approval boolean','default_auto_ingest boolean',
    'rls_variant text','table_ref text','is_active boolean','notes text',
    'agent_writable boolean','content_role text','reference_category text',
    'reference_pickable boolean','title_column text',
    'data_class text','data_class_reason text','default_list_scope text',
    'suppress_platform_admin_lane boolean']
  loop
    if position(v_col in v_res) = 0 then
      raise exception 'dd137b8a: admin_entity_types_list is missing %. The admin screen renders it.', v_col;
    end if;
  end loop;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='admin_entity_types_list'
                    and p.prosrc like '%is_super_admin()%') then
    raise exception 'dd137b8a: the super-admin gate was lost';
  end if;
  raise notice 'dd137b8a: all 29 columns restored, the gate intact';
end $$;
