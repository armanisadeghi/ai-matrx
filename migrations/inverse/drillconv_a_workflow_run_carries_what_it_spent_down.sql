-- chair-step: the inverse of migrations/campaign/drillconv_a_workflow_run_carries_what_it_spent.sql (lane DRILL-CONVERSIONS) — puts workflow._run_facts back without its three cost columns (the previous file's body), which drops its dependency on workflow._run_cost. No row of anybody's data is touched.
-- lane: DRILL-CONVERSIONS
-- lock: platform
-- based-on: view workflow._run_facts 7a55b48dc241bf93520a2dfbf698a7391aeca91968c938afe22f1923516af976

drop view workflow._run_facts;
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
