-- library_catalog_admin_entitlement.sql
--
-- Review feedback 2026-08-08 (agent.review_queue 0ae40033): an admin reviewing
-- /rag/library-catalog under an account whose orgs are NOT in an entitled
-- industry saw "Not entitled" — technically the per-caller truth, but
-- misleading: any Matrx admin can in fact read every shared-knowledge library
-- (issuance and admin-read gates are any-admin per Arman's 2026-07-23 ruling).
-- A surface that tells an admin they can't read something they can read is the
-- exact "over-tightening feel" the security philosophy bans.
--
-- Change: `rag.fn_list_library_catalog` gains an 'admin' entitlement FALLBACK —
-- reported only when no real audience entitlement (organization / industry /
-- global) applies and the caller holds an admin.admins row. Real audience
-- entitlements keep precedence so the chip stays audience-truthful for
-- entitled readers. Signature and column set are unchanged.

create or replace function rag.fn_list_library_catalog(p_organization_id uuid default null::uuid)
 returns table(id uuid, name text, short_code text, description text, kind text, member_count bigint, subscribed boolean, entitled_via text, entitled_industry_name text, entitled_industry_slug text)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_admin boolean := exists (select 1 from admin.admins a where a.user_id = auth.uid());
begin
  if p_organization_id is not null
     and auth.role() <> 'service_role'
     and not iam.has_org_access(p_organization_id) then
    raise exception 'organization access required' using errcode = '42501';
  end if;

  return query
  select
    store.id,
    store.name,
    store.short_code,
    store.description,
    store.kind,
    coalesce(member_count.count, 0),
    p_organization_id is not null and exists (
      select 1
      from rag.data_store_grants as grant_row
      where grant_row.data_store_id = store.id
        and grant_row.audience = 'organization'
        and grant_row.organization_id = p_organization_id
    ),
    coalesce(ent.via, case when v_admin then 'admin' end),
    ent.ind_name,
    ent.ind_slug
  from rag.data_stores as store
  left join (
    select member.data_store_id, count(*) as count
    from rag.data_store_members as member
    where member.deleted_at is null
    group by member.data_store_id
  ) as member_count on member_count.data_store_id = store.id
  left join lateral (
    select
      case
        when bool_or(g.audience = 'organization') then 'organization'
        when bool_or(g.audience = 'industry') then 'industry'
        when bool_or(g.audience = 'global') then 'global'
      end as via,
      (array_agg(i.name order by g.created_at) filter (where g.audience = 'industry'))[1] as ind_name,
      (array_agg(i.slug order by g.created_at) filter (where g.audience = 'industry'))[1] as ind_slug
    from rag.data_store_grants g
    left join iam.industries i on i.id = g.industry_id
    where g.data_store_id = store.id
      and v_user is not null
      and (
        g.audience = 'global'
        or (g.audience = 'organization'
            and g.organization_id in (
              select om.organization_id
              from iam.organization_member om
              where om.user_id = v_user))
        or (g.audience = 'industry'
            and exists (
              select 1
              from iam.org_industries oi
              join iam.organization_member om
                on om.organization_id = oi.organization_id
              where om.user_id = v_user
                and oi.industry_id = g.industry_id))
      )
  ) as ent on true
  where store.discoverable
    and store.is_active
  order by store.name;
end;
$function$;
