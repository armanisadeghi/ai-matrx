-- chair-step: lane DRILL-CONVERSIONS (program DRILL-FINISH, decision 21) — A WORKFLOW RUN IS COUNTED FROM ONE VIEW. It CREATES one server-only view workflow._run_facts (one row per workflow run that is not archived: its workflow, organization, person, status, how it started, when, how long it took, whether it failed) and registers it as System machinery (token workflow_run_facts, a projection of workflow_run) so the declared drill definition workflow_runs can count it definer, with each lane's rule compiled in. No client grant; no table, policy or row of anybody's data is touched.
-- lane: DRILL-CONVERSIONS
-- lock: platform
--
-- WHY A VIEW. workflow.run keeps no duration column and no "how it started" column, and a run's
-- cost lives in the AI usage ledger (workflow._run_cost, lane DRILL-LEDGER-RECORDS), which no client
-- may read. The drill door groups and measures COLUMNS, and a definer definition may join only
-- Reference tables along a foreign key, so the derived columns live here, once, and the
-- definition's fact is this view (as ai_usage's fact is a server-only rollup). The cost columns are
-- added by the NEXT file (drillconv_a_workflow_run_carries_what_it_spent.sql), after
-- workflow._run_cost is on the database.
--
-- THE RULES, each the runs list's own (features/workflow-runtime/discovery/runs.ts):
--   * when      = created_at (the list sorts and windows by it)
--   * duration  = completed_at − (started_at, else created_at), in ms; null while the run is in
--                 flight or when the end is before the start (runDurationMs says null, never a guess)
--   * failed    = status errored or failed (1/0, so it sums); finished = completed_at is set
--   * archived runs (deleted_at set) are not counted — the list does not show them
--   * how it started: a child of another run (parent_run_id); fired by a trigger (workflow.trigger_fire
--     names the run, or metadata.trigger_id); a mandate (metadata._mandate); otherwise directly
--     (a person or a program called it).
-- INVERSE: migrations/inverse/drillconv_a_workflow_run_is_counted_from_one_view_down.sql

create view workflow._run_facts with (security_invoker = true) as
select r.id                                   as run_id,
       r.definition_id                        as workflow_id,
       r.organization_id,
       r.created_by                           as person_id,
       r.status,
       case
         when r.parent_run_id is not null then 'child'
         when r.metadata ? 'trigger_id'
           or exists (select 1 from workflow.trigger_fire f where f.run_id = r.id) then 'trigger'
         when r.metadata ? '_mandate' then 'mandate'
         else 'direct'
       end                                    as how_started,
       r.created_at,
       r.started_at,
       r.completed_at,
       case when r.completed_at is not null
                 and r.completed_at >= coalesce(r.started_at, r.created_at)
            then (extract(epoch from r.completed_at - coalesce(r.started_at, r.created_at)) * 1000)::bigint
       end                                    as duration_ms,
       (r.status in ('errored', 'failed'))::int as failed,
       (r.completed_at is not null)::int      as finished,
       r.steps_executed
  from workflow.run r
 where r.deleted_at is null;

revoke all on workflow._run_facts from public, anon, authenticated;
comment on view workflow._run_facts is
  'DRILL-CONVERSIONS: one row per workflow run that is not archived, with the columns the drill definition workflow_runs counts (duration, failed, how it started). Server-only (System machinery, token workflow_run_facts); read only by the drill door''s definer step with each lane''s rule compiled in.';
comment on column workflow._run_facts.duration_ms is 'completed_at minus (started_at, else created_at), in milliseconds; null while the run is in flight (the runs list''s own rule).';
comment on column workflow._run_facts.how_started is 'child (a run started it), trigger (a trigger fired it), mandate (a mandate ran it) or direct (a person or a program called it).';

insert into platform.entity_types (
  token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
  notes, is_listed, is_component, is_module, rls_variant, reference_pickable, audit_class,
  audit_class_reason, relation_kind, projects_token, data_class, data_class_reason, default_list_scope,
  origin, type, type_reason, agent_writable, allow_preview, table_ref
)
values (
  'workflow_run_facts', 'workflow', '_run_facts', 'Workflow run facts', 1, false, false, true,
  'One row per workflow run that is not archived, with its duration, failure and how it started — what the workflow_runs drill definition counts.',
  false, false, false, 'system', false, 'machinery',
  'Projection: a server-only view over workflow.run (+ workflow.trigger_fire), one row per run. It owns no rows.',
  'projection', 'workflow_run', 'organization',
  'System machinery with no client lane; read only by the drill door''s definer step.',
  'organization', 'standard', 'system',
  'Lane DRILL-CONVERSIONS: the workflow_runs drill definition''s fact (PROGRESS-DRILL-FINISH decision 21).',
  false, false, 'workflow._run_facts'::regclass
)
on conflict (token) do nothing;
