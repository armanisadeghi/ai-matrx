-- draft: CHAIR-DOORS-3B rule 27 on the clone not yet green (the clone's sign-in freeze / pool were saturated on 2026-10-03 01:30 PT); body proven in a rolled-back transaction. Remove this line when db:rehearse passes.
-- chair-step: replaces the body of the insert trigger function custom._record_row_defaults() (same signature, still SECURITY DEFINER) so a new store row also records, in metadata.row_controls_from_default, which of its row controls came from its Table's defaults. No table, column, index, grant, policy or row is touched. It depends on the window file chairdoors2_j_store_rows_carry_published_to_the_web_and_indexed.sql (which creates this trigger function on production) and on chairdoors3b_d (already live: it registers the metadata key), so it runs in the same window, right after chairdoors2_j_store_rows.
-- lane: CHAIR-DOORS-3B (asked by v6 lane 2 MAKE-HOME, need "Apply to existing rows") — WINDOW FILE: proven on the clone, left for the window
-- based-on: custom._record_row_defaults() 9679372d0eebddc0a21b7b6c2fa63ebcda4cc91518115ea174f49c7136665cfd
-- lock: custom
--
-- A NEW ROW REMEMBERS WHAT ITS TABLE'S DEFAULTS GAVE IT. custom.table_row_defaults_apply ("Apply to existing
-- rows", chairdoors3b_d) tells a row that follows its Table's defaults from one somebody set by hand by the
-- row's own marker metadata.row_controls_from_default. The apply door writes the marker on the rows it
-- stamps; this file makes EVERY insert path write it too (forms, imports, graph writes, the client write
-- doors — all pass this BEFORE INSERT trigger), so a row born under default A moves to default B when the
-- person later presses Apply, while a row she changed by hand keeps its value. Before this file such rows
-- read as set by hand (the safe side) and kept theirs.
-- The based-on hash is the clone's (the function is not on production until chairdoors2_j_store_rows lands);
-- the runner recomputes it against production at apply.
--
-- INVERSE: migrations/inverse/chairdoors3b_w3_a_new_row_remembers_what_its_tables_defaults_gave_it_down.sql

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
  -- CHAIR-DOORS-3B: THE ROW REMEMBERS WHAT THE TABLE DEFAULT GAVE IT (metadata.row_controls_from_default,
  -- a registered system key), so custom.table_row_defaults_apply can later tell a row that still follows
  -- the default from one somebody set by hand — whichever door stamped the value (this trigger, or a write
  -- door that sent the default itself). A control whose value equals the Table's default is "from the default".
  new.metadata := jsonb_set(coalesce(new.metadata, '{}'::jsonb), '{row_controls_from_default}',
    jsonb_strip_nulls(jsonb_build_object(
      'shown_to', case when v_d ? 'shown_to' and new.shown_to::text = v_d ->> 'shown_to' then v_d ->> 'shown_to' end,
      'published_to_web', case when (v_d ->> 'published_to_web')::boolean and new.published_to_web then true end,
      'indexed', case when v_d ? 'indexed' and new.search_engine_indexed is not distinct from (v_d ->> 'indexed')::boolean then (v_d ->> 'indexed')::boolean end)),
    true);
  if new.metadata -> 'row_controls_from_default' = '{}'::jsonb then
    new.metadata := new.metadata - 'row_controls_from_default';
  end if;
  return new;
end
$function$
;
