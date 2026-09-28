-- chair-step: this puts custom.data_home_tables() back to the version datahome1_the_data_home_knows_whose_each_table_is.sql made (no kept tables, no kind): the result loses two columns, so it is dropped and made again, its platform.client_callable_door row kept and its EXECUTE grant given back. Nothing else is touched; the data home's Kind filter then has nothing to narrow.
-- lane: DATA-HOME-1
-- based-on: custom.data_home_tables() 963da18842a8fb31c94de5b5f8595c351d46ca7e60f264cd3b0ffd60d86acdc3

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
