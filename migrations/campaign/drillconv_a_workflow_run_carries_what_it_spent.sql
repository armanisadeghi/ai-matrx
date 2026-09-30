-- chair-step: lane DRILL-CONVERSIONS (program DRILL-FINISH, decisions 21 and 27) — A WORKFLOW RUN CARRIES WHAT IT SPENT. It REPLACES the server-only view workflow._run_facts (lane DRILL-CONVERSIONS, previous file) with the same columns plus three at the end — cost (dollars), requests, has_request — joined 1:1 on the run id from workflow._run_cost (lane DRILL-LEDGER-RECORDS: what each run's requests spent in the AI usage ledger). No client grant; no table, policy or row of anybody's data is touched.
-- lane: DRILL-CONVERSIONS
-- lock: platform
--
-- APPLY ORDER: after drillledger_a_workflow_run_costs_what_its_requests_spent.sql (workflow._run_cost)
-- and drillconv_a_workflow_run_is_counted_from_one_view.sql. While this file is applied,
-- workflow._run_cost cannot be dropped without dropping this file first (its inverse is the way back).
--
-- A run with no request has no row in workflow._run_cost: it reads cost 0, requests 0,
-- has_request 0 — and the definition's Measure "Runs that made a request" (sum of has_request) says
-- how many runs carry any, so a run that spent nothing is never passed off as a run that was free.
-- INVERSE: migrations/inverse/drillconv_a_workflow_run_carries_what_it_spent_down.sql

create or replace view workflow._run_facts with (security_invoker = true) as
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
       r.steps_executed,
       coalesce(c.cost, 0)                    as cost,
       coalesce(c.requests, 0)                as requests,
       (c.run_id is not null)::int            as has_request
  from workflow.run r
  left join workflow._run_cost c on c.run_id = r.id
 where r.deleted_at is null;

revoke all on workflow._run_facts from public, anon, authenticated;
comment on column workflow._run_facts.cost is 'Dollars the run''s requests spent in the AI usage ledger (workflow._run_cost); 0 when the run made no request.';
comment on column workflow._run_facts.requests is 'The run''s requests (chat.user_request.workflow_run_id); 0 when it made none.';
comment on column workflow._run_facts.has_request is '1 when the run made at least one request (it has a row in workflow._run_cost), else 0.';
