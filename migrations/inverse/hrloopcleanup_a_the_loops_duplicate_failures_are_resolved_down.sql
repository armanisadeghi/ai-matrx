-- chair-step: THE INVERSE of migrations/campaign/hrloopcleanup_a_the_loops_duplicate_failures_are_resolved.sql.
--   For every `history.migration_log` line the up wrote (verbs `failure_duplicate_resolved` and
--   `failure_kept_for_owner`, lane HR-LOOP-CLEANUP, not yet undone) it puts the failure row back:
--   a resolved duplicate returns to its prior state (open/retrying) with its prior resolved_at and
--   resolution_note, but only while it still carries this lane's note (a row an HR owner has since
--   worked is left alone); the kept row loses `metadata.hr_loop_cleanup`. Then it marks the lines
--   undone. That re-opens the duplicates. It exists for rule 27. Row locks only.
-- lock: platform
-- lane: HR-LOOP-CLEANUP

set local lock_timeout = '5s';

create temporary table _hlc_undo on commit drop as
select m.id as log_id, m.verb, m.target_id as id,
       m.inverse ->> 'state_before' as state_before,
       (m.inverse ->> 'resolved_at_before')::timestamptz as resolved_at_before,
       m.inverse ->> 'resolution_note_before' as resolution_note_before
  from history.migration_log m
 where m.verb in ('failure_duplicate_resolved', 'failure_kept_for_owner')
   and m.inverse ->> 'lane' = 'HR-LOOP-CLEANUP'
   and m.undone_at is null;

do $undo$
declare v_reopened int; v_unmarked int;
begin
  perform set_config('hr.privileged_write', 'on', true);

  update hr.workflow_failure f
     set state = u.state_before, resolved_at = u.resolved_at_before,
         resolution_note = u.resolution_note_before
    from _hlc_undo u
   where u.verb = 'failure_duplicate_resolved' and f.id = u.id
     and f.state = 'resolved' and f.resolution_note like 'HR-LOOP-CLEANUP (2026-09-24):%';
  get diagnostics v_reopened = row_count;

  update hr.workflow_failure f
     set metadata = f.metadata - 'hr_loop_cleanup'
    from _hlc_undo u
   where u.verb = 'failure_kept_for_owner' and f.id = u.id and f.metadata ? 'hr_loop_cleanup';
  get diagnostics v_unmarked = row_count;

  update history.migration_log m set undone_at = now() from _hlc_undo u where m.id = u.log_id;
  raise notice 'HR-LOOP-CLEANUP inverse: % failure(s) re-opened, % kept row(s) unmarked, % log line(s) marked undone',
    v_reopened, v_unmarked, (select count(*) from _hlc_undo);
end
$undo$;
