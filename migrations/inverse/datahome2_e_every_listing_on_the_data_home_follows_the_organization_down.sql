-- chair-step: this puts custom.data_home_pages(uuid) back (the body datahome2_d made: forms and booking pages only) and removes custom.data_home_items(uuid) and custom.data_home_changed_by(jsonb), moving the door row back to data_home_pages and removing data_home_changed_by's. The data home's other six listings then read the working organization only. No data row is touched.
-- lane: DATA-HOME-2
-- based-on: custom.data_home_items(uuid) 35a2b8756fe21a59ab75135085015b682db3f1b15ef291156d7ecb1b4f865dbe
-- based-on: custom.data_home_changed_by(jsonb) 9f57b3ea24cddb7f9789a58f8ee4dc8d3a7844ae44303db8359372545c185330

drop function if exists custom.data_home_changed_by(jsonb);
delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'data_home_changed_by';
drop function if exists custom.data_home_items(uuid);

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
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME (check:store-doors-decide, lane DATA-HOME-2): an
  -- organization named is one the caller may reach, or the call is refused here, naming this door
  -- — never an empty list that reads like "nothing there", and never a refusal from a door the
  -- person did not call. Named nobody, the walk below admits only organizations the caller
  -- reaches (the same custom.assert_client_may_reach arms: iam.has_org_access / portal_admits).
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home_pages');
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

update platform.client_callable_door
   set function_name = 'data_home_pages',
       declared_by = 'datahome2_c_the_data_home_lists_every_organizations_forms_and_pages.sql',
       reason = 'Reads the caller from the session and walks only the organizations custom.data_home_tables walks: ones the caller is a member of or holds a live Table grant in, admitted by iam.has_org_access / custom.portal_admits, skipped when custom.store_is_open is false. p_organization_id only NARROWS that walk to one organization: it grants nothing. For each organization it calls custom.forms(org) and custom.bookings(org), the store''s own doors, whose walls decide every row (only forms and booking pages of Tables the caller may open). An anonymous caller gets zero rows. It returns each page''s organization, its Table name and those doors'' own row. It writes nothing.'
 where schema_name = 'custom' and function_name = 'data_home_items';

grant execute on function custom.data_home_pages(uuid) to authenticated;
