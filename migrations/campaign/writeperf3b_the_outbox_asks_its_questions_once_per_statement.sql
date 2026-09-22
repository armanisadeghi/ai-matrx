-- additive: yes
--
-- chair-step: it REPLACES `custom.io_record_changed_stmt_insert` — one function, WRITE-PERF-2's
--   own, body-for-body equivalent with four per-row questions hoisted to the statement and one
--   duplicated call removed. Nothing is dropped, nothing is revoked, no row of anybody's data is
--   touched. The inverse is
--   `migrations/inverse/writeperf3b_the_outbox_asks_its_questions_once_per_statement_down.sql`.
--
-- based-on: custom.io_record_changed_stmt_insert() 769ae400c03a60aa62def221c08279ede3e617499999727d9f45d34ac236fcc2
--
-- WRITE-PERF-3 — THE OUTBOX ASKS WHO IS WRITING ONCE, AND READS THE DOCUMENT ONCE.
--
-- MEASURED. `EXPLAIN (ANALYZE, BUFFERS)` of ONE 250-row batched insert into `custom.record`:
-- `io_record_changed_s_i` costs 352–689 ms, the second-largest item on the write path.
-- `pg_stat_user_functions` over the same statement reports `custom.io_changed_keys` at 195.6 ms
-- of self time over 560 calls — for 250 rows. It is called TWICE per row: once by this trigger's
-- own `case when … array_length(custom.io_changed_keys('{}', n.data), 1) = 0`, and again inside
-- `custom.io_changed_field_ids`, which re-derives the very same key list from the very same two
-- documents to join it against the Table's Fields.
--
-- THREE THINGS CHANGE, AND NOTHING ELSE.
--
--  1. THE KEYS ARE DERIVED ONCE. A `changed` CTE computes `custom.io_changed_keys('{}', n.data)`
--     for each row of the transition table; the emptiness test and the field-id join both read
--     that one array. `custom.io_changed_field_ids` is inlined here as exactly its own body —
--     `select coalesce(jsonb_agg(distinct f.id), '[]') from unnest(keys) k join
--     custom.applicable_fields(org, table, null) f on (f.data ->> 'key') = k` — so the payload is
--     the same jsonb it was. The function itself is NOT changed and NOT dropped: every other
--     caller keeps it.
--
--  2. WHO IS WRITING IS ASKED ONCE. `custom.query_principal()`, `custom.caller_role()` and
--     `coalesce(platform.declared_actor_tier(), platform.actor_tier())` read the connection's
--     seat and its GUCs, not the row — they cannot differ between two rows of ONE statement, and
--     `platform.actor_tier` alone was called 1,336 times for 250 rows. They are read into one
--     `jsonb` before the insert. `declared` stays per row, because it IS the row's own document.
--
--  3. THE OPERATION ID IS READ ONCE. `nullif(current_setting('custom.op_id', true), '')::uuid` is
--     a GUC; it was read once per row.
--
-- UNCHANGED, BY NAME: the door is still asked once per distinct organization in the transition
-- table, BEFORE anything is written (`custom.assert_store_door(org, 'custom.io_record_changed')`);
-- the event key is still `records.changed`; the operation is still `created`; the dedupe key is
-- still `<org>:<id>:<version>:created`; the rows still go in `order by n.id`; the conflict is
-- still `do nothing`. The outbox is what every screen, every realtime notice and every downstream
-- reader sees, so the row it writes is byte for byte the row it wrote.

create or replace function custom.io_record_changed_stmt_insert()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_org   uuid;
  v_actor jsonb;
  v_op    uuid;
begin
  for v_org in select distinct n.organization_id from new_rows n loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  -- WHO IS WRITING. A fact about the connection, not about the row.
  v_actor := jsonb_build_object(
               'user_id', custom.query_principal(),
               'role',    custom.caller_role()::text,
               'tier',    coalesce(platform.declared_actor_tier(), platform.actor_tier()));
  v_op := nullif(current_setting('custom.op_id', true), '')::uuid;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id)
  with changed as (
    select n.organization_id, n.id, n.table_id, n.data, n.version,
           custom.io_changed_keys('{}'::jsonb, n.data) as keys
      from new_rows n
  )
  select c.organization_id, 'records.changed', c.id, c.table_id, 'created',
         case when coalesce(array_length(c.keys, 1), 0) = 0
              then '[]'::jsonb
              else coalesce((select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb)
                               from unnest(c.keys) k
                               join custom.applicable_fields(c.organization_id, c.table_id, null) f
                                 on (f.data ->> 'key') = k), '[]'::jsonb) end,
         v_actor || jsonb_build_object('declared', coalesce(c.data, '{}'::jsonb) ->> '_actor'),
         c.organization_id::text || ':' || c.id::text || ':' || coalesce(c.version, 0)::text || ':created',
         v_op
    from changed c
   order by c.id
  on conflict do nothing;

  return null;
end;
$function$;
