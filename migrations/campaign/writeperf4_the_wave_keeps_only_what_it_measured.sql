-- additive: yes
--
-- chair-step: it REPLACES three function bodies, two of them BACK to the bytes they had before
--   `writeperf4_a_fact_about_the_table_is_read_once.sql` — because the measurement said so.
--   Nothing is dropped, nothing is revoked, no row of anybody's data is touched. The inverse is
--   `migrations/inverse/writeperf4_the_wave_keeps_only_what_it_measured_down.sql`.
--
-- WRITE-PERF-4 WAVE 1 — THE WAVE KEEPS ONLY WHAT IT MEASURED.
--
-- The campaign plan says of its own items 6 and 7: "Claimed saving: 0. Measured in the wave." They
-- were measured, per trigger, on the 250-row A/B against the bodies they replaced, and BOTH COST
-- TIME RATHER THAN SAVING IT:
--
--   platform._touch_row     6.9 ms -> 8.2 ms   (+1.3)   a memo read is dearer than `to_jsonb(NEW)`
--   platform._stamp_actor   8.3 ms -> 10.2 ms  (+1.9)   a memo read is dearer than `auth.uid()`
--
-- So they go back, byte for byte. Both fire on hundreds of tables across the platform, and a memo
-- on a hot path that is measurably SLOWER is not a trade — it is only risk. `_stamp_actor_tier`
-- keeps its `platform.memo_col_flags` read, which measured 21.2 ms -> 12.9 ms, and keeps the DDL
-- event trigger that makes it honest.
--
-- The third change is the other direction. `_aa_memo_clear` went 4.5 ms -> 15.0 ms because the new
-- unconditional `co:` drop was a CALL to `platform.memo_k_drop`, and a `SET search_path` function
-- call costs more than the work inside it (see
-- `writeperf4_a_memo_slot_costs_what_a_guc_costs.sql`). The drop is written out inline. It is the
-- same key, dropped unconditionally, with the same meaning: the `choice_options` invalidation gap
-- stays closed.
--
-- based-on: platform._touch_row() 16e58e66db600fc1f40d1fc38364d241009ae808dc30b17383708bd85ebbe082
-- based-on: platform._stamp_actor() 8b977bf8d6d231581ac45dc77436bdfe29ca10ab94e82aad0e43ff418dc24085
-- based-on: platform.memo_clear_on_structure_row() ff0cb292aea44cf3de525c44bfc4288066f2b2fbdb463d214874feb7fa17020f

CREATE OR REPLACE FUNCTION platform._touch_row()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    shape jsonb := to_jsonb(NEW);
BEGIN
    -- DD-184: NEVER `NEW := jsonb_populate_record(NEW, ...)` here.  That rebuilds the
    -- row from a TupleDesc cached at the first firing in this transaction, so a column
    -- added in between is silently written back as NULL.  Direct field assignment is
    -- resolved against the tuple itself, every time.
    --
    -- A declared relabel (a migration that only renames attribution/vocabulary values,
    -- set transaction-locally via `app.relabel_keeps_updated_at = 'on'`) is not
    -- activity: it keeps updated_at. version still bumps below.
    IF shape ? 'updated_at'
       AND coalesce(current_setting('app.relabel_keeps_updated_at', true), '') <> 'on' THEN
        NEW.updated_at := now();
    END IF;
    IF TG_OP = 'UPDATE' AND shape ? 'version' THEN
        -- A record field reference inside a branch that is not taken is never resolved,
        -- so this stays inert on the row types that carry no `version` (the reason
        -- ai_050 reached for jsonb_populate_record in the first place).
        NEW.version := COALESCE((to_jsonb(OLD) ->> 'version')::integer, 0) + 1;
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION platform._stamp_actor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  uid uuid := COALESCE(
    NULLIF(current_setting('app.user_id', true), '')::uuid,
    (SELECT auth.uid())
  );
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, uid);
  END IF;
  NEW.updated_by := COALESCE(uid, NEW.updated_by);
  RETURN NEW;
END
$function$;

create or replace function platform.memo_clear_on_structure_row()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if coalesce(new.table_id, old.table_id) in (custom.table_kernel_id(),
                                              custom.field_kernel_id(),
                                              custom.rule_kernel_id()) then
    perform platform.memo_clear();
  end if;

  -- THE `choice_options` GAP, CLOSED. An OPTION record is an ordinary business row, so the
  -- clause above never fired for it and a choice added EARLIER IN THE SAME STATEMENT could be
  -- served out of a stale list and a legal value refused by name (WRITE-PERF-3 named this and
  -- deliberately left `custom.choice_options` unmemoised because of it). The fix is O(1) and
  -- asks nothing: drop exactly the key for the `(organization_id, table_id)` of the row being
  -- written. When that table is not an options table the key does not exist and this is a
  -- no-op. `set_config` is written out rather than called through `platform.memo_k_drop`
  -- because a `SET search_path` function call costs several times the work inside it, and this
  -- runs on every row of every write to the store.
  if coalesce(new.table_id, old.table_id) is not null then
    perform set_config('mx_memo.k' ||
              md5('co:' || coalesce(new.organization_id, old.organization_id)::text
                        || ':' || coalesce(new.table_id, old.table_id)::text), '', true);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;
