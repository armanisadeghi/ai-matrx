-- chair-step: this puts custom.data_home_items(uuid) back to the body datahome2_e made (the store's eight list doors called per organization). Signature, grant and door row unchanged; no data row is touched.
-- lane: DATA-HOME-2
-- based-on: custom.data_home_items(uuid) PLACEHOLDER

create or replace function custom.data_home_items(p_organization_id uuid default null)
returns table(
  kind              text,
  organization_id   uuid,
  organization_name text,
  item_id           uuid,
  table_id          uuid,
  table_name        text,
  item_row          jsonb
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME: an organization named is one the caller may reach,
  -- or the call is refused here, naming this door. Named nobody, the walk below admits only
  -- organizations the caller reaches (the same arms: iam.has_org_access / custom.portal_admits).
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home_items');
  end if;
  if v_me is null then
    return;
  end if;

  return query
    with orgs as (
      -- custom.data_home_tables()'s organizations, word for word.
      select o.id, o.name::text as name
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
      union
      select distinct o.id, o.name::text
        from iam.permissions g
        join custom.record t
          on t.id = g.resource_id
         and t.table_id = v_kernel
         and t.deleted_at is null
        join iam.organizations o on o.id = t.organization_id and o.archived_at is null
       where g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
    ),
    admitted as materialized (
      select o.id, o.name
        from orgs o
       where (case when iam.has_org_access(o.id) then true else custom.portal_admits(o.id) end)
         and custom.store_is_open(o.id)
         and (p_organization_id is null or o.id = p_organization_id)
    ),
    items as (
      select 'form'::text as kind, a.id as org_id, a.name as org_name,
             x.form_id as iid, x.table_id as tbl, to_jsonb(x) as r
        from admitted a cross join lateral custom.forms(a.id) x
      union all
      select 'booking', a.id, a.name, x.form_id, x.table_id, to_jsonb(x)
        from admitted a cross join lateral custom.bookings(a.id) x
      union all
      select 'portal', a.id, a.name, x.portal_id, x.client_table_id,
             to_jsonb(x) || jsonb_build_object('shows', coalesce((
               select jsonb_agg(jsonb_build_object('table_id', pt.table_id, 'name', pt.name) order by pt.name)
                 from custom.portal_tables(a.id) pt
                where pt.portal_id = x.portal_id), '[]'::jsonb))
        from admitted a cross join lateral custom.list_portals(a.id, 'active') x
      union all
      select 'dashboard', a.id, a.name, x.dashboard_id, x.table_id,
             to_jsonb(x) - 'blocks' - 'presentation'
        from admitted a cross join lateral custom.dashboards(a.id) x
      union all
      select 'digest', a.id, a.name, x.rule_id, x.table_id, to_jsonb(x)
        from admitted a cross join lateral custom.subscriptions(a.id) x
      union all
      select 'checklist', a.id, a.name, x.template_id, x.about_table_id, to_jsonb(x)
        from admitted a cross join lateral custom.checklist_templates(a.id) x
      union all
      select 'automation', a.id, a.name, x.table_id, x.table_id, to_jsonb(x)
        from admitted a cross join lateral custom.pipelines(a.id) x
      union all
      select 'share', a.id, a.name, x.invitation_id, x.table_id, to_jsonb(x)
        from admitted a cross join lateral custom.shares_outside(a.id) x
    )
    select i.kind, i.org_id, i.org_name, i.iid, i.tbl,
           case when i.tbl is null then null
                else coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table') end,
           i.r
      from items i
      left join custom.record t
        on t.organization_id = i.org_id and t.id = i.tbl and t.deleted_at is null;
end;
$function$;
