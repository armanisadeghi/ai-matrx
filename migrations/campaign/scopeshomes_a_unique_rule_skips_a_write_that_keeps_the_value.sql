-- chair-step: lane SCOPES-STORE-HOMES (coordinator 2026-09-28). The store's unique-rule check (custom._unique_rule_holds, BEFORE INSERT OR UPDATE on custom.record) skips an UPDATE that keeps the ruled value on a record that was live and stays in its Table: that value was proved unique when it was written. Measured on the clone (4,767-record Tag Table, 100 description rewrites): 15.08 ms a write for the rule before. A new value, an insert, a Table move or a restore from the archive is still checked under the same advisory lock, and a duplicate is refused in the same sentence. One function body; no DDL, no rows.
-- based-on: custom._unique_rule_holds() c869181bdaa3ecbd065c739c3ba934971c101d5d78090c9c4c5e37a5ff8cddf3
-- lane: SCOPES-STORE-HOMES
-- INVERSE: migrations/inverse/scopeshomes_a_unique_rule_skips_a_write_that_keeps_the_value_down.sql
-- window-class: one function body (a trigger's); no DDL on any table. Applied directly (owner, 2026-09-24).

CREATE OR REPLACE FUNCTION custom._unique_rule_holds()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f       jsonb;
  v_key   text;
  v_label text;
  v_val   jsonb;
  v_text  text;
begin
  if new.table_id is null or new.data_class = 'kernel' or new.deleted_at is not null
     or new.table_id in (custom.field_kernel_id(), custom.table_kernel_id(),
                         custom.rule_kernel_id(), custom.merge_field_kernel_id()) then
    return new;
  end if;
  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;

  -- WHICH FIELDS CARRY THE RULE is a fact about the Table and is now read once per statement.
  -- EVERYTHING BELOW STAYS PER-ROW AND IS UNTOUCHED: uniqueness under concurrency is not a
  -- property of the batch, and the advisory lock plus the `EXISTS` ARE the race guarantee.
  for f in select x from jsonb_array_elements(
             custom.table_unique_rule_fields(new.organization_id, new.table_id)) x
  loop
    v_key   := f ->> 'key';
    v_label := coalesce(nullif(f ->> 'label', ''), v_key);
    v_val   := new.data -> v_key;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;                     -- nothing written is not a duplicate of anything
    end if;
    v_text := lower(btrim(v_val #>> '{}'));
    if v_text is null or v_text = '' then
      continue;
    end if;
    -- A WRITE THAT KEEPS THE RULED VALUE PROVES NOTHING NEW (lane SCOPES-STORE-HOMES): the same record,
    -- live before and after, in the same Table, holding the same value (as the rule compares it) was
    -- already proved unique when that value was written, and the lock below plus the read of every live
    -- record of the Table cost 15 ms a write on a 4,767-record Table for a check that cannot fail. A new
    -- value, a new record, a record moved between Tables or brought back from the archive is still checked.
    if tg_op = 'UPDATE' and old.deleted_at is null and old.table_id = new.table_id
       and old.organization_id = new.organization_id
       and lower(btrim(old.data -> v_key #>> '{}')) is not distinct from v_text then
      continue;
    end if;

    -- THE LOCK IS THE WHOLE OF B1. Two sessions writing the same value at the same moment take
    -- the same advisory lock, which is held until whichever of them commits or rolls back. The
    -- loser then reads the winner's committed row and is refused. Transaction-scoped, so it is
    -- released by the commit itself and nothing can leak it.
    perform pg_advisory_xact_lock(
      hashtextextended(new.organization_id::text || '|' || new.table_id::text || '|' || v_key || '|' || v_text, 0));

    if exists (select 1 from custom.record x
                where x.organization_id = new.organization_id
                  and x.table_id = new.table_id
                  and x.deleted_at is null
                  and x.id <> new.id
                  and lower(btrim(x.data ->> v_key)) = v_text) then
      raise exception 'Another record here already has % "%", and % has to be different on every record.',
                      v_label, btrim(v_val #>> '{}'), v_label
        using errcode = '23505',
              hint = format('FLD-3 / B1: %s carries a rule that says its value is unique in this table. Change the value, or open the record that already holds it. Nothing was written.', v_label);
    end if;
  end loop;

  return new;
end;
$function$

;
