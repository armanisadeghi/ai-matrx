-- chair-step: undo chairdoors3b_w3_a_new_row_remembers_what_its_tables_defaults_gave_it.sql: restores custom._record_row_defaults() exactly as the window file chairdoors2_j_store_rows created it (no marker on insert). Rows already carrying the marker keep it; custom.table_row_defaults_apply keeps working, and rows born after this revert read as set by hand once the default changes.
-- lane: CHAIR-DOORS-3B
-- based-on: custom._record_row_defaults() INVERSE_HASH
-- lock: custom

CREATE OR REPLACE FUNCTION custom._record_row_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- CHAIR-DOORS-2 j. A NEW ROW STARTS WITH ITS TABLE'S ROW DEFAULTS, on every insert path.
-- Fires first (_a00_ sorts before _a0_t13_dual_write) and fills only what the writer left out:
--   shown_to              when null;
--   search_engine_indexed when null;
--   published_to_web      when it holds its column default (the T-13 marker for custom.record is set). Turning
--                         it on clears that marker, so the dual-write trigger reads it as written and puts the
--                         retiring row column in step.
-- A Table that names none ('{}') changes nothing: Shown to follows the organization's default at list time,
-- Published to the web stays off, Indexed follows access.indexed_by_default/record.
declare
  v_d    jsonb;
  v_mark text := 't13d.p' || ('custom.record'::regclass)::oid::text;
begin
  if new.data_class <> 'record' or new.table_id is null then
    return new;
  end if;
  v_d := custom._table_row_defaults(new.organization_id, new.table_id);
  if v_d is null or v_d = '{}'::jsonb then
    return new;
  end if;
  if coalesce(current_setting(v_mark, true), '') = '1' and (v_d ->> 'published_to_web')::boolean then
    perform set_config(v_mark, '', true);
    new.published_to_web := true;
  end if;
  if new.search_engine_indexed is null and v_d ? 'indexed' and new.published_to_web then
    new.search_engine_indexed := (v_d ->> 'indexed')::boolean;
  end if;
  if new.shown_to is null and v_d ? 'shown_to'
     and (v_d ->> 'shown_to' <> 'everyone_on_ai_matrx' or new.published_to_web) then
    new.shown_to := (v_d ->> 'shown_to')::platform.shown_to;
  end if;
  return new;
end
$function$
;
