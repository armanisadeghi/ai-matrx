-- chair-step: this REPLACES the bodies of custom.data_home_tables(uuid) and custom.data_home_pages(uuid) — both read by nothing but the data home — adding one line to each: when an organization is named, the door first decides it through custom.assert_client_may_reach in its own name (pnpm check:store-doors-decide censuses 1, the one-ladder census and the refusal-names-the-door census failed on both). An organization the caller cannot reach is now refused with 42501 naming the door, instead of answering zero rows. Signatures, columns, grants and door rows are unchanged; no data row is touched.
-- lane: DATA-HOME-2
-- based-on: custom.data_home_tables(uuid) 9ebc43b30a01a3859b616a0c9f1992edb08f9eff9d4f23c7ac9cc724a6f8cfc8
-- based-on: custom.data_home_pages(uuid) 39e3b935a999b3d27d24fe8e1715efc8913decb2934ad33dbabae30b25e16d85
--
-- Guard: matrx-frontend/scripts/campaign-tests/datahome2_the_data_home_honors_its_organization.sql (C, G) and pnpm check:store-doors-decide
-- Inverse: migrations/inverse/datahome2_d_the_data_home_doors_decide_in_their_own_name_down.sql

create or replace function custom.data_home_tables(p_organization_id uuid default null)
returns table(
  table_id          uuid,
  table_name        text,
  organization_id   uuid,
  organization_name text,
  member            boolean,
  visibility        text,
  updated_at        timestamptz,
  mine              boolean,
  shared_with_me    boolean,
  kept_by_the_app   boolean,
  kind              text
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
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home_tables');
  end if;
  if v_me is null then
    return;
  end if;

  return query
    with orgs as (
      select o.id, o.name::text as name, true as member
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
      union
      select distinct o.id, o.name::text, false
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
         and not exists (select 1 from iam.organization_member m2
                          where m2.organization_id = o.id and m2.user_id = v_me)
    ),
    admitted as materialized (
      select o.id, o.name, o.member
        from orgs o
       where (case when iam.has_org_access(o.id) then true else custom.portal_admits(o.id) end)
         and custom.store_is_open(o.id)
         -- THE ORGANIZATION FILTER, HONOURED HERE (lane DATA-HOME-2): one organization named,
         -- only its tables are walked, in every lane and kind; none named, every organization.
         -- A NARROWING only: an organization the walk would not admit stays unadmitted.
         and (p_organization_id is null or o.id = p_organization_id)
    ),
    visible as materialized (
      select a.id as org_id, v.v as id
        from admitted a
        cross join lateral custom.query_visible_ids(a.id, v_kernel) v
       where a.member
      union
      select a.id, g.resource_id
        from admitted a
        join iam.permissions g
          on g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
       where not a.member
    ),
    options_ids as materialized (
      -- THE FIELD GRAPH, READ ONCE for every organization walked: which Tables a list column takes
      -- its choices from. custom.table_placement asks this per Table (an EXISTS over the Field
      -- kernel), which cost 21 s for a person in 46 organizations; asked once it is one scan.
      select distinct (f.data -> 'config' ->> 'options_table_id') as id
        from admitted a
        join custom.record f
          on f.organization_id = a.id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and f.data ->> 'type' = 'list'
         and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
    ),
    granted as materialized (
      -- SHARED: a live grant on a Table naming the person, given by somebody else.
      select distinct g.resource_id as id
        from iam.permissions g
       where g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
         and g.created_by is distinct from v_me
    )
    select t.id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           a.id,
           a.name,
           a.member,
           t.visibility::text,
           t.updated_at,
           (t.created_by = v_me),
           (t.id in (select gr.id from granted gr)),
           coalesce((pl.p ->> 'kept_by_the_app')::boolean, false),
           -- THE KIND, from the store's own placement (custom.table_placement's kept_for): one word
           -- per thing a person would name. A table the app does not keep is a table.
           case
             when not coalesce((pl.p ->> 'kept_by_the_app')::boolean, false) then 'table'
             when pl.p ->> 'kept_for' = 'app' then
               case substring(coalesce(t.data ->> 'slug', '') from '^records_ui_([a-z]+)')
                 when 'form' then 'form'
                 when 'view' then 'view'
                 when 'comment' then 'comment'
                 when 'dashboard' then 'dashboard'
                 when 'action' then 'action'
                 when 'checklist' then 'checklist'
                 when 'slots' then 'booking'
                 when 'demo' then 'demo'
                 when 'shapeproof' then 'demo'
                 else 'list'
               end
             when pl.p ->> 'kept_for' = 'choices' then 'list'
             when pl.p ->> 'kept_for' = 'context' then 'scope'
             when pl.p ->> 'kept_for' = 'bookings' then 'booking'
             when pl.p ->> 'kept_for' = 'checklists' then 'checklist'
             when pl.p ->> 'kept_for' = 'workflow' then 'workflow'
             when pl.p ->> 'kept_for' = 'kits' then 'kit'
             when pl.p ->> 'kept_for' = 'store' then 'store'
             else coalesce(nullif(pl.p ->> 'kept_for', ''), 'app')
           end
      from admitted a
      join visible vis on vis.org_id = a.id
      join custom.record t
        on t.id = vis.id
       and t.organization_id = a.id
       and t.table_id = v_kernel
       and t.deleted_at is null
      cross join lateral (
        -- custom.table_placement's rule, word for word, with its one Field-graph question answered
        -- from options_ids above instead of per row: kept when the store derives a keeper word, or
        -- the document says kept_by_the_app / kept_for; kept_for = the stored word, else the
        -- derived one, else 'app'.
        select jsonb_build_object(
                 'kept_by_the_app', d.kept,
                 'kept_for', case when d.kept then coalesce(nullif(btrim(t.data ->> 'kept_for'), ''), d.word, 'app') end) as p
          from (select w.word,
                       (w.word is not null
                        or coalesce(t.data ->> 'kept_by_the_app', '') = 'true'
                        or coalesce(btrim(t.data ->> 'kept_for'), '') <> '') as kept
                  from (select custom.table_kept_for_derived(
                                 t.data, t.data_class = 'kernel',
                                 case when t.data_class = 'kernel' then false
                                      else exists (select 1 from options_ids o where o.id = t.id::text) end) as word) w) d
      ) pl;
end;
$function$;

create or replace function custom.data_home_pages(p_organization_id uuid default null)
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
