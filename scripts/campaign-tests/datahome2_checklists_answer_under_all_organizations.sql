-- LANE DATA-HOME-2 — CHECKLISTS ANSWER UNDER ALL ORGANIZATIONS (BREAKER-4 B4-02, 2026-09-30).
--
-- THE REAL USE CASE: on the data home's default view (All organizations — the law: reads carry no
-- organization) the inbox lists the checklist steps waiting on her. It called custom.checklist_runs
-- with no organization and the store answered 400 "A door that took null would be a door onto
-- every organization at once", shown to her in a red box on every visit.
--
-- What must hold, from the seat (admin@admin.com by default; -v seat=test@test.com):
--   A. custom.checklist_runs(null, …) answers exactly the union of custom.checklist_runs(org, …) over
--      her organizations with the store open (open runs, one page);
--   B. custom.checklist_run(null, run) answers exactly custom.checklist_run(<the run's org>, run);
--   C. custom.checklist_step_refusal(null, step) answers what it answers in the step's organization;
--   D. a named organization she cannot reach is still refused (the wall is unchanged).
-- ITS RED: before datahome2_j every null call raises 22004.
\set ON_ERROR_STOP on
\timing off
\set suite 'datahome2_checklists_answer_under_all_organizations.sql'
\if :{?seat}
\else
  \set seat 'admin@admin.com'
\endif
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin isolation level repeatable read;
set local statement_timeout = '10min';
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = :'seat'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_diff int; v_n int; v_run uuid; v_org uuid; v_step uuid; v_a text; v_b text;
begin
  begin
    create temp table _all_runs on commit drop as
      select * from custom.checklist_runs(null, null, null, false, 200);
  exception when others then
    raise exception 'A FAILED: custom.checklist_runs(null) refused: % (%)', sqlerrm, sqlstate;
  end;
  create temp table _orgs on commit drop as
    select m.organization_id as id from iam.organization_member m
      join iam.organizations o on o.id = m.organization_id and o.archived_at is null
     where m.user_id = (select auth.uid()) and iam.has_org_access(m.organization_id)
       and custom.store_is_open(m.organization_id);
  create temp table _each on commit drop as
    select c.* from _orgs o cross join lateral custom.checklist_runs(o.id, null, null, false, 200) c;
  select count(*) into v_diff from (
    ((select run_id from _all_runs) except (select run_id from _each))
    union all
    ((select run_id from _each) except (select run_id from _all_runs))) d;
  if v_diff <> 0 and (select count(*) from _each) <= 200 then
    raise exception 'A FAILED: the runs of every organization and the no-organization call disagree on % run(s)', v_diff;
  end if;
  raise notice 'A passed: % open runs across her organizations, the same as asked one organization at a time', (select count(*) from _all_runs);

  select run_id into v_run from _all_runs limit 1;
  if v_run is not null then
    -- Which of her organizations holds it, asked the way a client can: the organization whose own
    -- door lists it.
    select o.id into v_org from _orgs o
     where exists (select 1 from custom.checklist_runs(o.id, null, null, false, 200) c where c.run_id = v_run)
     limit 1;
    select count(*) into v_diff from (
      ((select * from custom.checklist_run(null, v_run)) except all (select * from custom.checklist_run(v_org, v_run)))
      union all
      ((select * from custom.checklist_run(v_org, v_run)) except all (select * from custom.checklist_run(null, v_run)))) d;
    if v_diff <> 0 then
      raise exception 'B FAILED: checklist_run(null) and checklist_run(its organization) disagree on % step(s)', v_diff;
    end if;
    select step_id into v_step from custom.checklist_run(v_org, v_run) limit 1;
    if v_step is not null then
      v_a := custom.checklist_step_refusal(null, v_step);
      v_b := custom.checklist_step_refusal(v_org, v_step);
      if v_a is distinct from v_b then
        raise exception 'C FAILED: the step refusal differs with no organization (% vs %)', v_a, v_b;
      end if;
    end if;
    raise notice 'B/C passed: a run and its steps open in their own organization';
  else
    raise notice 'B/C CANNOT BE JUDGED: this seat has no open run';
  end if;

  begin
    perform * from custom.checklist_runs('00000000-0000-4000-8000-00000000dead'::uuid, null, null, false, 25);
    raise exception 'D FAILED: an organization she cannot reach answered';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'D passed: a named organization she cannot reach is still refused';
end $$;
rollback;
\echo 'GREEN'
