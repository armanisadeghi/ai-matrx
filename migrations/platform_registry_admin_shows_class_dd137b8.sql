-- platform_registry_admin_shows_class_dd137b8 — THE REGISTRY ADMIN SHOWS THE CLASS (DD-137b, step 7).
--
-- The brief's words: "the settings screen shows `data_class` and `default_list_scope` per table
-- (platform admin) through the EXISTING registry admin surface, never a new one." That surface is
-- `/administration/database/relationships/entity-types`, fed by `public.admin_entity_types_list()`.
-- This adds four columns to that one RPC and nothing else.
--
-- 🚨 SHOWN, NOT EDITED, AND THAT IS DELIBERATE. `admin_upsert_entity_type` is NOT extended here.
-- A data_class change fires `platform._entity_types_class_regenerates` and rewrites that table's
-- RLS policies IN THE SAME COMMIT (DD-137b3, §3.2 interlock four) — an expensive, security-shaped
-- act that belongs in a migration with an access delta beside it (`iam.access_delta_snapshot` +
-- `iam.access_delta_assert_no_widening`), not behind a dropdown on an admin table. A control that
-- silently re-runs the generator on a live table is exactly the click the destructive-and-expensive
-- actions law exists to stop, and the honest version of it is a screen that says so.
--
-- `suppress_platform_admin_lane` rides along because it is the visible consequence of the class:
-- it is how a reader of that screen can see that OUR OWN STAFF have no standing read of this table,
-- which had zero UI anywhere on the platform before this file.
-- The row type grows, and Postgres refuses to change a set-returning function's row type in
-- place, so the function is dropped and recreated in this one transaction. Its only caller is the
-- admin page's server component (`supabase.rpc("admin_entity_types_list")`), and the GRANT is
-- re-issued below — there is no window in which the screen has a function it cannot execute.
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
  -- DD-137b: the two axes, and the lane the class closes.
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
         e.data_class::text, e.data_class_reason, e.default_list_scope::text,
         e.suppress_platform_admin_lane
  FROM platform.entity_types e
  WHERE public.is_super_admin()
  ORDER BY e.is_active DESC, e.token;
$$;

REVOKE ALL ON FUNCTION public.admin_entity_types_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_entity_types_list() TO authenticated, service_role;

do $$
declare v_n integer; v_res text;
begin
  -- 🚨 THE ASSERTION CANNOT CALL THE RPC AND GET ROWS, AND THAT IS THE RPC WORKING. It is gated
  -- `WHERE public.is_super_admin()`, and this migration runs as the ledger's owner with no JWT at
  -- all — so it reads zero rows, exactly as any non-super-admin would. Asserting on a row count
  -- here would have meant loosening the gate to prove the gate. So: the SIGNATURE is asserted from
  -- the catalogue, and the DATA is asserted from the table the RPC projects.
  select pg_get_function_result(p.oid) into v_res from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_entity_types_list';
  if v_res is null then raise exception 'dd137b8: admin_entity_types_list is gone'; end if;
  if v_res not like '%data_class text%' or v_res not like '%data_class_reason text%'
     or v_res not like '%default_list_scope text%'
     or v_res not like '%suppress_platform_admin_lane boolean%' then
    raise exception 'dd137b8: the admin registry RPC does not project the class: %', v_res;
  end if;

  select count(*) into v_n from platform.entity_types
   where is_active and data_class is not null and default_list_scope is not null;
  if v_n < 300 then
    raise exception 'dd137b8: only % registry rows carry a class for that screen to show', v_n;
  end if;

  select count(*) into v_n from platform.entity_types
   where token = 'conversation' and data_class = 'private'
     and default_list_scope = 'mine' and suppress_platform_admin_lane;
  if v_n <> 1 then
    raise exception 'dd137b8: conversation is not private / mine-scoped / staff-lane-closed';
  end if;

  -- the gate itself is still there
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='admin_entity_types_list'
                    and p.prosrc like '%is_super_admin()%') then
    raise exception 'dd137b8: the super-admin gate was lost in the rewrite';
  end if;

  raise notice 'dd137b8: the registry admin surface can see the class, and only a super admin can';
end $$;
