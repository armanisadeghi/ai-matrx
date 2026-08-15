-- Initiative list RPCs + sharing registration. The table already exists.

create or replace function public.mkt_initiative_since_bucket(p_bucket text)
returns timestamptz language sql stable as $$
  select case p_bucket when '24h' then now()-interval '24 hours'
    when '7d' then now()-interval '7 days' when '30d' then now()-interval '30 days'
    when '90d' then now()-interval '90 days' when '1y' then now()-interval '1 year' end
$$;

create or replace function public.mkt_initiative_search_score(
  p_query text, p_id uuid, p_name text, p_description text, p_goal text, p_brand text
) returns integer language sql immutable as $$
  select case
    when nullif(btrim(p_query),'') is null then 0
    when lower(p_id::text)=lower(p_query) then 100000
    when lower(coalesce(p_name,''))=lower(p_query) then 10000
    when lower(coalesce(p_name,'')) like lower(p_query)||'%' then 5000
    when lower(coalesce(p_name,'')) like '%'||lower(p_query)||'%' then 2000
    when lower(coalesce(p_description,'')) like '%'||lower(p_query)||'%' then 500
    when lower(coalesce(p_goal,'')) like '%'||lower(p_query)||'%' then 400
    when lower(coalesce(p_brand,'')) like '%'||lower(p_query)||'%' then 300
    else 0 end
$$;

create or replace function public.mkt_initiative_list_scoped(
  p_scope text default 'mine', p_org_id uuid default null, p_search text default null,
  p_deep boolean default false, p_sort text default 'updated_at', p_dir text default 'desc',
  p_filters jsonb default '{}'::jsonb, p_limit integer default 25, p_offset integer default 0
) returns table(
  id uuid, name text, description text, brand_id uuid, brand_name text, status text,
  objective text, goal text, starts_on date, ends_on date, budget_amount numeric,
  budget_currency text, organization_id uuid, created_by uuid, visibility text,
  version integer, created_at timestamptz, updated_at timestamptz, total_count bigint
) language plpgsql stable security definer set search_path='public' as $$
declare v_uid uuid:=auth.uid(); v_scope text:=lower(coalesce(p_scope,'mine'));
  v_sort text:=lower(coalesce(p_sort,'updated_at')); v_f jsonb:=coalesce(p_filters,'{}');
  v_search text:=nullif(btrim(coalesce(p_search,'')),'');
begin
  if v_uid is null then raise exception 'mkt_initiative_list_scoped: not authenticated'; end if;
  if v_scope not in ('mine','orgs','shared','public') then raise exception 'unknown scope %',v_scope; end if;
  if v_sort not in ('name','description','brand_name','status','objective','goal','starts_on','ends_on','budget_amount','budget_currency','created_at','updated_at') then v_sort:='updated_at'; end if;
  return query with my_orgs as (
    select om.organization_id org_id from iam.organization_member om join iam.organizations o on o.id=om.organization_id
    where om.user_id=v_uid and o.is_personal is not true and (p_org_id is null or om.organization_id=p_org_id)
  ), scoped as (
    select i.* from marketing.initiative i where v_scope='mine' and i.created_by=v_uid
    union select i.* from marketing.initiative i where v_scope='orgs' and i.created_by is distinct from v_uid
      and i.organization_id in (select org_id from my_orgs) and i.visibility in ('internal','public')
    union select i.* from marketing.initiative i join iam.permissions p on p.resource_type='marketing_initiative' and p.resource_id=i.id
      where v_scope='shared' and i.created_by is distinct from v_uid and (p.granted_to_user_id=v_uid or p.granted_to_organization_id in (select organization_id from iam.organization_member where user_id=v_uid))
    union select i.* from marketing.initiative i where v_scope='public' and i.created_by is distinct from v_uid and i.visibility='public'
  ), joined as (select s.*,b.name b_name from scoped s left join web.brand b on b.id=s.brand_id where s.deleted_at is null),
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
  select c.id,c.name,c.description,c.brand_id,c.b_name,c.status,c.objective,c.goal,c.starts_on,c.ends_on,c.budget_amount,c.budget_currency,c.organization_id,c.created_by,c.visibility,c.version,c.created_at,c.updated_at,c.n
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
end $$;

create or replace function public.mkt_initiative_list_scope_counts(p_search text default null,p_deep boolean default false,p_filters jsonb default '{}')
returns table(scope text,narrow_id uuid,label text,total bigint) language plpgsql stable security definer set search_path='public' as $$
declare s text; begin foreach s in array array['mine','orgs','shared','public'] loop return query select s,null::uuid,null::text,coalesce(max(x.total_count),0) from public.mkt_initiative_list_scoped(s,null,p_search,p_deep,'updated_at','desc',p_filters,1,0)x; end loop; end $$;

create or replace function public.mkt_initiative_list_facets(p_scope text default 'mine',p_org_id uuid default null,p_search text default null,p_deep boolean default false,p_filters jsonb default '{}')
returns table(facet text,value text,total bigint) language sql stable security definer set search_path='public' as $$
  with r as (select * from public.mkt_initiative_list_scoped(p_scope,p_org_id,p_search,p_deep,'updated_at','desc',p_filters,200,0))
  select 'status',status,count(*) from r group by status union all select 'objective',objective,count(*) from r group by objective
  union all select 'brand',coalesce(brand_name,'__none__'),count(*) from r group by brand_name
  union all select 'currency',coalesce(budget_currency,'__none__'),count(*) from r group by budget_currency
$$;

grant execute on function public.mkt_initiative_list_scoped(text,uuid,text,boolean,text,text,jsonb,integer,integer), public.mkt_initiative_list_scope_counts(text,boolean,jsonb), public.mkt_initiative_list_facets(text,uuid,text,boolean,jsonb) to authenticated;

insert into platform.shareable_resource_registry(resource_type,schema_name,table_name,id_column,owner_column,is_public_column,display_label,url_path_template,rls_uses_has_permission,is_link_shareable,content_role,is_active)
values ('marketing_initiative','marketing','initiative','id','created_by',null,'Initiative','/marketing/initiatives/{id}',true,true,'container',true)
on conflict(resource_type) do update set schema_name=excluded.schema_name,table_name=excluded.table_name,id_column=excluded.id_column,owner_column=excluded.owner_column,is_public_column=excluded.is_public_column,display_label=excluded.display_label,url_path_template=excluded.url_path_template,rls_uses_has_permission=excluded.rls_uses_has_permission,is_link_shareable=excluded.is_link_shareable,content_role=excluded.content_role,is_active=excluded.is_active;
