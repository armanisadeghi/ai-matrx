-- LANE VERSION-HISTORY-FIX — THE CENSUS: THE REPAIR LOWERED ONLY ROWS THAT NEVER CHANGED, AND THE
-- FOUR TRIGGERED TABLES STAY AGREED WITH THEIR HISTORY. Read-only; ends in ROLLBACK.
--
-- The one thing this lane must never do is lower the version of a row whose content really
-- changed after its last history entry (VERSION-HISTORY-CENSUS.md: 95 such rows — 83 notes, 9
-- mandate definitions, 2 HR employees, 1 quiz session). This suite proves it from the log, row by
-- row, rather than trusting the file's own receipt.
--
--   1  the repair ran: this lane's `version_agrees_with_history` log lines exist (RED before the
--      class (a) file is applied — the SKIP below keys on the trigger, not the log)
--   2  EVERY row this lane lowered is content-identical to its history row at the version it was
--      lowered to, and sits at exactly that version or above: 0 real-change rows touched
--   3  every row that is ahead of its history with DIFFERENT content has NO log line from this
--      lane (the real-drift rows kept their version) — and the count is printed per table
--   4  web.page, workbench.notes, content_ir.kind_definition, browser.profile: 0 rows ahead of
--      their history with identical content (the trigger keeps it zero from now on; ratchet
--      ZERO, no allow-list)
--   5  information only, never a failure: the tables where new content-same rows ahead are
--      EXPECTED to reappear, and why (sch_task ticks; workflow.definition publishes and untriggered
--      no-op saves; the three class (b) tables have no trigger by the census's ruling)

\set ON_ERROR_STOP on
\set suite 'versionhistoryfix_census_green.sql'
\set requires 'function:platform.no_change_keeps_its_version'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local statement_timeout = '300s';

create temporary table _c (store text, token text, id uuid, version int, mv int, same boolean) on commit drop;

do $measure$
declare c record;
begin
  for c in select * from (values
      ('web.page', 'web_page', array[]::text[]), ('workbench.notes', 'note', array[]::text[]),
      ('workflow.definition', 'workflow', array[]::text[]),
      ('content_ir.kind_definition', 'content_ir_kind', array[]::text[]),
      ('browser.profile', 'browser_profile', array[]::text[]),
      ('scheduler.sch_task', 'sch_task', array['next_due_at','last_run_at']),
      ('chat.agent_run', 'agent_run', array[]::text[]), ('hr.employee', 'hr_employee', array[]::text[]),
      ('hr.employee_private', 'hr_employee_private', array[]::text[])) v(store, token, extra)
  loop
    -- Every row that is ahead of its history, OR that this lane logged (whatever its version now).
    execute format($q$
      insert into _c
      select %2$L, %3$L, t.id, t.version, h.mv,
        (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
           from jsonb_each((to_jsonb(t) - 'search_tsv' - 'embedding') - $1) e
          where h.row_data ? e.key or e.value not in ('null'::jsonb, '{}'::jsonb, '[]'::jsonb))
        = ((h.row_data - 'search_tsv' - 'embedding') - $1)
      from %1$s t
      cross join lateral (select r.version as mv, r.row_data from history.row_versions r
                           where r.entity_type = %3$L and r.row_id = t.id
                           order by r.version desc, r.id desc limit 1) h
      where t.version > h.mv
         or exists (select 1 from history.migration_log m
                     where m.target_id = t.id and m.verb = 'version_agrees_with_history'
                       and m.inverse ->> 'lane' = 'VERSION-HISTORY-FIX' and m.inverse ->> 'store' = %2$L
                       and m.undone_at is null)$q$, c.store::regclass, c.store, c.token)
    using array['version', 'updated_at'] || c.extra;
  end loop;
end
$measure$;

do $suite$
declare v_n int; v_bad text; v_line text;
begin
  select count(*) into v_n from history.migration_log m
   where m.verb = 'version_agrees_with_history' and m.inverse ->> 'lane' = 'VERSION-HISTORY-FIX'
     and m.undone_at is null;
  if v_n = 0 then
    raise exception '1: no VERSION-HISTORY-FIX version_agrees_with_history line exists — the repair has not run here';
  end if;
  raise notice '1 PASSED — % repair line(s) from this lane', v_n;

  -- 2: every lowered row is identical to its history (a row later changed for real has a newer
  -- history row, which it then equals; a row that is not identical is a real change we lowered).
  select count(*), string_agg(format('%s %s (now v%s, logged v%s->v%s, history v%s, same=%s)',
                                     m.inverse ->> 'store', m.target_id, c.version,
                                     m.inverse ->> 'version_before', m.inverse ->> 'version_after', c.mv, c.same), '; ')
    into v_n, v_bad
    from history.migration_log m
    left join _c c on c.id = m.target_id and c.store = m.inverse ->> 'store'
   where m.verb = 'version_agrees_with_history' and m.inverse ->> 'lane' = 'VERSION-HISTORY-FIX'
     and m.undone_at is null
     and (c.id is null or not c.same or c.version < (m.inverse ->> 'version_after')::int);
  if v_n <> 0 then
    raise exception '2: % row(s) this lane lowered do NOT match their history (a real change was lowered, or the row is gone): %', v_n, left(v_bad, 2000);
  end if;
  raise notice '2 PASSED — every row this lane lowered is identical to its history at the lowered version: 0 real-change rows touched';

  -- 3: the real-drift rows carry no log line from this lane
  select count(*) into v_n from _c c
   where not c.same
     and exists (select 1 from history.migration_log m where m.target_id = c.id
                  and m.verb = 'version_agrees_with_history' and m.inverse ->> 'lane' = 'VERSION-HISTORY-FIX');
  select string_agg(format('%s %s', store, n), ', ' order by store) into v_line
    from (select store, count(*) n from _c where not same and version > mv group by 1) x;
  if v_n <> 0 then
    raise exception '3: % row(s) ahead of their history with DIFFERENT content carry a VERSION-HISTORY-FIX log line', v_n;
  end if;
  raise notice '3 PASSED — real-drift rows kept their version, none logged by this lane (%)', coalesce(v_line, 'none');

  -- 4: the ratchet on the four triggered tables that have no by-design drift
  select count(*), string_agg(distinct store, ', ') into v_n, v_bad from _c
   where same and version > mv
     and store in ('web.page', 'workbench.notes', 'content_ir.kind_definition', 'browser.profile');
  if v_n <> 0 then
    raise exception '4: % row(s) on % are ahead of their history with identical content — a no-op save moved the version (trigger missing, disabled or bypassed)', v_n, v_bad;
  end if;
  raise notice '4 PASSED — web.page, workbench.notes, content_ir.kind_definition, browser.profile: 0 content-same rows ahead';

  -- 5: information
  select string_agg(format('%s %s', store, n), ', ' order by store) into v_line
    from (select store, count(*) n from _c where same and version > mv
             and store in ('scheduler.sch_task', 'workflow.definition', 'chat.agent_run', 'hr.employee', 'hr.employee_private')
           group by 1) x;
  raise notice '5 INFO — content-same rows ahead, expected to recur (sch_task: schedule ticks move the version by design; workflow.definition: publish counter held by its snapshots + untriggered no-op saves; class (b): no trigger by ruling): %', coalesce(v_line, 'none');

  raise notice 'versionhistoryfix_census_green: ALL 4 CLAUSES PASSED (+1 INFO)';
end
$suite$;
rollback;
