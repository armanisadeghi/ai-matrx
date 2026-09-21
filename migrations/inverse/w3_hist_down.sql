-- based-on: custom.value_envelope_keys() a44b4185503b5cabad23e16060fc1a0a8d5afb1c81a6528ef723a5d3c24b7d8e
-- chair-step: W3-HIST's inverse — removes everything the lane CREATED (schema `history`'s
-- capture, retention, prune, migration log, undo, replay and grant capture; schema `custom`'s
-- two new guards and their triggers; the `record` sharing registration). Run it and the
-- History layer this campaign added is gone; re-apply the lane's ten files and it is back.
-- It is destructive to THIS LANE'S objects and to nothing else, and it takes the store's
-- history WITH it — every row this campaign's trigger wrote to history.row_versions for
-- custom.record stays, but nothing can read it by name any more.
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH, AND WHY EACH ONE:
--   · `custom._table_shape_guard` — W1-TABLE's, replaced by this lane only to make it read the
--     organization's floor instead of the literal 30. Reverting that re-introduces the literal
--     and lets a Table declare a retention below a raised floor. A down-migration never
--     restores a weaker guard.
--   · `platform.knob_scope_kind`'s eleven rungs — levelled onto the branch by this lane because
--     the branch held ZERO and no knob override of any kind could be written. Every lane's
--     organization-rung clause now depends on them. Removing them would break lanes that never
--     knew this lane existed.
--   · `history.row_versions`, its partitions and `history.ensure_row_version_partitions` — they
--     predate this campaign by over a million rows and are not ours to remove.
--
-- RUN IT:
--   node node_modules/tsx/dist/cli.mjs scripts/apply-migration.ts \
--     migrations/inverse/w3_hist_down.sql --target branch

drop trigger if exists zzz_history_grant_capture on iam.permissions;
drop trigger if exists zzz_history_capture on custom.record;
drop trigger if exists custom_record_dated_values_guard on custom.record;
drop trigger if exists custom_record_merge_field_temporal_guard on custom.record;

drop function if exists history.grant_capture();
drop function if exists history.record_capture();
drop function if exists custom._dated_values_guard();
drop function if exists custom._merge_field_temporal_guard();

-- 🚨 SIX FUNCTIONS AND BOTH TABLES STAY STANDING, AND THE TABLES ARE EMPTIED (lane
-- INVERSE-GUARD, 2026-09-21). The header above lists what this file deliberately does not
-- touch; this is the rest of that list, and it was found the way `storerel` was — by asking
-- what the LIVE catalogue still reaches. Twelve live triggers and five lanes outside W3-HIST
-- now depend on these eight objects:
--   · `history.retention_days` and `history.retention_floor_days` — `custom._store_door` runs
--     under SIX live triggers (`custom_record_store_door` on the record store and its
--     partitions, both `custom.external_link` doors, both `custom.external_source` doors) and
--     reads them; `custom._table_shape_guard`
--     (`fieldguards_a_refusal_is_a_whole_sentence.sql`, under `custom_record_table_shape_guard`)
--     reads the floor; `custom.organization_clear`
--     (`orgdel_the_clear_goes_through_the_purge.sql`) reads the days.
--   · `history.retention_set` and `history.retention_floor_raise` — `custom.history_retention_set`
--     and `custom.history_retention_floor_raise` (`storerel_pruning_can_be_asked_for.sql`) are
--     the doors STORE-REL built ON TOP of them.
--   · `history.migration_record` and `history.migration_log` —
--     `custom._field_type_converts_values` (under `custom_record_field_type_converts_values`)
--     and `custom.migrate_reclass` (`apprvtail_a_field_row_is_a_field.sql`) write them.
--   · `history.capture_is_open` and `history.capture_window` — the statement-level capture
--     `history.record_capture_stmt_insert` / `_update` / `_delete`
--     (`writeperf2_the_after_triggers_fire_once_per_statement.sql`), under
--     `zzz_history_capture_s_i` / `_s_u` / `_s_d`, and `platform._knob_history_capture` under
--     `knob_history_capture_tg` on BOTH `platform.knob_override` and `platform.feature_knob`,
--     and `custom.visibility_as_of` (`asof_the_audit_says_how_long.sql`).
-- Dropping them would not put W3-HIST's defect back — it would stop every write to the record
-- store, to both external tables and to every knob, which is the same shape lane RED-SUITES-3
-- measured in `w1_v1_fixes_one_door_predicate_down.sql` on 2026-09-21.
--
-- So those eight are LEFT WHERE THEY ARE and the behaviour is NEUTERED instead. Everything
-- else W3-HIST created still goes: the capture triggers and their bodies, the grant capture,
-- the two guards, undo, replay, snapshot, prune, who-could-see, as-of, merge-field resolve,
-- record_versions and record_at, and the sharing registration below. And the two surviving
-- tables are EMPTIED — the remedy `mergehist_a_compound_operation_signs_its_revision_down.sql`
-- uses for `history.row_versions.migration_id` — so no capture window is open and no migration
-- is on the log. After this file runs nothing can read the store's history by name, nothing
-- captures it and nothing replays it, which is the state W3-HIST found; the six survivors just
-- keep answering the lanes that adopted them.
drop function if exists history.who_could_see(uuid, uuid, timestamptz);
drop function if exists history.grants_at(text, uuid, timestamptz);
drop function if exists history.snapshot_restore(uuid, uuid, integer);
drop function if exists history.snapshot_chain(uuid, uuid);
drop function if exists history.value_undo(uuid, uuid, text);
drop function if exists history.migration_undo(uuid, uuid);
drop function if exists history.merge_field_resolve(uuid, uuid, uuid, text);
drop function if exists history.value_as_of(uuid, uuid, text, date, timestamptz);
drop function if exists history.value_in_document(jsonb, text, date);
drop function if exists history.prune(uuid, text, uuid, boolean);
drop function if exists history.record_versions(uuid, uuid);
drop function if exists history.record_at(uuid, uuid, timestamptz);
drop function if exists history.assert_watching(text, timestamptz);

delete from history.migration_log;
delete from history.capture_window;
--   deliberately NOT dropped — adopted on the live path, see above:
--   history.migration_record(uuid, text, text, uuid, jsonb, text)
--   history.retention_set(uuid, uuid, integer)
--   history.retention_days(uuid, uuid)
--   history.retention_floor_raise(uuid, integer)
--   history.retention_floor_days(uuid)
--   history.capture_is_open(uuid)
--   table history.migration_log
--   table history.capture_window

-- VIS-16's registration. Removing it puts `history.who_could_see` back to answering "nobody"
-- for every record, which is the state this lane found and named.
delete from platform.shareable_resource_registry where resource_type = 'record';

-- The value envelope's key list goes back to W1-VAL's seven — `dated` (HIS-5) is this lane's
-- eighth and the only change this lane made to it.
create or replace function custom.value_envelope_keys()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select array['ver', 'src', 'actor', 'on_behalf_of', 'at', 'absent', 'alternates']::text[];
$fn$;
