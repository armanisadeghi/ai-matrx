-- additive: yes
--
-- chair-step: it REPLACES `custom.undeclared_keys` — one function, body-for-body equivalent with
--   one transaction-local memo added. Nothing is dropped, nothing is revoked, no row of anybody's
--   data is touched. The inverse is
--   `migrations/inverse/writeperf3b_a_tables_declared_keys_are_read_once_per_statement_down.sql`.
--
-- based-on: custom.undeclared_keys(uuid, uuid, jsonb) d47599a96665038c88c39c8d78efdf2ed5a2bf730baf784487a60450c3e65282
--
-- WRITE-PERF-3 — A TABLE'S DECLARED KEYS ARE READ ONCE PER STATEMENT, NOT ONCE PER KEY PER ROW.
--
-- MEASURED. `EXPLAIN (ANALYZE, BUFFERS)` of ONE 250-row batched insert into `custom.record`:
-- `zzzz_a_undeclared_key_guard` costs 177–363 ms, and `pg_stat_user_functions` puts 114.4 ms of
-- self time in `custom.undeclared_keys` over 265 calls. It asks `not exists (select 1 from
-- custom.record f where … f.data ->> 'key' = k.key)` ONCE PER KEY PER ROW: a work order with
-- seven columns is seven index probes, so 250 of them are 1,750 probes at one question — "which
-- keys has this Table declared?" — whose answer is the same for all 1,750.
--
-- It is now one query per (organization, Table) per transaction, held in WRITE-PERF-3's
-- transaction-local memo (`udk:<org>:<table>`), and the per-key test becomes an array
-- membership. The Field predicate is character for character what it was — `organization_id`,
-- `table_id = custom.field_kernel_id()`, `data_class = 'field'`, `deleted_at is null`,
-- `data ->> 'entity_definition_id' = p_table_id::text` — and so are the two rules about which
-- keys are asked about at all (`left(key,1) <> '_'`, and not one of
-- `custom.record_platform_keys()`), and the result is still sorted by key.
--
-- IT CANNOT GO STALE. The memo is a GUC set with `is_local => true`, so it dies with the
-- transaction and is never shared between sessions; `platform.memo_b_seat()` scopes it to the
-- seat; and `custom.record` — the one table this query reads — carries BOTH halves of the
-- invalidation: `_aa_memo_clear` (`platform.memo_clear_on_structure_row`, BEFORE ROW, which is
-- what protects a reader from a Field written EARLIER IN THE SAME STATEMENT — WRITE-PERF-3's own
-- defect of 2026-09-21) and the after-statement `zz_memo_clear_i/_u/_d`.
--
-- WHAT IT IS NOT. It is not a cache of a DECISION. This memo holds the SHAPE of a Table — which
-- column names it has declared — and no answer about who may reach what. `custom.undeclared_keys`
-- asks no door and never did.

create or replace function custom.undeclared_keys(p_organization_id uuid, p_table_id uuid, p_data jsonb)
returns text[]
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_keys     text[];
  v_memo_key text;
  v_declared text;
begin
  -- EVERY Field row of the Table, not custom.applicable_fields: a Value for a Field that
  -- does not apply to THIS record's type is a different question entirely, and
  -- custom._record_field_validation's retype path already answers it by moving the value
  -- into `_retired` with its reason. Asking applicable_fields here would call such a value
  -- undeclared and refuse a write that is perfectly legal.
  v_memo_key := 'udk:' || coalesce(p_organization_id::text, '-') || ':' ||
                          coalesce(p_table_id::text, '-');
  v_declared := platform.memo_b_get(v_memo_key);
  if v_declared is null then
    select coalesce(jsonb_agg(distinct f.data ->> 'key'), '[]'::jsonb)::text
      into v_declared
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.data_class = 'field'
       and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = p_table_id::text;
    perform platform.memo_b_put(v_memo_key, v_declared);
  end if;

  select coalesce(array_agg(k.key order by k.key), array[]::text[])
    into v_keys
    from jsonb_object_keys(case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end) k(key)
   where left(k.key, 1) <> '_'
     and not (k.key = any (custom.record_platform_keys()))
     and not (v_declared::jsonb ? k.key);
  return v_keys;
end;
$function$;
