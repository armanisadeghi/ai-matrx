-- lane: DATA-HOME-2
--
-- THE DATA HOME'S FORMS AND BOOKING PAGES COME THROUGH THE SAME ORGANIZATION-AWARE WALK AS ITS
-- TABLES (chair, 2026-09-28, after DATA-HOME-2's first cut): under All Orgs the Forms and Bookings
-- listings still showed only the working organization's, with a sentence saying so — the same
-- class as the tables defect Arman found. custom.data_home_pages(p_organization_id) walks exactly
-- the organizations custom.data_home_tables(p_organization_id) walks (member or portal-admitted,
-- store open, narrowed to one when named) and, for each, asks the store's OWN doors
-- custom.forms(org) and custom.bookings(org) — so every wall those doors keep (only forms of Tables
-- the caller may open; a booking page only to somebody who may open its Table) is kept by
-- construction, never restated. Each row names its organization and carries the door's own row.
--
-- A NEW function: no body is replaced, so no based-on line.
-- Guard: matrx-frontend/scripts/campaign-tests/datahome2_the_data_home_honors_its_organization.sql (F, G)
-- Inverse: migrations/inverse/datahome2_c_the_data_home_lists_every_organizations_forms_and_pages_down.sql

create function custom.data_home_pages(p_organization_id uuid default null)
returns table(
  kind              text,
  organization_id   uuid,
  organization_name text,
  page_id           uuid,
  table_id          uuid,
  table_name        text,
  page_row          jsonb
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
    pages as (
      select 'form'::text as kind, a.id as org_id, a.name as org_name,
             f.form_id as page_id, f.table_id as tbl, to_jsonb(f) as r
        from admitted a
        cross join lateral custom.forms(a.id) f
      union all
      select 'booking'::text, a.id, a.name, b.form_id, b.table_id, to_jsonb(b)
        from admitted a
        cross join lateral custom.bookings(a.id) b
    )
    select p.kind, p.org_id, p.org_name, p.page_id, p.tbl,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           p.r
      from pages p
      left join custom.record t
        on t.organization_id = p.org_id and t.id = p.tbl and t.deleted_at is null;
end;
$function$;

comment on function custom.data_home_pages(uuid) is
  'THE DATA HOME''S FORMS AND BOOKING PAGES (lane DATA-HOME-2). Every form and booking page the caller '
  'may see, in every organization custom.data_home_tables walks — or in the one p_organization_id names — '
  'each with its organization and Table name and the row custom.forms / custom.bookings return for it. '
  'Those doors decide what is listed; this only walks the organizations.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'data_home_pages', 'p_organization_id uuid', array['uuid'::regtype::oid],
        'Reads the caller from the session and walks only the organizations custom.data_home_tables walks: ones the caller is a member of or holds a live Table grant in, admitted by iam.has_org_access / custom.portal_admits, skipped when custom.store_is_open is false. p_organization_id only NARROWS that walk to one organization: it grants nothing. For each organization it calls custom.forms(org) and custom.bookings(org), the store''s own doors, whose walls decide every row (only forms and booking pages of Tables the caller may open). An anonymous caller gets zero rows. It returns each page''s organization, its Table name and those doors'' own row. It writes nothing.',
        'datahome2_c_the_data_home_lists_every_organizations_forms_and_pages.sql',
        null, true, false)
on conflict do nothing;

grant execute on function custom.data_home_pages(uuid) to authenticated;
