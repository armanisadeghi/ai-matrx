-- chair-step: THE INVERSE of migrations/campaign/versionhistoryfix_b_the_server_read_tables_agree_with_their_history.sql.
--   For every `history.migration_log` line the up wrote (verb `version_agrees_with_history`, lane
--   VERSION-HISTORY-FIX, store chat.agent_run / hr.employee / hr.employee_private, not yet undone)
--   whose row still sits at the lowered number, it puts the version back to `version_before` and
--   marks the line undone. That puts those rows ahead of their history again. It exists for rule
--   27. The UPDATEs run with `session_replication_role = replica`, set back to origin after.
-- lock: platform
-- lane: VERSION-HISTORY-FIX

set local lock_timeout = '5s';

create temporary table _vhf_undo on commit drop as
select m.id as log_id, m.target_id as id, m.inverse ->> 'store' as store,
       (m.inverse ->> 'version_before')::integer as version_before,
       (m.inverse ->> 'version_after')::integer  as version_after
  from history.migration_log m
 where m.verb = 'version_agrees_with_history'
   and m.inverse ->> 'lane' = 'VERSION-HISTORY-FIX'
   and m.inverse ->> 'store' in ('chat.agent_run', 'hr.employee', 'hr.employee_private')
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
  raise notice 'VERSION-HISTORY-FIX (b) UNDONE: % log line(s) marked undone, their rows put back to the earlier version',
    (select count(*) from _vhf_undo);
end
$receipt$;
