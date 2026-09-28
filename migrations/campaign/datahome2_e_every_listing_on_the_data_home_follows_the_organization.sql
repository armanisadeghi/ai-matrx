-- chair-step: this REPLACES custom.data_home_pages(uuid) — read by nothing but the data home — with custom.data_home_items(uuid), the same walk and the same contract carried to every listing on the home (forms, booking pages, portals, dashboards, digests, checklists, automations, shares outside), and ADDS custom.data_home_changed_by(jsonb), "who changed it" for the rows of every organization shown. The old function is dropped (its name no longer says what it lists) and its platform.client_callable_door row is moved to the new name; both new doors are declared and granted to `authenticated`. No data row is touched.
-- lane: DATA-HOME-2
-- based-on: custom.data_home_pages(uuid) b8b2b486f5ceb624283fd35d10ab99d583ba62a0504f29a76d041f6658418b6d
--
-- FINISH THE CLASS (chair, 2026-09-28): after tables, forms and booking pages followed the data
-- home's organization dropdown, the other six listings still read the working organization only,
-- each saying "Only <org>'s.". custom.data_home_items(p_organization_id) walks exactly
-- custom.data_home_tables' organizations (member or portal-admitted, store open, one when named)
-- and asks, for each, the store's OWN list doors — custom.forms, custom.bookings,
-- custom.list_portals (+ custom.portal_tables for what each portal shows), custom.dashboards,
-- custom.subscriptions, custom.checklist_templates, custom.pipelines, custom.shares_outside — so
-- every wall those doors keep decides every row, never restated here. custom.data_home_changed_by
-- answers custom.hub_changed_by for each organization named in one call.
--
-- Guard: matrx-frontend/scripts/campaign-tests/datahome2_the_data_home_honors_its_organization.sql (F, G, H)
-- Inverse: migrations/inverse/datahome2_e_every_listing_on_the_data_home_follows_the_organization_down.sql

drop function if exists custom.data_home_pages(uuid);

create function custom.data_home_items(p_organization_id uuid default null)
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

comment on function custom.data_home_items(uuid) is
  'THE DATA HOME''S LISTINGS BESIDE ITS TABLES (lane DATA-HOME-2). Every form, booking page, portal, '
  'dashboard, digest, checklist, automation board and outside share the caller may see, in every '
  'organization custom.data_home_tables walks — or in the one p_organization_id names — each with its '
  'kind, organization, Table name and the row the store''s own list door returns for it. Those doors '
  'decide what is listed; this only walks the organizations.';

update platform.client_callable_door
   set function_name = 'data_home_items',
       declared_by = 'datahome2_e_every_listing_on_the_data_home_follows_the_organization.sql',
       reason = 'Decides a named organization first in its own name (custom.assert_client_may_reach), then walks only the organizations custom.data_home_tables walks: ones the caller is a member of or holds a live Table grant in, admitted by iam.has_org_access / custom.portal_admits, skipped when custom.store_is_open is false. p_organization_id only NARROWS that walk. For each organization it calls the store''s own list doors (custom.forms, custom.bookings, custom.list_portals, custom.portal_tables, custom.dashboards, custom.subscriptions, custom.checklist_templates, custom.pipelines, custom.shares_outside), whose walls decide every row. An anonymous caller gets zero rows. It returns each row''s kind, organization, Table name and those doors'' own row. It writes nothing.'
 where schema_name = 'custom' and function_name = 'data_home_pages';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
select 'custom', 'data_home_items', 'p_organization_id uuid', array['uuid'::regtype::oid],
       'Decides a named organization first in its own name (custom.assert_client_may_reach), then walks only the organizations custom.data_home_tables walks, admitted by iam.has_org_access / custom.portal_admits, skipped when custom.store_is_open is false; for each it calls the store''s own list doors, whose walls decide every row. It writes nothing.',
       'datahome2_e_every_listing_on_the_data_home_follows_the_organization.sql', null, true, false
 where not exists (select 1 from platform.client_callable_door
                    where schema_name = 'custom' and function_name = 'data_home_items');

grant execute on function custom.data_home_items(uuid) to authenticated;

create function custom.data_home_changed_by(p_asks jsonb)
returns table(organization_id uuid, id uuid, at timestamptz, who text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_ask jsonb;
  v_org uuid;
begin
  -- WHO CHANGED EACH ROW, FOR EVERY ORGANIZATION THE HOME SHOWS, IN ONE CALL (lane DATA-HOME-2).
  -- p_asks = [{"organization_id": …, "kind": "structure"|"form"|"portal", "ids": [...]}, …].
  -- Each organization is decided HERE, in this door's own name, before custom.hub_changed_by —
  -- the store's own answer — is asked about it.
  if p_asks is null or jsonb_typeof(p_asks) <> 'array' then
    raise exception 'custom.data_home_changed_by takes a list of asks, one per organization and kind'
      using errcode = '22023',
            hint = 'Send [{"organization_id": "<uuid>", "kind": "structure", "ids": ["<uuid>", ...]}].';
  end if;
  if jsonb_array_length(p_asks) > 200 then
    raise exception 'custom.data_home_changed_by was asked % things at once', jsonb_array_length(p_asks)
      using errcode = '54000', hint = 'Ask about at most 200 (organization, kind) pairs at a time.';
  end if;
  for v_ask in select * from jsonb_array_elements(p_asks) loop
    v_org := (v_ask ->> 'organization_id')::uuid;
    perform custom.assert_client_may_reach(v_org, 'custom.data_home_changed_by');
    return query
      select v_org, c.id, c.at, c.who
        from custom.hub_changed_by(
               v_org,
               v_ask ->> 'kind',
               array(select (e #>> '{}')::uuid from jsonb_array_elements(coalesce(v_ask -> 'ids', '[]'::jsonb)) e)) c;
  end loop;
end;
$function$;

comment on function custom.data_home_changed_by(jsonb) is
  'WHO CHANGED IT, ACROSS THE DATA HOME (lane DATA-HOME-2): custom.hub_changed_by for each '
  '(organization, kind, ids) asked, every organization decided first in this door''s own name.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'data_home_changed_by', 'p_asks jsonb', array['jsonb'::regtype::oid],
        'Takes a list of (organization, kind, ids). Every organization named is decided first, in this door''s own name, by custom.assert_client_may_reach — a caller who cannot reach it is refused — and then custom.hub_changed_by, the store''s own who-and-when door with its own walls and its 500-id cap, answers for it. At most 200 pairs per call. Returns the organization, the id, when it last changed and the name of who changed it. It writes nothing.',
        'datahome2_e_every_listing_on_the_data_home_follows_the_organization.sql',
        null, true, false)
on conflict do nothing;

grant execute on function custom.data_home_changed_by(jsonb) to authenticated;
