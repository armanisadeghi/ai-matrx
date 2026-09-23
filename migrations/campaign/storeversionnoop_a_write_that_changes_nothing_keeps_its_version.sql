-- additive: yes
--
-- chair-step: it CREATES one trigger function, `platform.no_change_keeps_its_version()`, and binds
--   it as the LAST before-row trigger on two tables: `custom.record` (the store) and
--   `platform.saved_view` (the view store `custom.view_declare` writes). Nothing is replaced,
--   dropped, granted or revoked; no existing function body is touched; no row of anybody's data
--   is written. The `create trigger` on `custom.record` takes SHARE ROW EXCLUSIVE on the parent
--   and its 16 partitions for the length of this transaction (writers wait, readers and sign-in
--   do not), which the runner rules window-class on a partitioned parent. The inverse is
--   `migrations/inverse/storeversionnoop_a_write_that_changes_nothing_keeps_its_version_down.sql`.
-- window-class: create trigger on the partitioned parent custom.record — SHARE ROW EXCLUSIVE on the
--   parent and its 16 partitions, every WRITER to the store waits to COMMIT; readers and sign-in
--   untouched. At production: 01:00–04:00 Pacific.
-- lock: custom,platform
-- lane: STORE-VERSION-NOOP
--
-- STORE-VERSION-NOOP — A WRITE THAT CHANGES NOTHING CHANGES NOTHING.
--
-- WHAT WAS WRONG, REPRODUCED FROM test@test.com's SEAT ON THE DEV CLONE, 2026-09-23.
-- A tester at Cascade Backflow Testing opens a reading and presses Save without changing
-- anything. `custom.record_update(org, reading, {"pressure_psi": 5.9}, 1)` answered **2**, the
-- record was stored at version 2, and `history.row_versions` still ended at version 1
-- (scripts/campaign-tests/storeversionnoop_green.sql clause 2, RED on these bytes' absence).
-- Every screen that reads the version from the history was then one behind, and the next real
-- save was refused "Someone else changed this record while you were working on it" — the cause
-- of VERIFIER-15 M4. 70 live records on the clone (52 records, 11 Fields, 4 Tables, 3 Rules, in
-- 10 organizations) had already drifted that way, every one of them identical in content to its
-- last history row.
--
-- THE ROOT CAUSE IS TWO RULES THAT DISAGREE ABOUT WHAT "A CHANGE" IS.
--   · `platform._touch_row` (before-row, early in the chain) sets `version := OLD.version + 1` on
--     EVERY update. It cannot judge: a dozen before-row triggers after it still rewrite NEW
--     (the value envelope, choice words, derived fields, relation kernel targets …).
--   · The history captures skip an update whose row is unchanged apart from bookkeeping:
--     `history.record_capture_stmt_update` ignores version, updated_at, updated_by;
--     `platform._version_capture` (saved_view) ignores version, updated_at (and search_tsv,
--     embedding). The outbox skips it too (`custom.io_record_changed_stmt_update`: "NO VALUE
--     MOVED, so there is no event"). That half is right: HIS-1 is "nothing can opt out of being
--     recorded", not "every statement writes a row".
--   So the version was the only thing that believed a no-op was a change.
--
-- THE FIX, IN THE ONE PLACE EVERY DOOR PASSES. The ruling says fix it in the door; the door every
-- write door shares is the row itself. `custom.record_update`, `field_update`, `field_declare`,
-- `rule_declare`, `dashboard_declare`, `pipeline_declare`, `subscription_mute`, `enrich_land`,
-- `entity_field_update`, `record_reparent`, `migrate_*` … (the census in
-- PROGRESS-STORE-VERSION-NOOP.md: 45 functions UPDATE custom.record, and `view_declare` UPDATEs
-- platform.saved_view) all end in an UPDATE of these two tables, several of them with their own
-- `version = version + 1` in the SET list, which `_touch_row` overrides anyway. Patching each body
-- would leave the next door to be written open; a trigger that runs LAST closes the class.
--
-- `platform.no_change_keeps_its_version(VARIADIC bookkeeping keys)` runs after every other
-- before-row trigger (its name sorts last), compares the final NEW with OLD with EXACTLY the keys
-- that table's history capture ignores, and when they are equal it RETURNS OLD: the row is
-- written back as it was, version, updated_at and updated_by included. So:
--   · the version does not move and no history row is written — the two now agree by
--     construction, because the comparison IS the capture's comparison;
--   · every door still answers the current version, because each reads it back with
--     `returning version` — and it is OLD's;
--   · a CAS against a stale version is still refused PT409 before the row is ever touched.
-- It never returns NULL, so no door's `returning` comes back empty and no caller is told a live
-- record is gone.
--
-- WHY ONLY THESE TWO TABLES, SAID PLAINLY. The same shape (`_touch_row` + a capture that skips a
-- contentless update) exists on 306 tables across the platform; measured on the clone, 58 of them
-- carry 13,422 rows ahead of their history. Those are not the record store and this lane has no
-- evidence about what else reads their version numbers, so binding a trigger to all of them is a
-- separate, measured lane; the census is in PROGRESS-STORE-VERSION-NOOP.md with the query that
-- produced it. The function is generic on purpose so that lane is one `create trigger` per table.

create or replace function platform.no_change_keeps_its_version()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
-- STORE-VERSION-NOOP. Bound LAST among a table's before-row UPDATE triggers, with the keys that
-- table's history capture ignores as its arguments. An update that leaves the row unchanged in
-- everything but those keys is not a version of anything: the row is written back exactly as it
-- was, so its version, updated_at and updated_by stay where they were, and the history (which
-- skips it by the same comparison) and the version agree. Never returns NULL — a door's
-- `returning version` must still answer the current version.
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if (to_jsonb(new) - tg_argv) is distinct from (to_jsonb(old) - tg_argv) then
    return new;
  end if;
  return old;
end;
$function$;

comment on function platform.no_change_keeps_its_version() is
  'STORE-VERSION-NOOP (2026-09-23): a write that changes nothing changes nothing. Bound last among before-row UPDATE triggers with the bookkeeping keys the table''s history capture ignores; when NEW equals OLD but for those keys it returns OLD, so the version does not move and no history row is written. Never returns NULL.';

-- custom.record: the keys `history.record_capture_stmt_update` ignores.
create trigger zzzzz_no_change_keeps_its_version
  before update on custom.record
  for each row execute function platform.no_change_keeps_its_version('version', 'updated_at', 'updated_by');

-- platform.saved_view: the keys `platform._version_capture` ignores.
create trigger zzzzz_no_change_keeps_its_version
  before update on platform.saved_view
  for each row execute function platform.no_change_keeps_its_version('version', 'updated_at', 'search_tsv', 'embedding');
