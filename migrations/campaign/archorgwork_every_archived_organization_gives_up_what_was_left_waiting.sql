-- LANE ARCHIVED-ORG-WORK — THE AUDITED REPAIR: EVERY ORGANIZATION ARCHIVED BEFORE THE TRIGGER GIVES UP
-- WHAT WAS LEFT WAITING IN IT.
--
-- THE CENSUS (production, 2026-09-25, before this file): 131 pending approvals in 29 archived
-- organizations, 5 open assignments in 2, and 1 unanswered signature request in 1 — each still
-- listed or counted by the per-organization inbox doors (admin@admin.com: 7 in Ironclad Mobile
-- Mechanic, archived 2026-09-23). Census script: scripts/campaign-tests/archorgwork_census.sql.
--
-- WHAT IT DOES: for every archived organization, oldest archive first, exactly what the trigger now
-- does on archive — custom._organization_work_withdraw(org, the person who archived it). Every row
-- it changes is captured by history.record_capture ("archive of organization"), and each
-- organization gets ONE history.migration_log archive event listing what it took, tagged
-- inverse.repair = 'archorgwork'. REVERSIBLE two ways: restoring the organization brings its work
-- back through the trigger; the inverse file gives back everything this repair took without
-- restoring any organization.
--
-- Requires: archorgwork_an_archived_organization_takes_its_waiting_work_with_it.sql
-- INVERSE: migrations/inverse/archorgwork_every_archived_organization_gives_up_what_was_left_waiting_down.sql
-- lane: ARCHIVED-ORG-WORK

set lock_timeout = '30s';
set statement_timeout = '300s';

do $repair$
declare
  g     record;
  v     jsonb;
  v_org integer := 0;
  v_a   integer := 0;
  v_w   integer := 0;
  v_s   integer := 0;
begin
  perform set_config('app.actor_system', 'campaign-repair/archorgwork', true);
  for g in
    select o.id, o.name, o.archived_by
      from iam.organizations o
     where o.archived_at is not null
     order by o.archived_at, o.id
  loop
    v := custom._organization_work_withdraw(g.id, g.archived_by);
    continue when v is null or v ->> 'event_id' is null;
    update history.migration_log l
       set inverse = l.inverse || '{"repair":"archorgwork"}'::jsonb
     where l.organization_id = g.id and l.id = (v ->> 'event_id')::uuid;
    v_org := v_org + 1;
    v_a := v_a + (v ->> 'approvals')::integer;
    v_w := v_w + (v ->> 'assignments')::integer;
    v_s := v_s + (v ->> 'sign_requests')::integer;
    raise notice 'archorgwork repair: %', v ->> 'sentence';
  end loop;
  raise notice 'archorgwork repair: % archived organization(s) gave up % approval(s), % assignment(s), % signature request(s).',
               v_org, v_a, v_w, v_s;
end
$repair$;
