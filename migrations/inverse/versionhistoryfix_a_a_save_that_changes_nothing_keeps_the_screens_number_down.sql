-- chair-step: THE INVERSE of migrations/campaign/versionhistoryfix_a_a_save_that_changes_nothing_keeps_the_screens_number.sql.
--   It takes `zzzzz_no_change_keeps_its_version` back off web.page, workbench.notes,
--   content_ir.kind_definition, browser.profile and scheduler.sch_task (the function itself is
--   STORE-VERSION-NOOP's and stays), and for every `history.migration_log` line the up wrote
--   (verb `version_agrees_with_history`, lane VERSION-HISTORY-FIX, one of the up's six stores, not
--   yet undone) whose row still sits at the lowered number, it puts the version back to
--   `version_before` and marks the line undone. That puts the defect back: a save that changes
--   nothing moves the version again, and those rows are ahead of their history again. It exists for
--   rule 27; nobody should want it on the main database. The UPDATEs run with
--   `session_replication_role = replica` for the same reason the up's do, and it is set back.
-- window-class: DROP TRIGGER fires the supautils hook — ACCESS EXCLUSIVE on auth, storage and
--   realtime relations, sign-in stops for the length of the transaction. At production 01:00–04:00
--   Pacific only.
-- lock: platform
-- lane: VERSION-HISTORY-FIX

set local lock_timeout = '2s';

drop trigger if exists zzzzz_no_change_keeps_its_version on web.page;
drop trigger if exists zzzzz_no_change_keeps_its_version on workbench.notes;
drop trigger if exists zzzzz_no_change_keeps_its_version on content_ir.kind_definition;
drop trigger if exists zzzzz_no_change_keeps_its_version on browser.profile;
drop trigger if exists zzzzz_no_change_keeps_its_version on scheduler.sch_task;

create temporary table _vhf_undo on commit drop as
select m.id as log_id, m.target_id as id, m.inverse ->> 'store' as store,
       (m.inverse ->> 'version_before')::integer as version_before,
       (m.inverse ->> 'version_after')::integer  as version_after
  from history.migration_log m
 where m.verb = 'version_agrees_with_history'
   and m.inverse ->> 'lane' = 'VERSION-HISTORY-FIX'
   and m.inverse ->> 'store' in ('web.page', 'workbench.notes', 'workflow.definition',
                                 'content_ir.kind_definition', 'browser.profile', 'scheduler.sch_task')
   and m.undone_at is null;

set local session_replication_role = replica;

do $undo$
declare s text;
begin
  for s in select distinct store from _vhf_undo loop
    execute format(
      'update %1$s t set version = u.version_before from _vhf_undo u
        where u.store = %2$L and t.id = u.id and t.version = u.version_after',
      s::regclass, s);
  end loop;
end
$undo$;

set local session_replication_role = origin;

update history.migration_log m set undone_at = now()
  from _vhf_undo u where m.id = u.log_id;

do $receipt$
begin
  if current_setting('session_replication_role') <> 'origin' then
    raise exception 'session_replication_role is still %', current_setting('session_replication_role');
  end if;
  raise notice 'VERSION-HISTORY-FIX (a) UNDONE: 5 triggers dropped; % log line(s) marked undone, their rows put back to the earlier version',
    (select count(*) from _vhf_undo);
end
$receipt$;
