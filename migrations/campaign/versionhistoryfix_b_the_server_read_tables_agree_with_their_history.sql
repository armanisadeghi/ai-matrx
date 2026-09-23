-- chair-step: it REPAIRS data on three tables whose version only SERVER code compares, right
--   after re-reading it: `chat.agent_run`, `hr.employee`, `hr.employee_private`. A row whose version
--   ran ahead of the last version its history recorded, and whose content is IDENTICAL to that
--   history row, gets its version lowered to the history's number (never below a number an HR
--   workflow instance holds as its `target_version`), with one `history.migration_log` line per
--   row. A row whose content DIFFERS is never touched (hr.employee's 2 rows ahead are real drift
--   and stay). No trigger, function, grant or policy is touched. The UPDATEs run with
--   `session_replication_role = replica` and nothing else does. Row locks on the repaired rows
--   only. The inverse is
--   `migrations/inverse/versionhistoryfix_b_the_server_read_tables_agree_with_their_history_down.sql`.
-- lock: platform
-- lane: VERSION-HISTORY-FIX
--
-- VERSION-HISTORY-FIX, CLASS (b) — REPAIR ONLY.
--
-- WHY NO TRIGGER HERE (VERSION-HISTORY-CENSUS.md, class b). `services/podcast/reconcile.py`
-- CAS-claims `chat.agent_run` with a version it has read milliseconds before; the one HR door that
-- takes an expected version (`hr_employee_update(uuid,jsonb,integer)`) gets none from
-- `features/hr/service.ts`. A phantom bump cannot plausibly lose those races, so a trigger buys
-- nothing. The repair is housekeeping: the version and the history agree again for the census
-- ratchet and for any "version N" a history panel shows.
--
-- WHAT MAY HOLD A NUMBER. Every `%version%` column on the database was read: the only one that can
-- name these rows' version is `hr.workflow_instance.target_version` (target_id = the row), used
-- as the floor; 0 above the history number on the clone. Nothing names `chat.agent_run.version`.
-- The rest of the shape (content-same, the log line, the receipt) is class (a)'s, verbatim.

set local lock_timeout = '5s';

create temporary table _vhf_repair (
  store text, token text, organization_id uuid, id uuid,
  version_before integer, version_after integer
) on commit drop;

create temporary table _vhf_census (
  store text, ahead integer, same integer, drift integer, held integer
) on commit drop;

do $plan$
declare
  c record;
begin
  for c in
    select * from (values
      ('chat.agent_run',      'agent_run',           array[]::text[], 'null::integer'),
      ('hr.employee',         'hr_employee',         array[]::text[],
         '(select max(w.target_version) from hr.workflow_instance w where w.target_id = t.id)'),
      ('hr.employee_private', 'hr_employee_private', array[]::text[],
         '(select max(w.target_version) from hr.workflow_instance w where w.target_id = t.id)')
    ) v(store, token, extra, floor_sql)
  loop
    execute format($q$
      with cand as (
        select t.organization_id, t.id, t.version,
               greatest(h.mv, %4$s) as floor_v,
               (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                  from jsonb_each((to_jsonb(t) - 'search_tsv' - 'embedding') - $1) e
                 where h.row_data ? e.key or e.value not in ('null'::jsonb, '{}'::jsonb, '[]'::jsonb))
                 = ((h.row_data - 'search_tsv' - 'embedding') - $1) as same
          from %1$s t
          cross join lateral (select r.version as mv, r.row_data from history.row_versions r
                               where r.entity_type = %3$L and r.row_id = t.id
                               order by r.version desc, r.id desc limit 1) h
         where t.version > h.mv),
      ins as (
        insert into _vhf_repair
        select %2$L, %3$L, organization_id, id, version, floor_v
          from cand where same and floor_v < version
        returning 1)
      insert into _vhf_census
      select %2$L, count(*), count(*) filter (where same), count(*) filter (where not same),
             count(*) filter (where same and floor_v >= version)
        from cand$q$, c.store::regclass, c.store, c.token, c.floor_sql)
    using array['version', 'updated_at'] || c.extra;
  end loop;
end
$plan$;

do $refuse$
begin
  if exists (select 1 from _vhf_repair where organization_id is null) then
    raise exception 'VERSION-HISTORY-FIX: a candidate row carries no organization_id, so it cannot have its migration_log line — nothing is kept';
  end if;
end
$refuse$;

-- THE STATEMENTS THAT RUN WITHOUT TRIGGERS, and only they: `_touch_row` would raise the version
-- being lowered, and a capture/outbox row would record a change that is not one.
set local session_replication_role = replica;

do $lower$
declare s text;
begin
  for s in select distinct store from _vhf_repair loop
    execute format(
      'update %1$s t set version = x.version_after from _vhf_repair x
        where x.store = %2$L and t.id = x.id and t.version = x.version_before',
      s::regclass, s);
  end loop;
end
$lower$;

set local session_replication_role = origin;

insert into history.migration_log (organization_id, verb, target_kind, target_id, inverse, note)
select x.organization_id, 'version_agrees_with_history', x.token, x.id,
       jsonb_build_object(
         'kind', 'none',
         'why', 'Undoing this would put the defect back: a version ahead of a history that recorded no change.',
         'store', x.store,
         'version_before', x.version_before,
         'version_after', x.version_after,
         'lane', 'VERSION-HISTORY-FIX'),
       format('VERSION-HISTORY-FIX (2026-09-24): %s version %s -> %s. Every version above %s was raised by a write that changed nothing, so the history never recorded it; the row''s content is identical to its history at that version.',
              x.store, x.version_before, x.version_after, x.version_after)
  from _vhf_repair x;

-- THE RECEIPT, and the refusal if the numbers do not add up.
do $receipt$
declare
  v_planned integer := (select count(*) from _vhf_repair);
  v_landed  integer := 0;
  v_logged  integer;
  v_n       integer;
  s         text;
  v_line    text;
begin
  if current_setting('session_replication_role') <> 'origin' then
    raise exception 'VERSION-HISTORY-FIX: session_replication_role is still %', current_setting('session_replication_role');
  end if;
  for s in select distinct store from _vhf_repair loop
    execute format('select count(*) from _vhf_repair x join %1$s t on t.id = x.id
                     where x.store = %2$L and t.version = x.version_after', s::regclass, s)
      into v_n;
    v_landed := v_landed + v_n;
  end loop;
  select count(*) into v_logged from history.migration_log m
   where m.verb = 'version_agrees_with_history' and m.inverse ->> 'lane' = 'VERSION-HISTORY-FIX'
     and m.undone_at is null and m.applied_at = now();
  if v_landed <> v_planned or v_logged <> v_planned then
    raise exception 'VERSION-HISTORY-FIX (b): % row(s) planned, % landed, % logged — nothing is kept', v_planned, v_landed, v_logged;
  end if;
  select string_agg(format('%s ahead %s / lowered %s / real drift left %s / held by another number %s',
                           c.store, c.ahead, c.same - c.held, c.drift, c.held), '; ' order by c.store)
    into v_line from _vhf_census c;
  raise notice 'VERSION-HISTORY-FIX (b): % row(s) brought back to their history''s version, % log line(s). %', v_planned, v_logged, v_line;
end
$receipt$;
