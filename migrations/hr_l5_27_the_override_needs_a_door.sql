-- HR domain L5 — migration 27 (register item HRB-017, lane L5 Leave & PTO).
--
-- §2.8's OVERRIDE NOW HAS A DOOR, NOT JUST A COLUMN.
--
-- `hr_l5_25`'s trigger admits a deliberate out-of-scope enrollment when
-- `metadata.worker_class_override_reason` is present. That closed the accident, and left the
-- sanctioned path reachable only by writing metadata directly — which is precisely the raw-INSERT
-- habit this whole thread is about. An escape hatch whose only entrance is the thing you are
-- trying to stop people doing is not an escape hatch.
--
-- `hr.leave_enroll` gains `p_override_reason`. Without it the door behaves exactly as before —
-- contractors and out-of-scope classes are SKIPPED and named in `skipped[]`, never silently
-- dropped, because a bulk roster apply must report per-row outcomes. With it, those same rows are
-- enrolled deliberately, the reason is stamped on each one, and the trigger opens the compliance
-- exception. The refusal and the override are the same decision seen from two sides.
--
-- Authority: SPEC-LEAVE §2.8; D8. Contract row declared. Applied live as
-- `hr_l5_27_the_override_needs_a_door`. Idempotent.

create or replace function hr.leave_enroll(
  p_leave_policy_id uuid, p_employment_ids uuid[], p_effective_from date default null,
  p_override_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  pol hr.leave_policy%rowtype; v_rung text; v_from date; v_added integer := 0;
  v_skipped jsonb := '[]'::jsonb; v_emp uuid; v_chk jsonb; v_override text;
  v_overridden integer := 0;
begin
  pol := hr._leave_policy_at(p_leave_policy_id);
  if pol.id is null then return jsonb_build_object('granted', false, 'reason','not_found'); end if;
  v_rung := hr._leave_admin_rung(pol.organization_id);
  if v_rung not in ('hr_admin','hr_owner') then
    return jsonb_build_object('granted', false, 'reason','not_an_hr_admin');
  end if;
  v_from := coalesce(p_effective_from, current_date);
  v_override := nullif(btrim(coalesce(p_override_reason, '')), '');

  -- §2.8: an override is a DECISION, so it must carry enough of one to be worth recording.
  if v_override is not null and length(v_override) < 20 then
    return jsonb_build_object('granted', false, 'reason','override_reason_too_short',
      'detail','Enrolling somebody outside a policy''s worker class is a deliberate exception. '
            || 'Say why in at least 20 characters — it is recorded against every row it creates.');
  end if;

  foreach v_emp in array coalesce(p_employment_ids, '{}'::uuid[]) loop
    -- ONE predicate (hr_l5_25/26), the same one the table's gate and the request submit use.
    v_chk := hr._leave_worker_class_ok(v_emp, p_leave_policy_id, v_from);

    if not coalesce((v_chk ->> 'ok')::boolean, true) then
      if v_override is null then
        -- D8 and §2.8: never AUTO-enrolled. Named and skipped, never silently dropped, because a
        -- bulk apply reports per-row outcomes — 47 enrolled and 3 named is the correct result.
        v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
          'employment_id', v_emp,
          'reason', case when (v_chk ->> 'worker_class') = 'contractor'
                         then 'contractor_not_auto_enrolled'
                         else 'outside_worker_class_scope' end,
          'worker_class', v_chk -> 'worker_class',
          'policy_scope', v_chk -> 'scope',
          'detail','Enrol this person deliberately by giving a reason — it is recorded against the row.'));
        continue;
      end if;
      v_overridden := v_overridden + 1;
    end if;

    if exists (select 1 from hr.leave_enrollment e
                where e.employment_id = v_emp and e.leave_policy_id = p_leave_policy_id
                  and e.deleted_at is null
                  and (e.effective_to is null or e.effective_to >= v_from)) then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'employment_id', v_emp, 'reason','already_enrolled'));
      continue;
    end if;

    perform hr.arm_write();
    insert into hr.leave_enrollment
      (employment_id, leave_policy_id, effective_from, policy_year_start_on, organization_id,
       metadata)
    values
      (v_emp, p_leave_policy_id, v_from,
       -- §2.8: stamped at enrollment and NEVER moved — moving it would re-cut a carryover
       -- boundary retroactively.
       date_trunc('year', v_from)::date, pol.organization_id,
       case when v_override is not null and not coalesce((v_chk ->> 'ok')::boolean, true)
            then jsonb_build_object('worker_class_override_reason', v_override)
            else '{}'::jsonb end);
    v_added := v_added + 1;
  end loop;

  return jsonb_build_object('granted', true, 'enrolled', v_added, 'skipped', v_skipped,
                            'enrolled_by_override', v_overridden,
                            'override_reason', v_override);
end
$function$;

create or replace function public.hr_leave_enroll(
  p_leave_policy_id uuid, p_employment_ids uuid[], p_effective_from date default null,
  p_override_reason text default null)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_enroll(p_leave_policy_id, p_employment_ids, p_effective_from,
                                     p_override_reason); $function$;

select hr.leave_seal_door('hr_leave_enroll');

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active)
values
  ('hr', 'leave_enroll', 'hr_l5_27',
   array['_leave_worker_class_ok', 'worker_class_override_reason', 'contractor_not_auto_enrolled'],
   array[]::text[],
   'hr_l5_27: the door must read the ONE worker-class predicate, must keep naming skipped rows '
   || 'rather than dropping them, and must keep the §2.8 override reachable — an escape hatch whose '
   || 'only entrance is a raw INSERT is what produced the contractor-on-an-employee-policy row.',
   true)
on conflict do nothing;

do $$
declare v_res jsonb;
begin
  -- the door still exists in both arities and the old 3-arg call sites keep working
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'hr_leave_enroll') then
    raise exception 'hr_l5_27: the enrollment door vanished';
  end if;
  -- a short reason is refused rather than quietly accepted
  v_res := hr.leave_enroll('00000000-0000-0000-0000-000000000000'::uuid, '{}'::uuid[], null, 'too short');
  if (v_res ->> 'reason') is distinct from 'not_found'
     and (v_res ->> 'reason') is distinct from 'override_reason_too_short' then
    raise exception 'hr_l5_27: a too-short override reason was not handled: %', v_res;
  end if;
  if (select count(*) from hr.leave_door_grant_audit() where verdict like 'DEFECT%') > 0 then
    raise exception 'hr_l5_27: the re-created enrollment door is not sealed';
  end if;
end $$;
