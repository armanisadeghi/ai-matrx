-- target: branch,production
-- additive: yes
--   It ADDS one new read-only function — `custom.tables_i_can_open()` — and its
--   `platform.client_callable_door` row, and nothing else. No table, column, trigger, policy
--   or grant is touched; nothing existing is replaced, dropped or revoked; nothing is written.
--   The grant is its own file, `accesspersonal_the_tables_i_can_open_door_can_be_reached.sql`.
--   The inverse is `migrations/inverse/accesspersonal_every_table_i_can_open_in_every_organization_down.sql`.
-- guard: custom/system_enabled
--
-- LANE ACCESS-IS-PERSONAL — THE LIST THAT IS NOT FILTERED BY THE ACTIVE ORGANIZATION.
--
-- THE OWNER'S LAW (2026-09-23). "The active org may filter LISTS on a page only if the page
-- itself visually displays the specific org and clearly shows it is filtering for that org,
-- with a way to change it or select all."
--
-- THE USE CASE. Dana Okafor dispatches for Rincon Plumbing Co and keeps the books for Ojai Valley
-- Home Services; a customer's property manager has shared their "Backflow test schedule" with
-- her. The Data hub showed only the organization she had picked, and said nothing about the
-- other two. "All my organizations" on the hub is this door: every Table she can open, in
-- every organization she can reach, named with its organization — one list, grouped, each row
-- opening at /data-v2/<id> no matter which organization she is working in.
--
-- WHAT IT ANSWERS, AND FOR WHOM. For each organization the caller is a member of, or has been
-- let into by a live grant on one of its Tables (the same arm custom.portal_admits reads), it
-- asks the wall exactly as custom.assert_client_may_reach does (iam.has_org_access, or
-- custom.portal_admits) and skips the organization if the wall refuses; skips it when its
-- record store is off (custom.store_is_open — there is nothing to open there); and then lists
-- that organization's live Tables narrowed to custom.query_visible_ids(org, Table kernel) —
-- the same ladder custom.table_facts and every hub door use. The option lists the store keeps
-- for its own choice fields (`kept_by_the_app`) are left out, as the hub leaves them out of
-- Tables. Archived organizations are left out.
--
-- WHAT IT NEVER DOES. It returns a Table's id, name, visibility word and last change, and its
-- organization's id, name and whether the caller is a member — never a field, a record or
-- another person's identity. It writes nothing. The active organization is not an input.

create function custom.tables_i_can_open()
returns table(
  table_id          uuid,
  table_name        text,
  organization_id   uuid,
  organization_name text,
  member            boolean,
  visibility        text,
  updated_at        timestamptz
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
  v_org    record;
begin
  if v_me is null then
    return;
  end if;

  for v_org in
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
  loop
    -- THE WALL, as custom.assert_client_may_reach admits a signed-in person.
    if not (iam.has_org_access(v_org.id) or custom.portal_admits(v_org.id)) then
      continue;
    end if;
    -- A STORE THAT IS OFF HAS NOTHING TO OPEN.
    if not custom.store_is_open(v_org.id) then
      continue;
    end if;
    return query
      select t.id,
             coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
             v_org.id,
             v_org.name,
             v_org.member,
             t.visibility::text,
             t.updated_at
        from custom.record t
       where t.organization_id = v_org.id
         and t.table_id = v_kernel
         and t.deleted_at is null
         and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
         and t.id in (select v from custom.query_visible_ids(v_org.id, v_kernel) v);
  end loop;
end;
$fn$;

comment on function custom.tables_i_can_open() is
  'ACCESS IS PERSONAL (owner, 2026-09-23). Every Table the caller can open, in every organization '
  'the caller can reach (member, or let in by a live grant on one of its Tables), each named with '
  'its organization — the "All my organizations" list on the Data hub. The wall and the ladder are '
  'the store''s own (iam.has_org_access / custom.portal_admits, then custom.query_visible_ids); an '
  'organization whose store is off, and the store''s own option lists, are left out.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'tables_i_can_open',
        '',
        array[]::oid[],
        'Takes no argument: it reads the caller from the session and walks only organizations the caller is a member of or holds a live Table grant in. Each is admitted by the same two arms custom.assert_client_may_reach uses (iam.has_org_access, custom.portal_admits) and skipped otherwise, skipped when custom.store_is_open is false, and its Tables are narrowed to custom.query_visible_ids(org, Table kernel). An anonymous caller gets zero rows. It returns Table id, name, visibility word and last change, and the organization id, name and membership — never a field, a record or another person. It writes nothing.',
        'accesspersonal_every_table_i_can_open_in_every_organization.sql',
        null,
        true, false)
on conflict do nothing;
