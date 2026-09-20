-- additive: yes
--
-- chair-step: it GRANTS EXECUTE on a new client door to `authenticated`, and a GRANT is outside
--   the additive allow-list by design — the OFF switch's boundary IS the absence of new client
--   grants. The door it opens is `custom.record_write_many`, a brand-new function that replaces
--   nothing, declared in `platform.client_callable_door` BEFORE the grant so `platform._ddl_guard`
--   lets the grant stand. Nothing is dropped and no row of anybody's data is touched. The inverse
--   is `migrations/inverse/writeperf2_a_batch_of_records_is_one_statement_down.sql`, which
--   removes the door row and the function.
--
-- WRITE-PERF-2 — THE STORE HAS A DOOR THAT WRITES A BATCH IN ONE STATEMENT.
--
-- `custom.record_write` writes ONE row per call and asks the two door questions —
-- `custom.assert_store_door` and `custom.assert_client_may_change` — once per row. Every bulk
-- writer in the platform (`custom.io_import_rows`, the agent's record tools, the packages'
-- client) loops over it, so a five-hundred-row import is five hundred statements, five hundred
-- pairs of door questions, and five hundred firings of every trigger on `custom.record`.
--
-- This is the same door for many rows: the SAME two questions, asked ONCE for the batch,
-- and ONE `insert … select`, which is what makes WRITE-PERF-2's statement-level triggers
-- amortise at all. Measured on the main database, 2026-09-20, 200 records with six typed
-- columns (text, currency, datetime, select, member, relation) into a throwaway organization:
--
--     one `custom.record_write` per row, live store   42.38 ms/row
--     one `custom.record_write` per row, this lane    25.66 ms/row
--     ONE `custom.record_write_many` for all 200      17.27 ms/row
--
-- THE IDS COME BACK IN THE ORDER THEY WERE ASKED FOR. `insert … returning` makes no promise
-- about row order, and a caller that wrote five hundred rows needs to know which id is which,
-- so the ids are minted here, in input order, and written explicitly. `p_ids` lets a caller
-- that has already minted them (a two-phase writer that must record the id before the write)
-- hand them in; when it is null they are minted here.
--
-- WHAT IT DOES NOT DO, AND WHY. It does NOT swallow a bad row: one refused record refuses the
-- whole statement, by name, exactly as the trigger would have refused it alone. A caller that
-- needs per-row refusals — `custom.io_import_rows` is the one that does, because it reports
-- "4,850 landed, 100 already here, 50 refused" per row — must catch the refusal and retry that
-- batch through `custom.record_write` row by row to attribute it. That is the shape the next
-- lane gives `io_import_rows`; it is NOT done here because `custom.io_import*` is lane IMPORT's
-- object (they hold `campaign_watch.build_lock` row `IMPORT`) and because its in-batch duplicate
-- map is updated at write time, so the fallback has to restore it exactly rather than
-- approximately. Written down rather than half-done.

create or replace function custom.record_write_many(p_organization_id uuid,
                                                    p_table_id uuid,
                                                    p_rows jsonb[],
                                                    p_ids uuid[] default null)
 returns uuid[]
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_ids uuid[];
  v_n   integer := coalesce(cardinality(p_rows), 0);
begin
  -- The switch, then the organization, then the Table these records are being added to — the
  -- same two predicates `custom.record_write` asks, in the same order, ONCE for the batch.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write_many');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_write_many',
                                          'editor'::public.permission_level, 'table');

  if p_organization_id is null then
    raise exception 'custom.record_write_many: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if v_n = 0 then
    return '{}'::uuid[];
  end if;
  if p_ids is not null and coalesce(cardinality(p_ids), 0) <> v_n then
    raise exception 'custom.record_write_many: % ids were handed in for % records, so no row could be told from another', coalesce(cardinality(p_ids), 0), v_n
      using errcode = '22023',
            hint = 'Hand in one id per record, in the same order, or hand in none and let the door mint them. Nothing was written.';
  end if;

  if p_ids is null then
    select array_agg(gen_random_uuid() order by ord) into v_ids
      from generate_subscripts(p_rows, 1) ord;
  else
    v_ids := p_ids;
  end if;

  insert into custom.record (organization_id, table_id, id, data)
  select p_organization_id, p_table_id, v_ids[ord], coalesce(p_rows[ord], '{}'::jsonb)
    from generate_subscripts(p_rows, 1) ord
   order by ord;

  return v_ids;
end
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   anonymous_callers, signed_in_callers, identity_argtypes, argument_rules)
values
  ('custom', 'record_write_many',
   'p_organization_id uuid, p_table_id uuid, p_rows jsonb[], p_ids uuid[]',
   'WRITE-PERF-2',
   'WRITE-PERF-2: the create door for many records at once. It is custom.record_write for a batch and nothing else: the store is switched per organization by custom/system_enabled and the body asks custom.assert_store_door first, membership and the editor rung on the Table are decided by custom.assert_client_may_change for auth.uid() before the insert, and custom._field_write_door judges every field of every document as it lands. The two questions are asked ONCE for the batch because they are questions about the caller, the organization and the Table, none of which can change between row 1 and row 500 of one statement. One refused record refuses the whole statement by name.',
   false, true,
   array[2950, 2950, 3807, 2951]::oid[],
   jsonb_build_object(
     'version', 1,
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object(
         'type', 'uuid', 'position', 1, 'optional', false, 'entity', null,
         'check', 'the caller''s own organization, asserted by the caller before it reaches this door: every row is written with exactly this organization_id, which is the partition key and the leading column of every RLS policy on custom.record. Not null - the function raises 22004.',
         'null_rule', jsonb_build_object('sqlstate', '22004'),
         'entity_reason', 'It is an organization id and this door makes no access decision with it beyond handing it to custom.assert_store_door and custom.assert_client_may_change, which are the same predicates custom.record_write uses; the value is written verbatim as the partition key.'),
       'p_table_id', jsonb_build_object(
         'type', 'uuid', 'position', 2, 'optional', false, 'entity', null,
         'check', 'the custom Table every record in this batch belongs to; it is handed to custom.assert_client_may_change, which is where the editor rung on the Table is decided, and then stored.',
         'null_rule', jsonb_build_object('means', 'kernel records that belong to no custom Table'),
         'entity_reason', 'Access to the rows is decided by organization_id and the canonical entity policies on custom.record; the Table is what the editor rung is asked about, through custom.assert_client_may_change, exactly as custom.record_write asks it.'),
       'p_rows', jsonb_build_object(
         'type', 'jsonb[]', 'position', 3, 'optional', false,
         'check', 'the record documents themselves, in the order the ids come back in. They carry no identifier this door reads and none that reaches an access decision; each is stored verbatim as one jsonb object (REC-36).',
         'null_rule', jsonb_build_object('default', '{}')),
       'p_ids', jsonb_build_object(
         'type', 'uuid[]', 'position', 4, 'optional', true,
         'check', 'ids the caller has already minted, one per record in the same order, for a writer that must record the id before the write. They name rows that do not exist yet, so they decide nothing: a duplicate is refused by the primary key (organization_id, id) and a row is still written only where custom.assert_client_may_change already said yes.',
         'null_rule', jsonb_build_object('means', 'the door mints the ids itself, in input order')))))
on conflict do nothing;

-- THE DOOR IS DECLARED FIRST AND THE GRANT COMES AFTER IT: `platform._ddl_guard` takes a
-- client EXECUTE grant back from a SECURITY DEFINER function in a closed schema that has no row
-- in `platform.client_callable_door`, and it is right to. Proved by running it the other way
-- round on the main database first, which printed `undeclared_client_grant_in_a_closed_schema`
-- and left `has_function_privilege('authenticated', …) = false`.
grant execute on function custom.record_write_many(uuid, uuid, jsonb[], uuid[]) to authenticated;
