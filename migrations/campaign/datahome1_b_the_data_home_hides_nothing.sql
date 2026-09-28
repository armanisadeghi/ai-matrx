-- chair-step: this REPLACES custom.data_home_tables() — which lane DATA-HOME-1 added earlier the same evening and nothing but the data home reads — with a version that also lists the tables the app keeps for itself and says each one's kind. Its result gains two columns, so the function is dropped and made again in this one transaction, its platform.client_callable_door row kept (re-declared if the drop took it) and its EXECUTE grant to `authenticated` given back. No other object and no row of anybody's data is touched.
-- lane: DATA-HOME-1
-- based-on: custom.data_home_tables() 2cbd737c03be5575890915cc96d4e1f814dea9fc8a5bf3758dd3abc381d579c0
--
-- THE HOME HIDES NOTHING (Arman, 2026-09-27 21:40 PT): the data home shows EVERY table in the store
-- by default, including the ones the app made — pick lists, scope types, choice-word tables,
-- booking slots, checklists, kits, workflows — each row saying its kind and its organization; a
-- Kind filter beside the five filters narrows it. The kind is the store's own word
-- (custom.table_placement's kept_for), never guessed by the client.
--
-- Guard: matrx-frontend/scripts/campaign-tests/datahome1_the_data_home_knows_whose_each_table_is.sql
-- Inverse: migrations/inverse/datahome1_b_the_data_home_hides_nothing_down.sql

drop function if exists custom.data_home_tables();

create function custom.data_home_tables()
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

comment on function custom.data_home_tables() is
  'THE DATA HOME (lane DATA-HOME-1, owner 2026-09-27). Every Table the caller can open, in every '
  'organization the caller can reach, with its organization and the four facts the home''s filters '
  'read: member (My Orgs), mine = the Table''s created_by is the caller (Mine), shared_with_me = a live '
  'grant names the caller and was given by somebody else (Shared), visibility (Public). The walk is '
  'custom.tables_i_can_open()''s own, and it keeps nothing back: the tables the app keeps for itself are listed too, each with its kind (kept_by_the_app, kind from custom.table_placement''s kept_for).';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'data_home_tables',
        '',
        array[]::oid[],
        'Takes no argument: it reads the caller from the session and walks only organizations the caller is a member of or holds a live Table grant in, admitted by iam.has_org_access / custom.portal_admits, skipped when custom.store_is_open is false, narrowed to custom.query_visible_ids(org, Table kernel) — custom.tables_i_can_open()''s walk. An anonymous caller gets zero rows. It returns Table id, name, visibility word and last change, the organization id, name and membership, and two booleans about the CALLER (made it; was granted it by somebody else) — never a field, a record or another person. It also says whether the app keeps each Table for itself and its kind word. It writes nothing.',
        'datahome1_b_the_data_home_hides_nothing.sql',
        null,
        true, false)
on conflict do nothing;

grant execute on function custom.data_home_tables() to authenticated;
