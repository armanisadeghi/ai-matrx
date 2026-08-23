-- 2026-08-23 — public.industry_assign_org / _unassign_org insert into
-- rag.library_audit_log(..., organization_id, ...) — a column that does not exist on that
-- table (it is `target_organization_id`). Every assign/unassign therefore raised 42703, so
-- the Shared Knowledge console's "Assign an organization" button and the org-settings
-- industry picker have been dead. Same class as the `_library_assert_super_admin` repair:
-- an audit insert left pointing at a renamed column. Bodies restated verbatim except the
-- audit column, and both now route through public._library_audit so there is ONE writer.
-- Applied live via Supabase MCP as industry_org_assignment_audit_column_repair_2026_08_23.

create or replace function public.industry_assign_org(p_organization_id uuid, p_industry_id uuid,
       p_is_primary boolean default false, p_actor uuid default null)
returns iam.org_industries language plpgsql security definer set search_path to 'public' as $function$
declare v_actor uuid; v_row iam.org_industries;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'not authenticated'; end if;
  if not public.is_super_admin() and not public.is_org_admin(p_organization_id) then
    raise exception 'not authorized: org admin or super admin required';
  end if;
  if p_is_primary then
    update iam.org_industries set is_primary = false
     where organization_id = p_organization_id and is_primary;
  end if;
  insert into iam.org_industries(organization_id, industry_id, is_primary, assigned_by)
  values (p_organization_id, p_industry_id, p_is_primary, v_actor)
  on conflict (organization_id, industry_id) do update set is_primary = excluded.is_primary
  returning * into v_row;
  perform public._library_audit(v_actor, 'industry_assign', null, null, p_industry_id,
                                p_organization_id, jsonb_build_object('is_primary', p_is_primary));
  return v_row;
end; $function$;

create or replace function public.industry_unassign_org(p_organization_id uuid, p_industry_id uuid,
       p_actor uuid default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'not authenticated'; end if;
  if not public.is_super_admin() and not public.is_org_admin(p_organization_id) then
    raise exception 'not authorized: org admin or super admin required';
  end if;
  delete from iam.org_industries
   where organization_id = p_organization_id and industry_id = p_industry_id;
  perform public._library_audit(v_actor, 'industry_unassign', null, null, p_industry_id,
                                p_organization_id, '{}'::jsonb);
end; $function$;

do $assert$
declare v_n integer;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog','information_schema','graveyard') and p.prokind = 'f'
     and pg_get_functiondef(p.oid) ilike '%library_audit_log(actor_user_id, action, industry_id, organization_id%';
  if v_n <> 0 then raise exception 'still % functions writing the non-existent audit column', v_n; end if;
end $assert$;
