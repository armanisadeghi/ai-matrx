-- chair-step: it REPAIRS data. For every live `custom.record` (and `platform.saved_view`) row whose
--   `version` is ahead of the last version its history recorded AND whose content is identical to
--   that last history row (apart from the bookkeeping keys the capture ignores), it lowers
--   `version` to the history's number and writes one `history.migration_log` line per row naming
--   this lane, with both numbers. Nothing else in any row changes; no history row is written or
--   removed; no function, trigger, grant or policy is touched. The two UPDATEs run with
--   `session_replication_role = replica` (a plain SET LOCAL) and nothing else does (so `_touch_row` does not
--   raise the version it is lowering, and no outbox event or history row is written for a change
--   that is not one), and is set back to `origin` before anything else runs. Row locks only, on
--   the rows it repairs. The inverse is
--   `migrations/inverse/storeversionnoop_the_versions_ahead_of_their_history_come_back_down.sql`.
-- lock: custom,platform
-- lane: STORE-VERSION-NOOP
--
-- STORE-VERSION-NOOP — THE RECORDS WHOSE VERSION RAN AHEAD OF THEIR HISTORY COME BACK.
--
-- WHAT IS WRONG, MEASURED ON THE DEV CLONE 2026-09-23 BEFORE A BYTE WAS WRITTEN. Until
-- `storeversionnoop_a_write_that_changes_nothing_keeps_its_version.sql`, a write that changed
-- nothing still raised `version` and wrote no history row. 70 live records drifted that way —
-- 52 records, 11 Fields, 4 Tables, 3 Rules, across 10 organizations, 345 phantom versions in all,
-- the largest gap 15 — among them Birchwood's quote-board view record. On every one of them the
-- current row is IDENTICAL to its last history row but for version / updated_at / updated_by.
-- `platform.saved_view`: 0. Every screen that takes the version from the history is behind on
-- those records and is told "Someone else changed this record" by its next save.
--
-- WHICH REPAIR, AND THE EVIDENCE FOR IT. Two were on the table: record a repair entry in the
-- history at the current number, or lower the version to the history's number. The history entry
-- is refused: a `history.row_versions` row at version N says "this is what the record became at
-- version N", and nothing became anything — it would be exactly the invented "something changed"
-- row the ruling forbids. Lowering is safe only if NOTHING POINTS AT THE NEWER NUMBERS, and that
-- was measured on all 70:
--   · history.row_versions — ends at the lower number by definition;
--   · custom.io_outbox — 86 events for these records, 0 whose dedupe key carries a version above
--     the history's (an event is only written for a real change, and a real change is always in
--     the history);
--   · history.migration_log — 1 line names one of these records (a Field retype, 2026-09-21);
--     it carries no version number;
--   · custom.record documents that name these records and say "version" — 1 (an enrichment run
--     naming a Table), and its "version" is `model_version`, not a record version;
--   · the per-value `_values.*.ver` numbers are each value's own count (`custom.value_versions`),
--     not the record's, and are not touched.
-- The one thing that may hold a phantom number is a screen open right now; its next save is
-- refused PT409 naming the real version, which records-ui (0.84.0 `updateOnTheWinningVersion`)
-- re-sends on, exactly as it does today in the other direction. So the version comes DOWN.
--
-- A ROW THAT IS AHEAD BUT WHOSE CONTENT DIFFERS from its last history row is NOT repaired here:
-- that is a real change the history missed (a closed capture), and lowering its version would
-- claim it never happened. On the clone there are none; the file counts them and says so.
--
-- THE LOG. One `history.migration_log` line per repaired row, verb
-- `version_agrees_with_history`, `inverse = {"kind":"none", …}` with `version_before` and
-- `version_after`: `history.migration_undo` answers "cannot be undone, and said so when it ran",
-- because undoing it would put the defect back. The whole-file inverse exists for rule 27 and
-- reads its numbers from these lines.

set local lock_timeout = '5s';

create temporary table _svn_repair (
  organization_id uuid, id uuid, kind text, target_kind text,
  version_before integer, version_after integer
) on commit drop;

-- custom.record: the keys `history.record_capture_stmt_update` ignores.
insert into _svn_repair
with h as (
  select distinct on (row_id, organization_id) row_id, organization_id, version as mv, row_data
    from history.row_versions
   where entity_type = 'custom.record'
   order by row_id, organization_id, version desc, id desc)
select r.organization_id, r.id, 'custom.record', r.data_class, r.version, h.mv
  from custom.record r
  join h on h.row_id = r.id and h.organization_id = r.organization_id
 where r.deleted_at is null
   and r.version > h.mv
   and (to_jsonb(r) - 'version' - 'updated_at' - 'updated_by')
       = (h.row_data - 'version' - 'updated_at' - 'updated_by');

-- platform.saved_view: the keys `platform._version_capture` ignores.
insert into _svn_repair
with h as (
  select distinct on (row_id) row_id, version as mv, row_data
    from history.row_versions
   where entity_type = 'platform_saved_view'
   order by row_id, version desc, id desc)
select v.organization_id, v.id, 'platform.saved_view', 'saved_view', v.version, h.mv
  from platform.saved_view v
  join h on h.row_id = v.id
 where v.deleted_at is null
   and v.organization_id is not null
   and v.version > h.mv
   and ((to_jsonb(v) - 'search_tsv' - 'embedding') - 'version' - 'updated_at')
       = ((h.row_data - 'search_tsv' - 'embedding') - 'version' - 'updated_at');

-- THE TWO STATEMENTS THAT RUN WITHOUT TRIGGERS, and only they. (A plain SET is the only form the
-- platform lets this role use for this parameter; `set_config` from inside a function is refused.)
set local session_replication_role = replica;

update custom.record r
   set version = x.version_after
  from _svn_repair x
 where x.kind = 'custom.record'
   and r.organization_id = x.organization_id and r.id = x.id
   and r.version = x.version_before;

update platform.saved_view v
   set version = x.version_after
  from _svn_repair x
 where x.kind = 'platform.saved_view'
   and v.id = x.id and v.version = x.version_before;

set local session_replication_role = origin;

insert into history.migration_log (organization_id, verb, target_kind, target_id, inverse, note)
select x.organization_id, 'version_agrees_with_history', x.target_kind, x.id,
       jsonb_build_object(
         'kind', 'none',
         'why', 'Undoing this would put the defect back: a version ahead of a history that recorded no change.',
         'store', x.kind,
         'version_before', x.version_before,
         'version_after', x.version_after,
         'lane', 'STORE-VERSION-NOOP'),
       format('STORE-VERSION-NOOP (2026-09-23): version %s -> %s. Every version above %s was raised by a write that changed nothing, so the history never recorded it; the record''s content is identical to its history at version %s.',
              x.version_before, x.version_after, x.version_after, x.version_after)
  from _svn_repair x;

-- THE RECEIPT, and the refusal if the numbers do not add up.
do $receipt$
declare
  v_planned  integer := (select count(*) from _svn_repair);
  v_landed   integer;
  v_logged   integer;
  v_skipped  integer;
  v_left     integer;
begin
  if current_setting('session_replication_role') <> 'origin' then
    raise exception 'STORE-VERSION-NOOP repair: session_replication_role is still %, so every trigger after this would be off', current_setting('session_replication_role');
  end if;
  select count(*) into v_landed from _svn_repair x
   where (x.kind = 'custom.record' and exists (select 1 from custom.record r
            where r.organization_id = x.organization_id and r.id = x.id and r.version = x.version_after))
      or (x.kind = 'platform.saved_view' and exists (select 1 from platform.saved_view v
            where v.id = x.id and v.version = x.version_after));
  select count(*) into v_logged from history.migration_log m
   where m.verb = 'version_agrees_with_history' and m.inverse ->> 'lane' = 'STORE-VERSION-NOOP'
     and m.undone_at is null and m.applied_at = now();
  if v_landed <> v_planned or v_logged <> v_planned then
    raise exception 'STORE-VERSION-NOOP repair: % row(s) planned, % landed, % logged — nothing is kept', v_planned, v_landed, v_logged;
  end if;
  -- What is still ahead: rows whose content DIFFERS from their last history row (a real change the
  -- history missed) — left alone and counted, never lowered.
  with h as (select row_id, organization_id, max(version) mv from history.row_versions
              where entity_type = 'custom.record' group by 1, 2)
  select count(*) into v_left
    from custom.record r join h on h.row_id = r.id and h.organization_id = r.organization_id
   where r.deleted_at is null and r.version > h.mv;
  raise notice 'STORE-VERSION-NOOP repair: % row(s) brought back to their history''s version (custom.record %, platform.saved_view %), % log line(s); custom.record rows still ahead (different content, left untouched): %',
    v_planned, (select count(*) from _svn_repair where kind = 'custom.record'),
    (select count(*) from _svn_repair where kind = 'platform.saved_view'), v_logged, v_left;
end
$receipt$;
