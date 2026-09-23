-- chair-step: THE INVERSE of migrations/campaign/storeversionnoop_the_versions_ahead_of_their_history_come_back.sql.
--   For every `history.migration_log` line that file wrote (verb `version_agrees_with_history`,
--   lane STORE-VERSION-NOOP, not yet undone) whose row still sits at the lowered number, it puts
--   the version back to `version_before` and marks the line undone. That puts the defect back on
--   those rows: version ahead of a history that recorded no change. It exists for rule 27; nobody
--   should want it on the main database. The two UPDATEs run with `session_replication_role = replica`
--   (a plain SET — `set_config` inside a function is refused for this parameter), for the same reason the up does, and is set back to `origin`.
-- lock: custom,platform
-- lane: STORE-VERSION-NOOP

set local lock_timeout = '5s';

create temporary table _svn_undo on commit drop as
select m.id as log_id, m.organization_id, m.target_id as id, m.inverse ->> 'store' as store,
       (m.inverse ->> 'version_before')::integer as version_before,
       (m.inverse ->> 'version_after')::integer  as version_after
  from history.migration_log m
 where m.verb = 'version_agrees_with_history'
   and m.inverse ->> 'lane' = 'STORE-VERSION-NOOP'
   and m.undone_at is null;

set local session_replication_role = replica;

update custom.record r set version = u.version_before
  from _svn_undo u
 where u.store = 'custom.record' and r.organization_id = u.organization_id and r.id = u.id
   and r.version = u.version_after;

update platform.saved_view v set version = u.version_before
  from _svn_undo u
 where u.store = 'platform.saved_view' and v.id = u.id and v.version = u.version_after;

set local session_replication_role = origin;

update history.migration_log m set undone_at = now()
  from _svn_undo u where m.id = u.log_id;

do $receipt$
begin
  if current_setting('session_replication_role') <> 'origin' then
    raise exception 'session_replication_role is still %', current_setting('session_replication_role');
  end if;
  raise notice 'STORE-VERSION-NOOP repair UNDONE: % log line(s) marked undone, their rows put back to the earlier version',
    (select count(*) from _svn_undo);
end
$receipt$;
