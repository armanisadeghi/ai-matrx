-- HR domain L3 — migration 1 of 7 (register item HRB-015, lane L3 time-and-attendance, builder SQL-2).
--
-- THE REGISTRY FLOOR THIS LANE CANNOT RUN WITHOUT. Three seeds, none of which is a behaviour:
-- the earning-code registry (precondition P-7, which belongs to Core C2 and was RED), the
-- `overtime_approve` authority-action token SPEC-TIME §4.8 requires and no lane had added, and the
-- platform `hr.auto_close_rule` behaviour SPEC-TIME §4.2's ruling declares.
--
-- 🚨 P-7 IS A PRECONDITION REPAIR PERFORMED BY L3 ON ANOTHER LANE'S BEHALF, AND IT IS RECORDED
-- LOUDLY RATHER THAN QUIETLY. `hr.earning_code` held ZERO rows and `hr.work_interval.earning_code_id`
-- is NOT NULL, so no interval could ever have been written and nothing in the T&A lane could run.
-- Ownership does not change: the registry belongs to Core C2 / HRB-006, and C2 may replace this
-- seed wholesale. It exists so L3 is not blocked, and the debt is named in the lane report.
--
-- Authority: SPEC-DATA-MODEL §6.10 (the code list), SPEC-TIME §4.2 ruling / §4.8 / §5.2 / §8,
-- SPEC-ACCESS §1.3a (the action vocabulary), R-L3-READINESS P-7.
-- Applied live as `hr_l3_20_registry_preconditions`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 SPEC-DATA-MODEL §6.10 GIVES 23 CODE STRINGS AND NOT ONE ATTRIBUTE, SO THE ATTRIBUTES ARE
--    DERIVED HERE FROM SPEC-TIME §5.2's BADGE TABLE AND STATED AS A GAP RATHER THAN INVENTED
--    SILENTLY. §6.10 is a bare list ("REG, OT, DT, HOL, PTO, SICK, …") plus the three D11 tip codes
--    at `is_active=false`. It never says what `hours_category`, `multiplier`, `counts_toward_ot`,
--    `counts_toward_hours_of_service`, `counts_toward_sick_accrual` or `is_statutory_premium` each
--    code carries. Those come from SPEC-TIME §5.2 (which category each badge reads as) and from the
--    three independent inclusion rules §6.10 itself names: ACA hours of service counts paid leave,
--    FLSA OT does not, statutory sick accrual counts hours *worked*. Every value below is therefore
--    traceable, but SPEC-DATA-MODEL §6.10 owes a per-code attribute table.
--    OWED: SPEC-DATA-MODEL §6.10 gains the attribute columns for its 23 codes.
--
-- 2. THE SEED IS A SYSTEM-ORG TEMPLATE PLUS AN ACTIVATION FUNCTION, BECAUSE §6.10 SAYS "SEEDED PER
--    ORG AT HR ACTIVATION" AND `unique (organization_id, code)` MAKES THAT LITERAL. A single
--    system-org row set would be unreachable from an org's own picker (`hr.earning_code` is DIR, not
--    SYS — its RLS parent is the org). So the platform template lives in the Matrx System org with
--    `is_seeded = true`, and `hr.earning_code_seed_org(p_organization_id)` copies it into an org,
--    idempotently, on activation. Today it seeds nothing but the template because ZERO orgs have HR
--    activated (verified live: `hr.employer_profile`, `hr.pay_group`, `hr.location`, `hr.employment`
--    are all empty — precondition P-8, lane L1).
--
-- 3. TWO CODES CARRY NO `jurisdiction_rule_class` BECAUSE THE CLASS DOES NOT EXIST YET, AND A
--    FABRICATED SLUG WOULD BE WORSE THAN A NULL. `hr.jurisdiction_rule_class` holds 16 slugs live;
--    `meal-break`, `rest-break`, `overtime` and `double-time` are among them. `REPORT_TIME` and
--    `SPLIT_SHIFT` have no class (`reporting-time-pay` / `split-shift-premium` do not exist), so
--    they are seeded with a NULL class and named as a debt against Core C5. They are still
--    `is_statutory_premium = true`, which is what the premium lane actually reads.
--
-- 4. 🚨 THE `hr_approval_action` VOCABULARY GOES FROM 26 TO 27, AND `hr_c3_01_role_model.sql`'s
--    HARD-CODED `<> 26` ASSERTION IS A LANDMINE THIS MIGRATION DEFUSES BY NAMING IT. SPEC-TIME §4.8
--    requires `overtime_approve`; the live vocabulary (read today: 26 tokens, not the 24 the lane
--    brief carried) does not have it, and `hr.can_approve` RAISES on an unregistered action, so the
--    §4.4 flow could not route without it. Core C3's migration asserts the count is exactly 26 and
--    will now raise on re-apply. That is a FAIL-LOUD, not a corruption, and it is recorded as a debt
--    against core-c3 / HRB-007 rather than silently edited from another lane's file.
--    OWED: `hr_c3_01_role_model.sql`'s count assertion becomes 27; SPEC-ACCESS §1.3a's list gains
--    `overtime_approve`.
--
-- 5. THE PLATFORM AUTO-CLOSE BEHAVIOUR IS TWO ORDERED ROWS, NOT ONE, BECAUSE THE LIVE COLUMN SET
--    HOLDS ONE `close_at_strategy` PER RULE. SPEC-TIME §4.2 states the platform rule as "trigger at
--    16 hours, close at `scheduled_shift_end` where a shift exists, otherwise `clock_in_plus_hours`
--    = 16" — one sentence with a fallback. `hr.auto_close_rule.close_at_strategy` is single-valued
--    (`scheduled_end | max_hours_reached | last_activity | shift_end_minus_break | zero_hours`), so
--    the fallback is expressed the way the table expresses everything else: priority order. Rule 10
--    closes at the scheduled end and yields when no shift exists; rule 20 closes at clock-in + 16.
--    The spec's `scheduled_shift_end` / `clock_in_plus_hours` names map to `scheduled_end` /
--    `max_hours_reached`; the live names win (SPEC-DATA-MODEL is the register).
--
-- 6. `blocks_period_lock = true` ON BOTH ROWS, AND IT IS NOT WHAT ENFORCES THE INVARIANT. SPEC-TIME
--    §4.2's second non-configurable invariant — no estimate reaches an export without a human
--    resolving or explicitly waiving it — is enforced by the export preconditions, not by this
--    column. A rule setting `blocks_period_lock = false` still cannot bypass it. The column is
--    recorded here at its safe value so the default posture and the law agree.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ 1. `overtime_approve` (RD 4, §4.8)
insert into platform.categories (organization_id, dimension, name, slug, is_system, position,
                                 metadata, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'hr_approval_action',
       'Approve overtime', 'overtime_approve', true, 45,
       '{"sole_authority_mode":"auto_record","allows_self":false}'::jsonb,
       'internal'::platform.visibility
where not exists (select 1 from platform.categories c
                   where c.dimension = 'hr_approval_action' and c.slug = 'overtime_approve'
                     and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid);

-- ============================================================ 2. the earning-code template (RD 1-3)
select set_config('hr.privileged_write', 'on', false);

insert into hr.earning_code
  (organization_id, code, name, hours_category, is_overtime, multiplier, flat_amount,
   counts_toward_ot, counts_toward_hours_of_service, counts_toward_sick_accrual,
   is_statutory_premium, jurisdiction_rule_class, external_code_map, is_seeded, is_active,
   visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
       v.code, v.name, v.cat, v.is_ot, v.mult, null::numeric,
       v.c_ot, v.c_hos, v.c_sick, v.stat, v.rule_class, v.ext, true, v.active,
       'internal'::platform.visibility
from (values
 -- code, name, hours_category, is_overtime, multiplier, counts_ot, counts_hos, counts_sick, statutory, rule_class, external_code_map, is_active
 ('REG','Regular','worked',false,1.0,true,true,true,false,null,'{"quickbooks":"Regular Pay"}'::jsonb,true),
 ('OT','Overtime','worked',true,1.5,true,true,true,false,'overtime','{"quickbooks":"Overtime Pay"}'::jsonb,true),
 ('DT','Double time','worked',true,2.0,true,true,true,false,'double-time','{"quickbooks":"Double-time Pay"}'::jsonb,true),
 ('HOL','Holiday','holiday',false,1.0,false,true,false,false,null,'{"quickbooks":"Holiday Pay"}'::jsonb,true),
 ('PTO','PTO','paid_leave',false,1.0,false,true,false,false,null,'{"quickbooks":"Vacation Pay"}'::jsonb,true),
 ('SICK','Sick','paid_leave',false,1.0,false,true,false,false,null,'{"quickbooks":"Sick Pay"}'::jsonb,true),
 ('BEREAVE','Bereavement','paid_leave',false,1.0,false,true,false,false,null,'{}'::jsonb,true),
 ('JURY','Jury duty','paid_leave',false,1.0,false,true,false,false,null,'{}'::jsonb,true),
 ('SHIFT_DIFF','Shift differential','worked',false,null,true,true,true,false,null,'{}'::jsonb,true),
 ('NIGHT_DIFF','Night differential','worked',false,null,true,true,true,false,null,'{}'::jsonb,true),
 ('WEEKEND_DIFF','Weekend differential','worked',false,null,true,true,true,false,null,'{}'::jsonb,true),
 ('ONCALL','On call','on_call',false,null,false,true,false,false,null,'{}'::jsonb,true),
 ('CALLBACK','Callback','worked',false,null,true,true,true,false,null,'{}'::jsonb,true),
 ('REPORT_TIME','Reporting time','premium',false,null,false,false,false,true,null,'{}'::jsonb,true),
 ('SPLIT_SHIFT','Split shift','premium',false,null,false,false,false,true,null,'{}'::jsonb,true),
 ('MEAL_PREMIUM','Meal premium','premium',false,null,false,false,false,true,'meal-break','{}'::jsonb,true),
 ('REST_PREMIUM','Rest premium','premium',false,null,false,false,false,true,'rest-break','{}'::jsonb,true),
 ('TRAVEL','Travel time','worked',false,null,true,true,true,false,null,'{}'::jsonb,true),
 ('TRAINING','Training time','worked',false,null,true,true,true,false,null,'{}'::jsonb,true),
 ('BONUS','Bonus','bonus',false,null,false,false,false,false,null,'{}'::jsonb,true),
 -- D11 tip codes: seeded, NEVER active. They exist so a future vertical is a config change, not a
 -- migration, and SPEC-TIME §5.2 forbids them from appearing in any picker or badge legend.
 ('TIPS_DECLARED','Declared tips','bonus',false,null,false,false,false,false,null,'{}'::jsonb,false),
 ('TIP_CREDIT','Tip credit','bonus',false,null,false,false,false,false,null,'{}'::jsonb,false),
 ('TIP_POOL','Tip pool','bonus',false,null,false,false,false,false,null,'{}'::jsonb,false)
) as v(code,name,cat,is_ot,mult,c_ot,c_hos,c_sick,stat,rule_class,ext,active)
on conflict (organization_id, code) do nothing;

-- ============================================================ 3. the activation seeder (RD 2)
create or replace function hr.earning_code_seed_org(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare v_n integer;
begin
  if p_organization_id is null then
    return jsonb_build_object('granted', false, 'reason', 'organization_id_required',
      'detail', 'NO NULL ORG: an earning-code seed carries an explicit organization_id');
  end if;
  if p_organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid then
    return jsonb_build_object('granted', false, 'reason', 'system_org_is_the_template',
      'detail', 'the Matrx System org holds the template this function copies; it is not a seed target');
  end if;

  perform hr.arm_write();
  insert into hr.earning_code
    (organization_id, code, name, hours_category, is_overtime, multiplier, flat_amount,
     counts_toward_ot, counts_toward_hours_of_service, counts_toward_sick_accrual,
     is_statutory_premium, jurisdiction_rule_class, external_code_map, is_seeded, is_active,
     visibility)
  select p_organization_id, t.code, t.name, t.hours_category, t.is_overtime, t.multiplier,
         t.flat_amount, t.counts_toward_ot, t.counts_toward_hours_of_service,
         t.counts_toward_sick_accrual, t.is_statutory_premium, t.jurisdiction_rule_class,
         t.external_code_map, true, t.is_active, t.visibility
    from hr.earning_code t
   where t.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and t.is_seeded and t.deleted_at is null
  on conflict (organization_id, code) do nothing;
  get diagnostics v_n = row_count;

  return jsonb_build_object('granted', true, 'organization_id', p_organization_id,
    'seeded', v_n,
    'total', (select count(*) from hr.earning_code
               where organization_id = p_organization_id and deleted_at is null));
end $fn$;

comment on function hr.earning_code_seed_org is
  'SPEC-DATA-MODEL §6.10 "seeded per org at HR activation". Copies the Matrx System org earning-code template into one organization, idempotently. Precondition P-7 belongs to Core C2 / HRB-006; L3 built this because the T&A lane cannot write a work_interval without it.';

revoke all on function hr.earning_code_seed_org(uuid) from public;
grant execute on function hr.earning_code_seed_org(uuid) to service_role;

-- ============================================================ 4. platform auto-close rules (RD 5,6)
select set_config('hr.privileged_write', 'on', false);

insert into hr.auto_close_rule
  (organization_id, name, scope_kind, scope_id, trigger_kind, max_shift_hours, grace_minutes,
   close_at_strategy, apply_break_deduction, break_deduction_minutes, raises_exception_kind,
   exception_severity, notify_manager, notify_employee, blocks_period_lock, is_active, priority,
   visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.name, 'organization', null,
       'max_shift_hours', 16, 0, v.strategy, false, null, 'orphan_punch', 'warn',
       true, true, true, true, v.priority, 'internal'::platform.visibility
from (values
 ('Platform default — close at the scheduled shift end', 'scheduled_end', 10),
 ('Platform default — close at clock-in plus 16 hours',  'max_hours_reached', 20)
) as v(name, strategy, priority)
on conflict (organization_id, name) do nothing;

-- ============================================================ assertions
do $$
declare v_n integer; v_bad text;
begin
  -- RD 4: the vocabulary is 27 and `overtime_approve` is in it
  select count(*) into v_n from platform.categories
   where dimension = 'hr_approval_action' and deleted_at is null
     and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;
  if v_n <> 27 then
    raise exception 'hr_l3_20: hr_approval_action holds % tokens, expected 27 (26 from C3 + overtime_approve)', v_n;
  end if;
  if not exists (select 1 from platform.categories
                  where dimension = 'hr_approval_action' and slug = 'overtime_approve'
                    and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid) then
    raise exception 'hr_l3_20: overtime_approve was not registered';
  end if;

  -- the template is complete and the tip codes are inactive
  select count(*) into v_n from hr.earning_code
   where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and is_seeded and deleted_at is null;
  if v_n <> 23 then
    raise exception 'hr_l3_20: the earning-code template holds % rows, expected 23 (SPEC-DATA-MODEL §6.10)', v_n;
  end if;
  select string_agg(code, ', ') into v_bad from hr.earning_code
   where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and code in ('TIPS_DECLARED','TIP_CREDIT','TIP_POOL') and is_active;
  if v_bad is not null then
    raise exception 'hr_l3_20: D11 tip codes must be seeded INACTIVE; active: %', v_bad;
  end if;
  if not exists (select 1 from hr.earning_code
                  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and code = 'MEAL_PREMIUM' and is_statutory_premium and is_active)
     or not exists (select 1 from hr.earning_code
                  where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and code = 'REST_PREMIUM' and is_statutory_premium and is_active) then
    raise exception 'hr_l3_20: MEAL_PREMIUM / REST_PREMIUM must be present, active and statutory';
  end if;
  -- a statutory premium never counts toward OT: it is not hours worked
  select string_agg(code, ', ') into v_bad from hr.earning_code
   where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and is_statutory_premium and counts_toward_ot;
  if v_bad is not null then
    raise exception 'hr_l3_20: statutory premiums must not count toward OT: %', v_bad;
  end if;

  -- the platform auto-close behaviour exists and blocks the lock
  select count(*) into v_n from hr.auto_close_rule
   where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and is_active and deleted_at is null;
  if v_n <> 2 then
    raise exception 'hr_l3_20: expected 2 platform auto_close_rule rows, found %', v_n;
  end if;
  if exists (select 1 from hr.auto_close_rule
              where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                and not blocks_period_lock) then
    raise exception 'hr_l3_20: a platform auto-close rule must not ship with blocks_period_lock=false';
  end if;
end $$;
