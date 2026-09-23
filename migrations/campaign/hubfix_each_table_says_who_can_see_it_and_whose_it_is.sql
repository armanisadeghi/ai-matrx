-- target: branch,production
-- additive: yes
--   It ADDS one new read-only function — `custom.table_facts(uuid)` — and its
--   `platform.client_callable_door` row, and nothing else. No table, column, trigger, policy
--   or grant is touched; nothing existing is replaced, dropped or revoked; nothing is written.
--   The grant is its own file, `hubfix_the_table_facts_door_can_be_reached.sql`.
--   The inverse is `migrations/inverse/hubfix_each_table_says_who_can_see_it_and_whose_it_is_down.sql`.
-- guard: custom/system_enabled
--
-- LANE HUB-FIX — the hub's four lanes had nothing to decide with.
--
-- THE USE CASE. Rincon Plumbing Co's office manager presses "Mine" on the organization hub
-- to see the tables she made — her Truck 3 assignment sheet, the September service board —
-- and "World" to see what the public can open. Measured on production (VERIFIER-16 M6, the
-- guide re-walk of 2026-09-23): Mine read 0 on every seat and every organization, and a
-- table she had just made was not under it.
--
-- THE CAUSE. The lanes are decided by `@ai-matrx/records-ui` from a Table's `visibility`
-- (who can see it) and, by the chair's ruling of 2026-09-23, Mine from its CREATOR. The
-- Table list the browser receives is `custom.read_records` over the Table kernel, which
-- returns each Table's DOCUMENT (`custom.record_values_of`) — and `visibility` and
-- `created_by` are COLUMNS of `custom.record`, not keys of the document. So every Table
-- arrived with neither, every lane decision fell through to its default, and Mine could
-- never match. This door answers exactly those two facts, for exactly the Tables the caller
-- can already open, in one call for the organization.
--
-- WHAT IT NEVER DOES. It returns no name, no field and no record; `mine` says only whether
-- the CALLER made the Table, never who did. It is narrowed to
-- custom.query_visible_ids(org, custom.table_kernel_id()) after custom.assert_client_may_reach,
-- the same two steps every hub door takes.

create function custom.table_facts(p_organization_id uuid)
returns table(table_id uuid, visibility text, mine boolean)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_facts');
  return query
    select t.id,
           t.visibility::text,
           (v_me is not null and t.created_by = v_me)
      from custom.record t
     where t.organization_id = p_organization_id
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null
       and t.id in (select v from custom.query_visible_ids(p_organization_id,
                                                           custom.table_kernel_id()) v);
end;
$fn$;

comment on function custom.table_facts(uuid) is
  'Two facts per Table the caller can already open, for the organization hub''s lanes: who can '
  'see it (the record''s own `visibility` column) and whether the CALLER made it (`created_by`). '
  'Both are columns of custom.record, not keys of the Table document custom.read_records returns, '
  'which is why no lane could be decided without it.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'table_facts',
        'p_organization_id uuid',
        array['uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach before a row is read, so an organization this caller is not in is refused by name and NULL is refused there. Rows are then narrowed to custom.query_visible_ids(org, custom.table_kernel_id()), so a Table this caller cannot open is not returned at all. It returns only the Table''s id, its visibility word and whether the caller made it — never a name, a field, a record or another person''s identity. It writes nothing.',
        'hubfix_each_table_says_who_can_see_it_and_whose_it_is.sql',
        null,
        true, false)
on conflict do nothing;
