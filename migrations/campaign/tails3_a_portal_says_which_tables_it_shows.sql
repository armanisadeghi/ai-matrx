-- additive: yes
--   It ADDS ONE new function, `custom.portal_tables`, its `platform.client_callable_door` row
--   and its GRANT (the row FIRST, then the grant — `platform.enforce_definer_client_grants`
--   fires ON the grant). Nothing existing is replaced, dropped or revoked.
--   The inverse is `migrations/inverse/tails3_a_portal_says_which_tables_it_shows_down.sql`.
-- NO `-- target:` AND NO `-- guard:` HEADER, ON PURPOSE — the same reason as
--   `apprvtail_a_record_can_say_which_table_it_is_in.sql`: a file that NAMES production is
--   judged by an allow-list that refuses every GRANT by name, and this file's whole point is
--   a new client door. The OFF switch is not lost: the body's FIRST statement is
--   `custom.assert_client_may_reach(p_organization_id, …)`, exactly as `custom.portals` does.
-- lane: TAILS-3
--
-- WHAT WAS BROKEN (AGENT-BUILDS-2, 2026-09-21, measured on Rincon Plumbing Co).
--
-- The Portals rail on a Table's page is ORGANIZATION-scoped while every sibling rail on the
-- same screen is TABLE-scoped: `custom.forms(p_organization_id, p_table_id)`,
-- `custom.dashboards(...)` and the bookings door all take a table; `custom.portals(uuid)`
-- takes none. The rail then decides emptiness from `portals.length`. So standing on the
-- **Parts** table — eight rows of copper pipe and wax rings — the rail read "Portals 10" and
-- listed ten cards titled "Your jobs and invoices", which belong to the **Jobs** table. The
-- empty state never rendered, `BuildOrAsk` never rendered, and the agent half of the product
-- was unreachable on EVERY table of an organization that already had ONE portal.
--
-- THE CHAIR'S RULING (2026-09-21): the rail on a table lists the portals that INCLUDE this
-- table, and the build/ask offer is present whenever THIS table is in no portal — with "add
-- this table to an existing portal" offered beside "a new portal" when the organization
-- already has one. The package's note calling the organization scope intentional is
-- superseded.
--
-- WHY A NEW DOOR RATHER THAN A WIDER `custom.portals`. Adding an out-column to
-- `custom.portals` means DROP FUNCTION + CREATE — a drop of a function live app code calls,
-- which is the one shape the campaign's standing rules stop on. Asking `custom.portal_card`
-- once per portal is ten round trips to answer one question. So: one new reading door that
-- answers exactly the question the rail has to ask, under the same wall as `custom.portals`.

create function custom.portal_tables(p_organization_id uuid)
returns table(portal_id uuid, table_id uuid, name text)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_tables');
  return query
    select pt.portal_id, pt.table_id,
           coalesce(nullif(t.data ->> 'name', ''), 'a table')
      from custom.portal_table pt
      join custom.portal p
        on p.id = pt.portal_id and p.organization_id = p_organization_id
      left join custom.record t
        on t.organization_id = pt.organization_id and t.id = pt.table_id
     where pt.organization_id = p_organization_id
       -- THE SAME GATE `custom.portals` APPLIES, and for the same reason: a portal is a way
       -- IN to the Tables it exposes, so somebody who cannot open the client Table is not
       -- told the portal exists. A pair this door does not return is a pair the caller could
       -- not have seen in `custom.portals` either, so the two answers can never disagree.
       and custom.has_visibility(custom.query_principal(), 'record', p.client_table_id,
                                 'viewer'::public.permission_level)
     order by pt.portal_id, pt.ord;
end $function$;

comment on function custom.portal_tables(uuid) is
  'Which Tables each portal of this organization exposes — the one question a table-scoped Portals rail has to ask before it can say whether THIS table is in a portal. Same wall and same visibility gate as custom.portals, so the two lists can never disagree.';

-- THE DOOR ROW FIRST, THE GRANT SECOND. `platform.enforce_definer_client_grants` fires ON the
-- GRANT, so a grant issued before its row is a grant with no declaration.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values ('custom', 'portal_tables',
        'p_organization_id uuid',
        array['uuid'::regtype]::oid[],
        'p_organization_id: the tenant, checked by custom.assert_client_may_reach — a caller who is not a member of it is refused 42501 before anything is read, and NULL is refused by the same call. It then answers only (portal_id, table_id, name) pairs for portals whose CLIENT Table the caller may already open at viewer, the identical gate custom.portals applies, so this door reveals nothing custom.portals would not have revealed to the same seat. It carries no record contents, no principal, no email and no slug.',
        'tails3_a_portal_says_which_tables_it_shows.sql',
        true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function custom.portal_tables(uuid) to authenticated;
