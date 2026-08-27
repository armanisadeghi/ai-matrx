-- HR domain L1 — migration 13 (register item HRB-013, lane l1-employees).
--
-- `public.hr_employment_set_pay_group` — the writer that lets a person actually be paid.
--
-- Authority: SPEC-EMPLOYEES §2.3.3 (Job tab), §2.4 route 70; G2-VERIFICATION-2026-08-26 F3's
-- consequence. Applied live as `hr_l1_13_employment_pay_group`. Idempotent.
--
-- ===================================================================================
-- 🚨 FOUND WHILE PROVING F3, AND IT IS THE OTHER HALF OF THE SAME WALL.
--
-- The verifier's F3 is that pay groups had no create control, and its recorded consequence is the
-- one that matters: *"both live employments carry `pay_group_id = NULL`, no `hr.pay_period` can
-- ever be generated, and therefore period lifecycle, attestation, approval, export and lock are
-- all unreachable. This is the single defect that makes P-8 permanent."*
--
-- Shipping the create control fixes half of that. Creating a pay group and then attaching nobody
-- to it changes nothing: **no `public.hr_*` RPC writes `pay_group_id` at all.** Checked live —
-- zero functions in `public` whose body so much as mentions the column outside
-- `hr_employee_create` (which accepts it at hire) and `hr_structure_list` (which reads it). So a
-- person hired before the pay group existed — which is every person in every org today, because
-- the group could not be created — can never be attached to one through the product.
--
-- One RPC, deliberately narrow: it moves an employment between pay groups and does nothing else.
-- The pay group must belong to the same employer, because a pay group hangs off
-- `hr.employer_profile` and attaching across employers would cut somebody's periods against
-- another company's calendar.
--
-- 🚨 THE MOVE IS NOT RETROACTIVE, AND THE ENVELOPE SAYS SO. Pay periods and workweeks already cut
-- for this employment keep the group they were cut under — the same rule §2.4 route 70 states for
-- the workweek boundary (*"existing workweeks are not re-cut; a migration that back-updates them
-- is a defect"*). Moving somebody mid-period is a real thing an HR admin does, and it must not
-- silently rewrite hours already computed and possibly already exported.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

create or replace function public.hr_employment_set_pay_group(
  p_employment_id uuid, p_pay_group_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, hr
as $fn$
declare
  v_org uuid; v_gate jsonb; v_profile uuid; v_pg_profile uuid; v_prior uuid; v_name text;
begin
  select em.organization_id, em.employer_profile_id, em.pay_group_id
    into v_org, v_profile, v_prior
    from hr.employment em where em.id = p_employment_id and em.deleted_at is null;
  if v_org is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;

  v_gate := hr._l1_write_gate(v_org, 'working_record.write', p_employment_id,
                              'hr_employment', 'update', 'pay_group');
  if v_gate is not null then return v_gate; end if;

  if p_pay_group_id is not null then
    select pg.employer_profile_id, pg.name into v_pg_profile, v_name
      from hr.pay_group pg where pg.id = p_pay_group_id and pg.deleted_at is null;
    if v_pg_profile is null then
      return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'pay_group_id',
        'detail', 'That pay group no longer exists.');
    end if;
    -- a pay group hangs off an employer of record; attaching across employers would cut this
    -- person's periods against another company's calendar
    if v_pg_profile <> v_profile then
      return jsonb_build_object('ok', false, 'reason', 'pay_group_other_employer',
        'field', 'pay_group_id',
        'detail', 'That pay group belongs to a different employer of record.');
    end if;
  end if;

  perform hr.arm_write();
  update hr.employment set pay_group_id = p_pay_group_id where id = p_employment_id;

  return jsonb_build_object('ok', true,
    'employment_id', p_employment_id,
    'pay_group_id', p_pay_group_id,
    'pay_group_name', v_name,
    'previous_pay_group_id', v_prior,
    -- §2.4 route 70's rule, restated on the wire so a surface can say it before saving
    'existing_periods_recut', false,
    'audit_id', hr._l1_write_audit(v_org, 'hr_employment', 'update', ARRAY[p_employment_id],
                                   p_employment_id, 'pay_group'));
end
$fn$;

do $$ begin
  execute 'revoke all on function public.hr_employment_set_pay_group(uuid, uuid) from public, anon';
  execute 'grant execute on function public.hr_employment_set_pay_group(uuid, uuid) '
       || 'to authenticated, service_role';
end $$;

-- ============================================================ assertions

do $$
declare v_bad int;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'hr_employment_set_pay_group') then
    raise exception 'hr_l1_13: the writer did not land';
  end if;
  if has_function_privilege('anon', 'public.hr_employment_set_pay_group(uuid, uuid)', 'execute') then
    raise exception 'hr_l1_13: hr_employment_set_pay_group is executable by anon';
  end if;

  -- it must refuse a cross-employer group rather than cut somebody's periods on another
  -- company's calendar
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hr_employment_set_pay_group')
       not like '%pay_group_other_employer%' then
    raise exception 'hr_l1_13: the cross-employer guard is missing';
  end if;

  -- and it must arm the write guard like every other hr.* writer (SPEC-ACCESS law 2)
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hr_employment_set_pay_group')
       not like '%hr.arm_write()%' then
    raise exception 'hr_l1_13: the writer never arms hr._guard_hr_write';
  end if;

  -- F1's class stays closed
  select count(*) into v_bad from hr.stable_doors_that_write();
  if v_bad > 0 then
    raise exception 'hr_l1_13: % non-volatile door(s) can reach a writer', v_bad;
  end if;
end $$;
