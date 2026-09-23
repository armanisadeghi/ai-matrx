-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.promote_field(uuid, uuid, uuid) 6ea8127d3182ba25d6dd64127b791f3c71b6eebd5ec285c6785c8e6886e277cd
--
-- SUITES-TIDY-2 — A DOOR THAT INDEXES THE STORE SETTLES ITS DEFERRED CHECKS FIRST.
--
-- THE SYMPTOM. `w3_work_c44.sql` and `doorfix_green.sql` failed on the nightly clone with
--     cannot CREATE INDEX "record" because it has pending trigger events      (SQLSTATE 55006)
-- STORE-ON proved it is not the store default: it fails the same with the default flipped back.
--
-- THE ROOT CAUSE, and it is the DOOR, not the suites. STORE-TXN-4 (2026-09-22 18:01Z) put a
-- DEFERRABLE INITIALLY DEFERRED constraint trigger on the store —
--     CREATE CONSTRAINT TRIGGER zzzz_relation_halves_agree AFTER INSERT OR UPDATE ON custom.record
--       DEFERRABLE INITIALLY DEFERRED FOR EACH ROW ... EXECUTE FUNCTION custom._relation_halves_agree()
-- — so every write to `custom.record` leaves an event pending until COMMIT. Postgres refuses
-- `CREATE INDEX` (and `ALTER TABLE`) on a table that has pending trigger events in the same
-- transaction. `custom.promote_field` (ROUTE A, the small-Table route) runs `CREATE INDEX ... ON
-- custom.record` INSIDE its caller's transaction. The deferred check fires only for rows whose
-- `data_class = 'record'` (its WHEN clause), and `custom.work_slots_declare` itself writes only
-- Table and Field rows (`'table'`, `'field'`) — so A PERSON'S SINGLE CALL IS NOT AFFECTED; each
-- PostgREST call is its own transaction. What fails is any transaction that wrote an ORDINARY
-- record first and then reaches this index: the two suites (they build a working business and
-- then declare its slots in one transaction, which is the correct shape for a suite), and any
-- server path that batches several door calls into one transaction. A door must not depend on
-- being first in its transaction, so the door is where this is fixed.
--
-- PROVED on the clone, on a scratch table with the identical trigger shape (so no index is built
-- over the store's real rows): after one INSERT, `CREATE INDEX` answers "cannot CREATE INDEX
-- "probe_record" because it has pending trigger events"; after `SET CONSTRAINTS ... IMMEDIATE`
-- the same statement succeeds.
--
-- THE FIX, ONCE, IN THE SHARED LAYER. `platform.settle_deferred_checks(rel, immediate)` fires
-- every deferrable constraint on a table NOW (`SET CONSTRAINTS ... IMMEDIATE` runs the pending
-- events at that point — the same check on the same rows, only earlier; a disagreement still
-- refuses, with the same sentence) and, called again with `false`, puts each one back to the
-- mode it was DECLARED with. `custom.promote_field` calls it immediately before its index and
-- immediately after its renames. Any door that must run DDL on a table mid-transaction calls
-- the same function, so the next deferred check anybody adds to any table cannot reopen this.
--
-- `custom.promote_field`'s body was changed MECHANICALLY: the live `pg_get_functiondef` output,
-- with two lines inserted (and a comment above the first). The complete unified diff:
--   @@ -58,0 +59,8 @@   (comment) + perform platform.settle_deferred_checks('custom.record'::regclass, true);
--   @@ -81,0 +90 @@     + perform platform.settle_deferred_checks('custom.record'::regclass, false);
--
-- Inverse: migrations/inverse/suitestidy2_a_door_that_indexes_the_store_settles_its_deferred_checks_first_down.sql

CREATE FUNCTION platform.settle_deferred_checks(p_rel regclass, p_immediate boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  r   record;
  v_n integer := 0;
begin
  -- Every DEFERRABLE constraint on the table. A constraint trigger on a partitioned parent is
  -- cloned onto every partition under the same name, and SET CONSTRAINTS by name reaches all of
  -- them, so naming the parent's is enough.
  for r in
    select n.nspname, c.conname, bool_or(c.condeferred) as initially_deferred
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
     where c.conrelid = p_rel and c.condeferrable
     group by n.nspname, c.conname
     order by n.nspname, c.conname
  loop
    if p_immediate then
      execute format('set constraints %I.%I immediate', r.nspname, r.conname);
    else
      -- Back to what it was DECLARED as, never to a guess.
      execute format('set constraints %I.%I %s', r.nspname, r.conname,
                     case when r.initially_deferred then 'deferred' else 'immediate' end);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

comment on function platform.settle_deferred_checks(regclass, boolean) is
  'DEFERRED CHECKS BEFORE DDL: with true, fires every deferrable constraint on a table now (SET CONSTRAINTS ... IMMEDIATE) so a door can run CREATE INDEX / ALTER TABLE on it mid-transaction without SQLSTATE 55006 "pending trigger events"; with false, puts each back to the mode it was declared with. The check still runs on the same rows, only earlier. SUITES-TIDY-2, 2026-09-22, after custom.promote_field refused any caller whose transaction had already written a record, once custom.record gained zzzz_relation_halves_agree. Returns the number of constraints it set.';

CREATE OR REPLACE FUNCTION custom.promote_field(p_organization_id uuid, p_table_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on    boolean;
  v_rows  bigint;
  v_key   text;
  v_expr  text;
  v_uniq  boolean;
  v_name  text;
  v_data  jsonb;
  v_kids  text[];
  v_kid   text;
  v_i     integer;
  v_t0    timestamptz := clock_timestamp();
begin
  -- B1: THE ORGANIZATION'S OWN SYSTEM SWITCH, not a second knob nobody turns on.
  -- custom.store_is_open resolves custom/system_enabled at the organization rung and, like
  -- every other reader of it, treats a switch it cannot READ as closed rather than open.
  v_on := custom.store_is_open(p_organization_id);
  if not v_on then
    raise exception 'promoting a field is switched off here'
      using errcode = '0A000',
            hint = 'This organization''s record store is switched off — custom/system_enabled resolves false for it. Nothing was built, and nothing was changed. Turn the store on for this organization on the switch screen (/administration/database/unified-data-ramp) and promote the field again; there is no separate switch for promotion.';
  end if;

  select f.data into v_data
    from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id
     and f.table_id = custom.field_kernel_id() and f.deleted_at is null;
  if v_data is null then
    raise exception 'that field does not belong to this organization' using errcode = '23503';
  end if;

  v_key  := v_data ->> 'key';
  v_uniq := coalesce((v_data ->> 'unique')::boolean, false);
  v_expr := custom.promoted_index_expr(v_data);
  v_name := custom.promoted_index_name(p_table_id, v_key, v_uniq);

  if v_expr is null then
    raise exception 'the field % cannot be promoted: %', v_key,
      (select why_not from custom.promoted_fields(p_organization_id, p_table_id) x where x.field_id = p_field_id)
      using errcode = '0A000',
            hint = 'REC-N-3: a promoted Field is indexed by the path its own storage uses, and this one has none.';
  end if;

  -- Ruling (e): ROUTE A is the SMALL-Table route and says so rather than freezing sixteen
  -- partitions for every organization in the store.
  select count(*) into v_rows from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id and r.deleted_at is null;
  if v_rows > custom.promotion_inline_ceiling() then
    raise exception 'this table has % records, which is more than the % this route builds in one go', v_rows, custom.promotion_inline_ceiling()
      using errcode = '53400',
            hint = 'Run the statements custom.promoted_index_ddl(organization, table) returns instead: they build each partition without blocking anybody, and they have to run one at a time rather than inside a transaction.';
  end if;

  -- 🚨 SETTLE THE STORE'S DEFERRED CHECKS FIRST (SUITES-TIDY-2, 2026-09-22). Since STORE-TXN-4
  -- `custom.record` carries `zzzz_relation_halves_agree`, a DEFERRABLE INITIALLY DEFERRED
  -- constraint trigger, so every write to the store leaves an event pending until COMMIT — and
  -- Postgres refuses `CREATE INDEX` on a table with pending trigger events (SQLSTATE 55006).
  -- A caller whose transaction already wrote an ordinary record (a suite, or a server path that
  -- batches door calls) was refused here. The check is fired NOW rather than at COMMIT (it is the
  -- same check on the same rows, only earlier), and put back to its declared DEFERRED after.
  perform platform.settle_deferred_checks('custom.record'::regclass, true);
  execute format('create %s index if not exists %I on custom.record (organization_id, %s) where table_id = %L::uuid and deleted_at is null',
                 case when v_uniq then 'unique' else '' end, v_name, v_expr, p_table_id);

  -- 🚨 REC-N-12 IS ABOUT THE NAME A PERSON READS, AND ROUTE A DOES NOT GIVE THEM ONE.
  -- `CREATE INDEX` on a partitioned parent creates one index per partition and NAMES THEM
  -- ITSELF: `record_p09_organization_id_expr_idx1`. That is the string the database quotes at
  -- whoever loses a concurrent duplicate write, and it carries no field key, no table and
  -- nothing anybody can act on — so the whole reason `custom.promoted_index_name` keeps the
  -- field key in the name is lost on the one path that matters. MEASURED 2026-09-17: the
  -- duplicate refusal read `duplicate key value violates unique constraint
  -- "record_p09_organization_id_expr_idx1"`. The children are therefore renamed to the same
  -- convention ROUTE B builds them under — `<parent>_NN` — so both routes leave one index
  -- naming scheme and the refusal says which field it is about, whichever route built it.
  -- The names are collected BEFORE any rename: renaming inside the walk would reorder it.
  select array_agg(c.relname order by c.relname) into v_kids
    from pg_inherits i join pg_class c on c.oid = i.inhrelid
   where i.inhparent = format('custom.%I', v_name)::regclass;
  for v_i in 1 .. coalesce(array_length(v_kids, 1), 0) loop
    v_kid := left(v_name, 52) || '_' || lpad(v_i::text, 2, '0');
    if v_kids[v_i] is distinct from v_kid then
      execute format('alter index custom.%I rename to %I', v_kids[v_i], v_kid);
    end if;
  end loop;
  perform platform.settle_deferred_checks('custom.record'::regclass, false);

  return jsonb_build_object(
    'field_key', v_key, 'index_name', v_name, 'unique', v_uniq, 'expression', v_expr,
    'records', v_rows, 'rows_moved', 0, 'route', 'A (in one transaction, under the inline ceiling)',
    'partition_indexes', coalesce(array_length(v_kids, 1), 0),
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end $function$;
