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

drop function if exists history.who_could_see(uuid, uuid, timestamptz);
drop function if exists history.grants_at(text, uuid, timestamptz);
drop function if exists history.snapshot_restore(uuid, uuid, integer);
drop function if exists history.snapshot_chain(uuid, uuid);
drop function if exists history.value_undo(uuid, uuid, text);
drop function if exists history.migration_undo(uuid, uuid);
drop function if exists history.migration_record(uuid, text, text, uuid, jsonb, text);
drop function if exists history.merge_field_resolve(uuid, uuid, uuid, text);
drop function if exists history.value_as_of(uuid, uuid, text, date, timestamptz);
drop function if exists history.value_in_document(jsonb, text, date);
drop function if exists history.prune(uuid, text, uuid, boolean);
drop function if exists history.retention_set(uuid, uuid, integer);
drop function if exists history.retention_days(uuid, uuid);
drop function if exists history.retention_floor_raise(uuid, integer);
drop function if exists history.retention_floor_days(uuid);
drop function if exists history.record_versions(uuid, uuid);
drop function if exists history.record_at(uuid, uuid, timestamptz);
drop function if exists history.assert_watching(text, timestamptz);
drop function if exists history.capture_is_open(uuid);

drop table if exists history.migration_log;
drop table if exists history.capture_window;

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
