-- Widen `public.cat_list` to also return `metadata` (additive; every consumer
-- selects named fields). Needed because category rows CARRY semantics now:
-- `deal_pipeline` stages store `{outcome: won|lost, probability}` in metadata
-- (crm_11_deals_pipelines.sql) and the canonical category reader must serve it —
-- the alternative was a bespoke direct `platform.categories` read, which the
-- CategorySelect convention forbids.
--
-- Return-type change requires DROP + CREATE; grants restated (they do not
-- survive the drop). APPLIED LIVE 2026-08-20 and ledgered.

drop function if exists public.cat_list(text);

create function public.cat_list(p_dimension text default null)
returns table(
  id uuid, organization_id uuid, dimension text, name text, slug text,
  parent_id uuid, is_system boolean, color text, icon text, "position" integer,
  metadata jsonb)
language sql stable security definer set search_path to 'public' as $function$
  select id, organization_id, dimension, name, slug, parent_id, is_system, color, icon, "position", metadata
    from platform.categories
   where deleted_at is null
     and (visibility = 'public'::platform.visibility
          or iam.has_org_access(organization_id))
     and (p_dimension is null or dimension = p_dimension)
   order by dimension, "position" nulls last, name;
$function$;

grant execute on function public.cat_list(text) to anon, authenticated, service_role;
