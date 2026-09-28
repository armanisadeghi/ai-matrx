-- chair-step: this ADDS one read-only function, custom.data_home_tables(), declares its platform.client_callable_door row in the open signed-in lane, and GRANTs EXECUTE on it to `authenticated`. A GRANT is refused by the additive allow-list by name, so the three come through this route together and a person reads exactly which function and why. Nothing existing is replaced, dropped or revoked; no row outside that one door row is written.
-- lane: DATA-HOME-1
--
-- THE DATA HOME'S FIVE FILTERS, DECIDED BY THE STORE (Arman, 2026-09-27 21:20 PT).
--
-- What he met: /data-v2 opened on ONE organization, so "Mine" read 0 of everything although he
-- had made tables in another. The ruling: the data home's default is everything the person can
-- see across ALL their organizations, each row labelled with its organization, filtered by
-- All · Mine · My Orgs · Shared · Public. Four of the five are facts about a Table the store
-- already keeps; this door hands them over for every Table the person can open, in one call:
--
--   member          the Table's organization is one the person belongs to     → My Orgs
--   mine            the Table record's own created_by is the person           → Mine
--   shared_with_me  a live grant on the Table names the person, given by
--                   somebody else (iam.permissions.created_by is not them)   → Shared
--   visibility      public / link                                              → Public
--
-- The walk is custom.tables_i_can_open()'s own body (lane HANDOVER, one statement, 2026-09-27),
-- word for word, with the two columns added; the wall, the store switch and the visibility door
-- are that body's. That door is left as it is: records-ui's published client reads it.
--
-- Guard: matrx-frontend/scripts/campaign-tests/datahome1_the_data_home_knows_whose_each_table_is.sql
-- Inverse: migrations/inverse/datahome1_the_data_home_knows_whose_each_table_is_down.sql


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
  shared_with_me    boolean
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
           (t.id in (select gr.id from granted gr))
      from admitted a
      join visible vis on vis.org_id = a.id
      join custom.record t
        on t.id = vis.id
       and t.organization_id = a.id
       and t.table_id = v_kernel
       and t.deleted_at is null
     where not coalesce((t.data ->> 'kept_by_the_app')::boolean, false);
end;
$function$;

comment on function custom.data_home_tables() is
  'THE DATA HOME (lane DATA-HOME-1, owner 2026-09-27). Every Table the caller can open, in every '
  'organization the caller can reach, with its organization and the four facts the home''s filters '
  'read: member (My Orgs), mine = the Table''s created_by is the caller (Mine), shared_with_me = a live '
  'grant names the caller and was given by somebody else (Shared), visibility (Public). The walk is '
  'custom.tables_i_can_open()''s own.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'data_home_tables',
        '',
        array[]::oid[],
        'Takes no argument: it reads the caller from the session and walks only organizations the caller is a member of or holds a live Table grant in, admitted by iam.has_org_access / custom.portal_admits, skipped when custom.store_is_open is false, narrowed to custom.query_visible_ids(org, Table kernel) — custom.tables_i_can_open()''s walk. An anonymous caller gets zero rows. It returns Table id, name, visibility word and last change, the organization id, name and membership, and two booleans about the CALLER (made it; was granted it by somebody else) — never a field, a record or another person. It writes nothing.',
        'datahome1_the_data_home_knows_whose_each_table_is.sql',
        null,
        true, false)
on conflict do nothing;

grant execute on function custom.data_home_tables() to authenticated;
