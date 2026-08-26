-- HR domain, C5 / register item HRB-009, file 07 -- THE JUR-SEED PROGRAM, TRACKED IN DATA.
--
-- Authority: /projects/hr-domain/specs/SPEC-JURISDICTION.md section 5.9 (the eight build-time
-- verification tasks and their per-task shipping gates) and R-CORE-READINESS a.8 item 9, which
-- insists these are "named build tasks, not background hope".
--
-- WHY THIS IS A TAG AND NOT A TABLE. The eight tasks are tracked as items on the HR Domain item
-- register, because the register is the single tracking home for this build and a parallel status
-- table would be exactly the duplicate the register's own rules forbid. What belongs in the
-- DATABASE is the JOIN: which seeded rows each task has to clear. Stamping the task id onto the
-- row makes "what is JUR-SEED-3 still holding up" answerable from the rules themselves, keeps the
-- admin surface's grouping honest when a row is verified and promoted, and adds no table.
--
-- 🚨 TWO GAPS IN SECTION 5.9 THAT THIS TAGGING EXPOSED -- ROUTED, NOT PAPERED OVER. Section 5.9
-- names eight tasks, and two of section 5's own unverified values fall outside all eight. Both
-- are tagged `UNASSIGNED` rather than quietly filed under a task that does not own them, so they
-- show up with no owner -- which is the truth. The assertion at the foot of this file is what
-- found them: it refuses to commit if a single unverified row belongs to no bucket at all.
--
--   (a) The two `new-hire-report-deadline` rows (US and US-CA) ship advisory with a
--       verification_due. JUR-SEED-1 is FINAL-PAY deadlines; new-hire reporting is a different
--       obligation with a different filing and a different penalty, so JUR-SEED-1 does not
--       stretch to cover it.
--
--   (b) 🚨 THE MORE SERIOUS ONE: `pto-payout-at-termination` at US-CA is ACTIVE and carries
--       `_unverified: ["excludes"]` -- whether statutory sick leave sits outside the payout
--       obligation. That key CHANGES A DOLLAR FIGURE on a produces_money class, it is live and
--       active today, and no JUR-SEED task owns it. Section 1.4 keeps it safe (a consumer reading
--       an `_unverified` key flags rather than computes from it), but "safe" is not "owned", and
--       an unowned money question does not get verified by itself.
--
-- SPEC-JURISDICTION 5.9 owes a ninth task, or explicit extensions of JUR-SEED-1 and JUR-SEED-2.
--
-- Idempotent. Applied live as migration `hr_c5_07_jur_seed_task_tags`.

set local lock_timeout = '20s';

select set_config('hr.privileged_write', 'on', false);

update hr.jurisdiction_rule r
   set metadata = r.metadata || jsonb_build_object('jur_seed_task', t.task)
  from (
    select rc.slug, jr.jurisdiction_key, jr.id,
           case
             -- 5.9: final-pay deadlines, 50 states + DC
             when rc.slug = 'final-pay-deadline'          then 'JUR-SEED-1'
             when rc.slug = 'pto-payout-at-termination'
                  and jr.status = 'advisory'              then 'JUR-SEED-1'
             -- 5.9: statutory sick leave, every mandating state and city
             when rc.slug = 'sick-leave-floor'
                  and jr.parameters ? '_unverified'       then 'JUR-SEED-2'
             -- 5.9: Fair Workweek, per-locality windows / coverage / premium schedules
             when rc.slug = 'fair-workweek'
                  and jr.status = 'advisory'              then 'JUR-SEED-3'
             -- 5.9: rounding bounds, the anti-pyramiding citation, the CA workday-start construction
             when rc.slug = 'rounding-bounds'             then 'JUR-SEED-4'
             when rc.slug = 'overtime'
                  and jr.parameters ? '_unverified'       then 'JUR-SEED-4'
             -- 5.9: training mandates, hours and triggers
             when rc.slug = 'training-mandate'            then 'JUR-SEED-5'
             -- 5.9: CA meal/rest detail
             when rc.slug in ('meal-break','rest-break')
                  and jr.parameters ? '_unverified'       then 'JUR-SEED-6'
             -- 5.9: minors (D11 revisit trigger)
             when rc.slug = 'minors-hours'                then 'JUR-SEED-7'
             -- 5.9: the I-9 conventions and windows
             when rc.slug = 'i9-section2-deadline'
                  and jr.parameters ? '_unverified'       then 'JUR-SEED-8'
             -- covered by no task in 5.9; see the header for both cases
             when rc.slug = 'new-hire-report-deadline'    then 'UNASSIGNED'
             when rc.slug = 'pto-payout-at-termination'
                  and jr.parameters ? '_unverified'       then 'UNASSIGNED'
           end as task
      from hr.jurisdiction_rule jr
      join hr.jurisdiction_rule_class rc on rc.id = jr.rule_class_id
     where jr.deleted_at is null
       and jr.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
       and (jr.status in ('advisory','draft') or jr.parameters ? '_unverified')
  ) t
 where r.id = t.id and t.task is not null
   and coalesce(r.metadata->>'jur_seed_task','') is distinct from t.task;

-- the overdue view carries the task, so "who owns this overdue row" is answerable.
-- DROP first, not CREATE OR REPLACE: the new column lands mid-list and `create or replace view`
-- can only append. Nothing reads this view yet (it was created by hr_c5_00 in this same lane and
-- has no dependents), so dropping it is free -- and doing it here rather than reordering the
-- columns keeps the view's shape readable instead of shaped by a migration constraint.
drop view if exists platform.v_hr_jurisdiction_rule_overdue;
create view platform.v_hr_jurisdiction_rule_overdue
with (security_invoker = true) as
select r.id            as rule_id,
       r.version       as rule_version,
       rc.slug         as rule_class,
       rc.label        as rule_class_label,
       r.jurisdiction_key,
       j.name          as jurisdiction_name,
       r.status,
       r.metadata->>'jur_seed_task' as jur_seed_task,
       r.verification_due,
       (current_date - r.verification_due) as days_overdue,
       r.basis,
       r.citation,
       r.organization_id
from hr.jurisdiction_rule r
join hr.jurisdiction_rule_class rc on rc.id = r.rule_class_id
join hr.jurisdiction j on j.key = r.jurisdiction_key
where r.deleted_at is null
  and r.status in ('advisory','draft')
  and r.verification_due is not null
  and r.verification_due < current_date;

-- the program board: one row per task, with what it is still holding up
create or replace view platform.v_hr_jur_seed_progress
with (security_invoker = true) as
select coalesce(r.metadata->>'jur_seed_task','UNTAGGED') as jur_seed_task,
       count(*)                                          as rows_total,
       count(*) filter (where r.status = 'active')       as rows_active,
       count(*) filter (where r.status = 'advisory')     as rows_advisory,
       count(*) filter (where r.status = 'draft')        as rows_draft,
       count(*) filter (where r.parameters ? '_unverified') as rows_with_unverified_keys,
       count(*) filter (where r.verification_due < current_date
                          and r.status in ('advisory','draft'))  as rows_overdue,
       min(r.verification_due)                           as next_verification_due,
       (count(*) filter (where r.status in ('advisory','draft')
                            or r.parameters ? '_unverified') = 0) as task_complete,
       array_agg(distinct rc.slug order by rc.slug)      as classes,
       array_agg(distinct r.jurisdiction_key order by r.jurisdiction_key) as jurisdictions
from hr.jurisdiction_rule r
join hr.jurisdiction_rule_class rc on rc.id = r.rule_class_id
where r.deleted_at is null
  and r.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  and r.metadata ? 'jur_seed_task'
group by 1;

comment on view platform.v_hr_jur_seed_progress is
  'SPEC-JURISDICTION 5.9: the eight build-time verification tasks, measured against the rule rows '
  'each one has to clear. A task is complete when no row it owns is still advisory, draft, or '
  'carrying an _unverified key. The tasks themselves are tracked as items on the HR Domain item '
  'register; this view is the join, not a second tracker.';

do $$
declare v_untagged integer; v_tasks integer;
begin
  -- every unverified seeded row is owned by a task, or is visibly UNASSIGNED. None is silent.
  select count(*) into v_untagged
    from hr.jurisdiction_rule r
   where r.deleted_at is null
     and r.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and (r.status in ('advisory','draft') or r.parameters ? '_unverified')
     and not (r.metadata ? 'jur_seed_task');
  if v_untagged > 0 then
    raise exception 'hr_c5_07: % unverified seed row(s) belong to no JUR-SEED task and no UNASSIGNED bucket', v_untagged;
  end if;

  select count(*) into v_tasks from platform.v_hr_jur_seed_progress
   where jur_seed_task like 'JUR-SEED-%';
  if v_tasks <> 8 then
    raise exception 'hr_c5_07: section 5.9 names eight tasks; % have seeded rows', v_tasks;
  end if;
end $$;

select set_config('hr.privileged_write', 'off', false);
