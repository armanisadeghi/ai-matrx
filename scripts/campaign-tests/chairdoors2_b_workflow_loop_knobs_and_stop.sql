-- LANE CHAIR-DOORS-2 — THE WORKFLOW LOOP GUARD'S TWO KNOBS AND ITS OWN STOP.
-- Guard for migrations/campaign/chairdoors2_b_a_workflow_loop_has_two_knobs_and_its_own_stop.sql.
--
--   K. platform.knob_resolve answers workflows/loop_depth_max = 3 and
--      workflows/loop_runs_per_record_per_minute = 5 for Cedar Ridge Physical Therapy (no override),
--      both registered as organization-overridable integers — the shape scoped_knob_int reads.
--   S. a trigger fire can be filed as `stopped_loop_cap`; a made-up status is still refused 23514;
--      the CHECK is validated.
-- Runs as the owner (the ledger is server-written; the knob read is the server's own read).
-- One transaction, rolled back; nothing is left behind.
-- THE VERDICT IS THE EXIT CODE: RED raises (psql exits 3 under ON_ERROR_STOP), GREEN exits 0.
--
-- RUN IT (dev clone only; rolled back), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/chairdoors2_b_workflow_loop_knobs_and_stop.sql
\set ON_ERROR_STOP on
\set suite 'chairdoors2_b_workflow_loop_knobs_and_stop.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\set QUIET on
begin;
set local statement_timeout = '120s';
set local lock_timeout = '10s';

create temp table res (check_name text, ok boolean, detail text) on commit drop;

do $$
declare v jsonb; k record; m text; fire uuid;
begin
  for k in select * from (values ('loop_depth_max', 3), ('loop_runs_per_record_per_minute', 5)) x(key, want) loop
    begin
      v := platform.knob_resolve('workflows', k.key, '0a54df90-eab8-4d07-ab29-81a45fb41e04'::uuid);
      insert into res values ('K ' || k.key || ' resolves to its default', (v #>> '{}')::int = k.want, coalesce(v::text, '(null)'));
    exception when others then
      insert into res values ('K ' || k.key || ' resolves to its default', false, sqlerrm);
    end;
    insert into res values ('K ' || k.key || ' is an org-overridable integer',
      exists (select 1 from platform.feature_knob f where f.feature = 'workflows' and f.key = k.key and f.archived_at is null
                 and f.value_type = 'integer' and 'organization' = any (f.overridable_by) and f.default_value = to_jsonb(k.want)),
      (select coalesce(string_agg(f.value_type || ' ' || f.overridable_by::text, ';'), '(no row)') from platform.feature_knob f
        where f.feature = 'workflows' and f.key = k.key));
  end loop;

  select id into fire from workflow.trigger_fire order by created_at desc limit 1;
  insert into res values ('S fixture: a fire exists', fire is not null, coalesce(fire::text, '(none)'));
  begin
    update workflow.trigger_fire set status = 'stopped_loop_cap' where id = fire;
    insert into res values ('S a fire can be filed stopped_loop_cap', found, 'filed');
  exception when check_violation then
    get stacked diagnostics m = message_text;
    insert into res values ('S a fire can be filed stopped_loop_cap', false, m);
  end;
  begin
    update workflow.trigger_fire set status = 'paused_for_lunch' where id = fire;
    insert into res values ('S a made-up status is refused', false, 'accepted');
  exception when check_violation then
    insert into res values ('S a made-up status is refused', true, sqlerrm);
  end;
  insert into res values ('S the check is validated',
    exists (select 1 from pg_constraint where conrelid = 'workflow.trigger_fire'::regclass
               and conname = 'wf_trigger_fire_status_check' and convalidated),
    (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'workflow.trigger_fire'::regclass
       and conname = 'wf_trigger_fire_status_check'));
end $$;

select check_name, coalesce(ok, false) as ok, left(detail, 160) as detail from res order by check_name;
select coalesce(bool_or(not coalesce(ok, false)), true) as red, count(*) filter (where not coalesce(ok, false)) as nred, count(*) as n from res \gset
\if :red
\echo 'RED —' :nred 'of' :n 'checks failed'
do $$ begin raise exception 'chairdoors2_b_workflow_loop_knobs_and_stop.sql is RED'; end $$;
\else
\echo 'GREEN —' :n 'checks'
\endif
rollback;
