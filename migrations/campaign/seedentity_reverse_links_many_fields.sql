-- ADDITIVE: custom.reverse_links_many_fields(org, table, field_ids[], record_ids[], limit, offset) — the links of a page
--   of records through SEVERAL reverse columns in ONE call (SEED-ENTITY). A thin wrapper: it calls the existing
--   custom.reverse_links_many once per field inside the database, as the CALLER (security invoker), so every
--   decision (the organization wall, may-know-the-table, the field must be one of custom.reverse_columns, the read
--   predicate per linking record) is the sibling's own, unchanged. Writes nothing. Adds one function, one
--   platform.client_callable_door row and one grant; no table, column, trigger, policy or stored row is touched.
--   Locks: pg_proc row, one platform.client_callable_door row.
--   Inverse: migrations/inverse/seedentity_reverse_links_many_fields_down.sql
-- guard: custom/system_enabled
-- lock: custom
-- lane: SEED-ENTITY
--
-- WHY: the grid asked one reverse_links_many per reverse column (3 calls on Spaces' page). With this door a page asks
-- one. Up to 20 fields a call; the sibling's own caps (200 records, 50 links a record) hold per field.

create or replace function custom.reverse_links_many_fields(p_organization_id uuid, p_table_id uuid, p_field_ids uuid[],
                                                 p_record_ids uuid[], p_limit integer default 10, p_offset integer default 0)
 returns table(field_id uuid, record_id uuid, total integer, links jsonb)
 language plpgsql
 stable security invoker
 set search_path to 'pg_catalog'
as $function$
declare
  v_field uuid;
begin
  if coalesce(cardinality(p_field_ids), 0) > 20 then
    raise exception 'custom.reverse_links_many_fields: at most 20 fields a call' using errcode = '22023';
  end if;
  foreach v_field in array coalesce(p_field_ids, array[]::uuid[]) loop
    return query
      select v_field, r.record_id, r.total, r.links
        from custom.reverse_links_many(p_organization_id, p_table_id, v_field, p_record_ids, p_limit, p_offset) r;
  end loop;
end
$function$;

comment on function custom.reverse_links_many_fields(uuid, uuid, uuid[], uuid[], integer, integer) is
  'SEED-ENTITY: custom.reverse_links_many for several reverse columns in one call — (field_id, record_id, total, links), each field answered exactly as the single-field door answers it, as the caller. At most 20 fields a call.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   signed_in_callers, anonymous_callers, non_client_lane, identity_argtypes, argument_rules)
select 'custom', 'reverse_links_many_fields',
   'p_organization_id uuid, p_table_id uuid, p_field_ids uuid[], p_record_ids uuid[], p_limit integer, p_offset integer',
   'migrations/campaign/seedentity_reverse_links_many_fields.sql (lane SEED-ENTITY)',
   'A wrapper that runs custom.reverse_links_many once per field as the CALLER (security invoker): the organization wall, the right to know the Table, the rule that each field be a reverse column this caller may see, and the per-record read predicate are all decided inside that door, per field, before anything is read. At most 20 fields a call.',
   true, false, null, '{2950,2950,2951,2951,23,23}',
   jsonb_build_object(
     'version', 1,
     'declared_by', 'seedentity_reverse_links_many_fields.sql',
     'declared_at', '2026-10-08 lane SEED-ENTITY, read from this body',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'passed unchanged to custom.reverse_links_many, which decides it with custom.assert_client_may_reach(arg1) and custom.assert_may_know_table(arg1) before anything is read.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true,
           'note', 'The sibling door decides it first, for every field.'),
         'verified', '2026-10-08 lane SEED-ENTITY — read from this body'),
       'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'passed unchanged to custom.reverse_links_many, which decides it with custom.assert_may_know_table(arg2).',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true,
           'note', 'Read only as a Table of p_organization_id the caller may know.'),
         'verified', '2026-10-08 lane SEED-ENTITY — read from this body'),
       'p_field_ids', jsonb_build_object('type', 'uuid[]', 'position', 3, 'entity', 'custom_record',
         'check', 'each id is passed to custom.reverse_links_many, which requires it to be a reverse column custom.reverse_columns lists for this caller, else refuses 42501.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true,
           'note', 'A Field of another organization, of a Table she may not know, or linking elsewhere is refused in the same words as an invented id; at most 20 ids a call.'),
         'verified', '2026-10-08 lane SEED-ENTITY — read from this body'),
       'p_record_ids', jsonb_build_object('type', 'uuid[]', 'position', 4,
         'check', 'A FILTER, AND NOT A LEAK: passed unchanged to custom.reverse_links_many, which keeps every linking record only when custom.visible_predicate_sql admits it for the caller.',
         'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-10-08 lane SEED-ENTITY — read from this body')))
on conflict do nothing;

-- The grant follows from the declaration, and only from the declaration.
select custom.reopen_declared_doors();
