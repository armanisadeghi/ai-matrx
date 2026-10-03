-- chair-step: inverse of migrations/campaign/lane7w5d_mkt_initiative_list_carries_custom_fields.sql — drops public.mkt_initiative_list_scoped and re-creates
-- production's body without custom_fields, byte for byte, and its grants.
-- based-on: public.mkt_initiative_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) c06aaffdcf2e78f875d695752b92a0e5a6d1e6294e7984c1d9d0652a12cba281

set local lock_timeout = '3s';

DROP FUNCTION IF EXISTS public.mkt_initiative_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer);

CREATE OR REPLACE FUNCTION public.mkt_initiative_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated_at'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, description text, brand_id uuid, brand_name text, status text, objective text, goal text, starts_on date, ends_on date, budget_amount numeric, budget_currency text, organization_id uuid, created_by uuid, visibility text, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid(); v_ctx jsonb; v_scope text:=lower(coalesce(p_scope, platform.entity_default_list_scope('marketing_initiative')));
  v_sort text:=lower(coalesce(p_sort,'updated_at')); v_f jsonb:=coalesce(p_filters,'{}');
  v_search text:=nullif(btrim(coalesce(p_search,'')),'');
begin
  -- The Shown-to context is read only by the organization / team lanes (per-row
  -- platform.shown_to_lists); every other lane never looks at it, so it is not built for them
  -- (lib/list-scope/FEATURE.md, invariant 10).
  IF v_scope IN ('orgs', 'team', 'all') THEN
    v_ctx := platform.shown_to_context('marketing_initiative');
  END IF;
  if v_uid is null then raise exception 'mkt_initiative_list_scoped: not authenticated'; end if;
  if v_scope not in ('mine','team','orgs','shared','public','all') then raise exception 'unknown scope %',v_scope; end if;
  if v_sort not in ('name','description','brand_name','status','objective','goal','starts_on','ends_on','budget_amount','budget_currency','created_at','updated_at') then v_sort:='updated_at'; end if;
  return query with scoped as (
    select i.* from marketing.initiative i where v_scope in ('mine','all') and i.created_by=v_uid
    union select i.* from marketing.initiative i where v_scope IN ('orgs','team','all')
      and (p_org_id is null or i.organization_id = p_org_id) and i.organization_id in (select iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (i.organization_id, i.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND platform.shown_to_lists(i.shown_to, i.visibility, i.created_by, i.organization_id, v_uid, v_ctx)
    union select i.* from marketing.initiative i join iam.permissions p on p.resource_type='marketing_initiative' and p.resource_id=i.id
      where v_scope in ('shared','all') and i.created_by is distinct from v_uid and (p.granted_to_user_id=v_uid or p.granted_to_organization_id in (
        select om.organization_id from iam.organization_member om where om.user_id=v_uid
      ))
    union select i.* from marketing.initiative i where v_scope='public' and i.created_by is distinct from v_uid and i.visibility='public'
  ), joined as (select s.*,b.name b_name from scoped s left join web.brand b on b.id=s.brand_id where s.deleted_at is null and (p_org_id is null or s.organization_id = p_org_id)),
  filtered as (select j.*,public.mkt_initiative_search_score(v_search,j.id,j.name,j.description,j.goal,j.b_name) score
    from joined j where (v_search is null or public.mkt_initiative_search_score(v_search,j.id,j.name,j.description,j.goal,j.b_name)>0)
    and (not v_f?'name' or j.name ilike '%'||(v_f->'name'->>'value')||'%')
    and (not v_f?'description' or coalesce(j.description,'') ilike '%'||(v_f->'description'->>'value')||'%')
    and (not v_f?'brand_name' or coalesce(j.b_name,'') in (select jsonb_array_elements_text(v_f->'brand_name'->'values')))
    and (not v_f?'status' or j.status in (select jsonb_array_elements_text(v_f->'status'->'values')))
    and (not v_f?'objective' or j.objective in (select jsonb_array_elements_text(v_f->'objective'->'values')))
    and (not v_f?'goal' or coalesce(j.goal,'') ilike '%'||(v_f->'goal'->>'value')||'%')
    and (not v_f?'budget_currency' or j.budget_currency in (select jsonb_array_elements_text(v_f->'budget_currency'->'values')))
    and (not v_f?'starts_on' or j.starts_on>=public.mkt_initiative_since_bucket(v_f->'starts_on'->'values'->>0)::date)
    and (not v_f?'ends_on' or j.ends_on>=public.mkt_initiative_since_bucket(v_f->'ends_on'->'values'->>0)::date)
    and (not v_f?'created_at' or j.created_at>=public.mkt_initiative_since_bucket(v_f->'created_at'->'values'->>0))
    and (not v_f?'updated_at' or j.updated_at>=public.mkt_initiative_since_bucket(v_f->'updated_at'->'values'->>0))
    and (not v_f?'budget_amount' or case v_f->'budget_amount'->'values'->>0 when 'none' then j.budget_amount is null when 'lt1k' then j.budget_amount<1000 when '1k-10k' then j.budget_amount>=1000 and j.budget_amount<10000 when '10k+' then j.budget_amount>=10000 else true end)
  ), counted as (select f.*,count(*) over() n from filtered f)
  select c.id,c.name,c.description,c.brand_id,c.b_name,c.status,c.objective,c.goal,c.starts_on,c.ends_on,c.budget_amount,c.budget_currency,c.organization_id,c.created_by,c.visibility::text,c.version,c.created_at,c.updated_at,c.n
  from counted c order by
    case when v_search is not null then c.score end desc,
    case when v_sort='name' and lower(p_dir)='asc' then c.name end asc, case when v_sort='name' and lower(p_dir)<>'asc' then c.name end desc,
    case when v_sort='description' and lower(p_dir)='asc' then c.description end asc, case when v_sort='description' and lower(p_dir)<>'asc' then c.description end desc,
    case when v_sort='brand_name' and lower(p_dir)='asc' then c.b_name end asc, case when v_sort='brand_name' and lower(p_dir)<>'asc' then c.b_name end desc,
    case when v_sort='status' and lower(p_dir)='asc' then c.status end asc, case when v_sort='status' and lower(p_dir)<>'asc' then c.status end desc,
    case when v_sort='objective' and lower(p_dir)='asc' then c.objective end asc, case when v_sort='objective' and lower(p_dir)<>'asc' then c.objective end desc,
    case when v_sort='goal' and lower(p_dir)='asc' then c.goal end asc, case when v_sort='goal' and lower(p_dir)<>'asc' then c.goal end desc,
    case when v_sort='starts_on' and lower(p_dir)='asc' then c.starts_on end asc, case when v_sort='starts_on' and lower(p_dir)<>'asc' then c.starts_on end desc,
    case when v_sort='ends_on' and lower(p_dir)='asc' then c.ends_on end asc, case when v_sort='ends_on' and lower(p_dir)<>'asc' then c.ends_on end desc,
    case when v_sort='budget_amount' and lower(p_dir)='asc' then c.budget_amount end asc, case when v_sort='budget_amount' and lower(p_dir)<>'asc' then c.budget_amount end desc,
    case when v_sort='budget_currency' and lower(p_dir)='asc' then c.budget_currency end asc, case when v_sort='budget_currency' and lower(p_dir)<>'asc' then c.budget_currency end desc,
    case when v_sort='created_at' and lower(p_dir)='asc' then c.created_at end asc, case when v_sort='created_at' and lower(p_dir)<>'asc' then c.created_at end desc,
    case when v_sort='updated_at' and lower(p_dir)='asc' then c.updated_at end asc, case when v_sort='updated_at' and lower(p_dir)<>'asc' then c.updated_at end desc,c.id
  limit greatest(1,least(p_limit,200)) offset greatest(p_offset,0);
end $function$;

GRANT EXECUTE ON FUNCTION public.mkt_initiative_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) TO authenticated, service_role;
