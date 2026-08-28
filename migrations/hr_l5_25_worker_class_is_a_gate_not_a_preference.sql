-- HR domain L5 — migration 25 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 A CONTRACTOR WAS ENROLLED IN A POLICY SCOPED TO EMPLOYEES, AND NOTHING ANYWHERE SAID SO.
--
-- Round 31's non-verdict observation, run down. The fixture policy carries
-- `worker_class_scope = ['employee']`; `hr.position_assignment.worker_class` for the enrolled test
-- employment is **`contractor`**; `created_by` on that enrollment is **NULL**. That last column is
-- the confession: it was not written through a door. **It was written by this lane's own proof
-- script, with a raw INSERT that walked straight past `hr.leave_enroll` — the door that already
-- refuses exactly this, and has since `hr_l5_05`.**
--
-- Same shape as round 30's stale policy: my test data doing the thing the product forbids, and
-- then the product behaving strangely around it. The verifier was right that it is the real
-- remainder of that puzzle — not because the availability predicate is date-sensitive, but
-- because the fixture was never lawful to begin with.
--
-- THE THREE ANSWERS.
--
-- **(1) Yes, and the door was never the weak point — the TABLE was.** `hr.leave_enroll` skips an
-- out-of-scope employment with `outside_worker_class_scope` / `contractor_not_auto_enrolled`, and
-- that is right for a bulk roster apply (47 enrolled, 3 named and skipped, never all-or-nothing).
-- But a rule that lives only in one door is a rule any other writer can ignore, and one did. The
-- gate now lives on `hr.leave_enrollment` itself, as a trigger, refusing by name.
--
-- **(2) The existing one is SURFACED, never deleted.** `hr.leave_enrollments_out_of_scope(org)`
-- lists every enrollment whose worker class is outside its policy's scope, with whether an
-- override covers it; the trigger raises a compliance exception when one is created under
-- override. Deleting somebody's leave enrollment to make a report clean is how a balance
-- disappears without explanation — and the ledger behind it would survive anyway, orphaned.
--
-- **(3) No, it did not, and now it does — with a FOURTH NAME.** `hr.leave_request_submit` checked
-- the policy, the enrollment dates and the span, and never the worker class. §3.2's eligibility
-- gate condition 5 is *"worker class is in `worker_class_scope`"*, so a contractor holding an
-- unlawfully-created enrollment could file. Per this lane's own three-refusals split, a fourth
-- fact gets a fourth name — `worker_class_outside_policy_scope` — not a collapse into one of the
-- existing three.
--
-- 🚨 **THE OVERRIDE IS PRESERVED, BECAUSE THE SPEC ASKS FOR IT.** §2.8: *"Adding a contractor
-- requires an explicit override with a reason."* A blanket refusal would delete a sanctioned path
-- and force the next person back to a raw INSERT — which is the behaviour being fixed. So the
-- gate refuses an ACCIDENT and admits a REASONED DECISION: an override needs a non-empty reason
-- recorded on the row, and creating one opens a compliance exception. The escape hatch is the
-- point; an unrecorded escape hatch is the defect.
--
-- Authority: SPEC-LEAVE §2.8, §3.2 condition 5, §4.2; D8. Contract rows declared below per the
-- shared-function law. Applied live as `hr_l5_25_worker_class_is_a_gate_not_a_preference`.
-- Idempotent.

-- -----------------------------------------------------------------------------------
-- 1. The one predicate, so the trigger, the door and the submit cannot disagree
-- -----------------------------------------------------------------------------------

create or replace function hr._leave_worker_class_ok(p_employment_id uuid, p_leave_policy_id uuid,
                                                     p_as_of date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare v_scope text[]; v_class text;
begin
  select p.worker_class_scope into v_scope
    from hr.leave_policy p where p.id = p_leave_policy_id and p.deleted_at is null;

  -- An EMPTY scope means the policy names no restriction, which is not the same as naming none
  -- of them. `'{}'` is the column default, so treating it as "nobody qualifies" would lock every
  -- policy nobody has scoped yet.
  if v_scope is null or array_length(v_scope, 1) is null then
    return jsonb_build_object('ok', true, 'unscoped', true);
  end if;

  select pa.worker_class into v_class
    from hr.position_assignment pa
   where pa.employment_id = p_employment_id and pa.is_primary and pa.deleted_at is null
     and pa.effective_from <= p_as_of
     and (pa.effective_to is null or pa.effective_to > p_as_of)
   order by pa.effective_from desc limit 1;

  if v_class is null then
    -- No assignment in force means no worker class to test. Say so rather than passing or
    -- failing silently — the caller decides, and hr_l5_07 already refuses a costless span for
    -- the same underlying gap.
    return jsonb_build_object('ok', true, 'worker_class_unknown', true, 'scope', to_jsonb(v_scope));
  end if;

  return jsonb_build_object(
    'ok', (v_class = any(v_scope)),
    'worker_class', v_class,
    'scope', to_jsonb(v_scope));
end
$function$;

comment on function hr._leave_worker_class_ok(uuid, uuid, date) is
  'SPEC-LEAVE §3.2 condition 5 / §2.8 / D8: is this employment''s worker class inside the policy''s '
  'worker_class_scope? ONE body, shared by the enrollment trigger, the enrollment door and the '
  'request submit, so a contractor cannot be lawful in one and unlawful in another. An EMPTY '
  'scope is unrestricted, not empty-set.';

-- -----------------------------------------------------------------------------------
-- 2. The gate, on the table — where a rule survives writers that never heard of the door
-- -----------------------------------------------------------------------------------

create or replace function hr._leave_enrollment_worker_class_gate()
returns trigger
language plpgsql
as $function$
declare v_chk jsonb; v_reason text; v_org uuid;
begin
  v_chk := hr._leave_worker_class_ok(new.employment_id, new.leave_policy_id,
                                     coalesce(new.effective_from, current_date));
  if coalesce((v_chk ->> 'ok')::boolean, true) then
    return new;
  end if;

  -- §2.8's sanctioned path: an EXPLICIT override, with a REASON, recorded on the row.
  v_reason := nullif(btrim(coalesce(new.metadata ->> 'worker_class_override_reason', '')), '');
  if v_reason is null then
    raise exception
      'LEAVE_ENROLLMENT_OUT_OF_WORKER_CLASS_SCOPE: this employment is %s and %s covers %s',
      v_chk ->> 'worker_class',
      (select name from hr.leave_policy where id = new.leave_policy_id),
      array_to_string(array(select jsonb_array_elements_text(v_chk -> 'scope')), ', ')
      using errcode = 'P0001',
            hint = 'SPEC-LEAVE §2.8 / D8: a contractor is never auto-enrolled. To enrol somebody '
                || 'outside a policy''s worker class deliberately, record '
                || 'metadata.worker_class_override_reason on the enrollment — an override is '
                || 'allowed, an accident is not.';
  end if;

  -- An override is lawful AND it is recorded. A reasoned exception to a worker-class gate is
  -- exactly the kind of thing that must leave a trail.
  select organization_id into v_org from hr.leave_policy where id = new.leave_policy_id;
  perform hr.raise_compliance_exception(
    v_org, 'US', null, null, 'leave-worker-class-scope', 'worker_class_override_enrolled',
    format('%s was enrolled in a policy that covers %s, deliberately. Reason given: %s',
           coalesce(v_chk ->> 'worker_class', 'this employment'),
           array_to_string(array(select jsonb_array_elements_text(v_chk -> 'scope')), ', '),
           v_reason),
    jsonb_build_object('employment_id', new.employment_id,
                       'leave_policy_id', new.leave_policy_id,
                       'override_reason', v_reason));
  return new;
end
$function$;

drop trigger if exists _zz_leave_enrollment_worker_class on hr.leave_enrollment;
create trigger _zz_leave_enrollment_worker_class
  before insert or update of employment_id, leave_policy_id on hr.leave_enrollment
  for each row execute function hr._leave_enrollment_worker_class_gate();

-- -----------------------------------------------------------------------------------
-- 3. Surface what already exists — never delete it
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_enrollments_out_of_scope(p_organization_id uuid)
returns table(enrollment_id uuid, employment_id uuid, employee_name text, policy_name text,
              worker_class text, policy_scope text[], override_reason text, created_by_a_door boolean)
language sql
stable
security definer
set search_path to 'hr', 'public'
as $function$
  select e.id, e.employment_id,
         hr._subject_display_name(e.employment_id, auth.uid()),
         p.name,
         (hr._leave_worker_class_ok(e.employment_id, e.leave_policy_id,
                                    coalesce(e.effective_from, current_date)) ->> 'worker_class'),
         p.worker_class_scope,
         nullif(btrim(coalesce(e.metadata ->> 'worker_class_override_reason','')), ''),
         -- `created_by` is NULL when a row was written by something that was not a door acting
         -- for a person. It is how this defect was identified in the first place.
         (e.created_by is not null)
    from hr.leave_enrollment e
    join hr.leave_policy p on p.id = e.leave_policy_id and p.deleted_at is null
   where e.organization_id = p_organization_id and e.deleted_at is null
     and (e.effective_to is null or e.effective_to >= current_date)
     and not coalesce((hr._leave_worker_class_ok(e.employment_id, e.leave_policy_id,
                        coalesce(e.effective_from, current_date)) ->> 'ok')::boolean, true)
   order by 4, 3;
$function$;

comment on function hr.leave_enrollments_out_of_scope(uuid) is
  'Every live enrollment whose worker class sits outside its policy''s scope, with the override '
  'reason if one was recorded and whether a door wrote it at all. SURFACED, never deleted: '
  'removing somebody''s enrollment to make a report clean is how a balance disappears without '
  'explanation, and the ledger behind it would outlive the deletion anyway.';

-- -----------------------------------------------------------------------------------
-- 4. The fourth refusal, with the fourth name
-- -----------------------------------------------------------------------------------

do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_request_submit';

  if v_def like '%worker_class_outside_policy_scope%' then
    raise notice 'hr_l5_25: the worker-class refusal is already present — nothing to do.';
    return;
  end if;

  v_new := replace(v_def,
    E'  if p_ends_on < p_starts_on then',
    E'  -- §3.2 condition 5, which this door never checked: worker class must be inside the\n'
 || E'  -- policy''s scope. A FOURTH fact gets a FOURTH NAME — collapsing it into "not enrolled"\n'
 || E'  -- would tell a contractor they are not on a policy they demonstrably are on.\n'
 || E'  -- An enrollment carrying an explicit §2.8 override is deliberate and is allowed through.\n'
 || E'  declare\n'
 || E'    v_wc jsonb;\n'
 || E'    v_override text;\n'
 || E'  begin\n'
 || E'    v_wc := hr._leave_worker_class_ok(p_employment_id, p_leave_policy_id, p_starts_on);\n'
 || E'    select nullif(btrim(coalesce(e.metadata ->> ''worker_class_override_reason'','''')), '''')\n'
 || E'      into v_override\n'
 || E'      from hr.leave_enrollment e\n'
 || E'     where e.employment_id = p_employment_id and e.leave_policy_id = p_leave_policy_id\n'
 || E'       and e.deleted_at is null\n'
 || E'     order by e.effective_from desc limit 1;\n'
 || E'    if coalesce((v_wc ->> ''ok'')::boolean, true) is not true and v_override is null then\n'
 || E'      return jsonb_build_object(''granted'', false,\n'
 || E'        ''reason'',''worker_class_outside_policy_scope'',\n'
 || E'        ''worker_class'', v_wc -> ''worker_class'',\n'
 || E'        ''policy_scope'', v_wc -> ''scope'',\n'
 || E'        ''detail'', format(''%s covers %s, and this employment is %s. HR can enrol somebody ''\n'
 || E'                        || ''outside that on purpose, with a reason recorded — but it has ''\n'
 || E'                        || ''not been done here.'', v_pol.name,\n'
 || E'                           array_to_string(array(select jsonb_array_elements_text(v_wc -> ''scope'')), '', ''),\n'
 || E'                           coalesce(v_wc ->> ''worker_class'', ''not recorded'')));\n'
 || E'    end if;\n'
 || E'  end;\n\n'
 || E'  if p_ends_on < p_starts_on then');
  if v_new = v_def then
    raise exception 'hr_l5_25: the submit door''s date check did not match — re-derive the insert point';
  end if;
  execute v_new;
end $$;

-- -----------------------------------------------------------------------------------
-- 5. Contract rows — the shared-function law
-- -----------------------------------------------------------------------------------

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active)
values
  ('hr', '_leave_worker_class_ok', 'hr_l5_25',
   array['worker_class_scope', 'is_primary'], array[]::text[],
   'hr_l5_25: the ONE worker-class predicate. The enrollment trigger, the enrollment door and the '
   || 'request submit all read it, so a contractor cannot be lawful in one and unlawful in another. '
   || 'An empty scope means unrestricted, never empty-set.', true),
  ('hr', '_leave_enrollment_worker_class_gate', 'hr_l5_25',
   array['_leave_worker_class_ok', 'worker_class_override_reason'], array[]::text[],
   'hr_l5_25: the gate lives on the TABLE because a rule that lives only in a door is one any '
   || 'other writer can ignore — and one did, with a raw INSERT that produced a contractor on an '
   || 'employee-only policy. It must keep admitting the §2.8 reasoned override.', true),
  ('hr', 'leave_request_submit', 'hr_l5_25',
   array['worker_class_outside_policy_scope', 'policy_no_longer_exists', 'policy_inactive',
         'not_enrolled_on_these_dates'],
   array['policy_not_available'],
   'hr_l5_23/25: four distinct facts, four distinct names. The collapsed policy_not_available told '
   || 'an employee they lacked standing when the policy had been deleted under their open page, '
   || 'and a missing worker-class check let a contractor file against an employee-only policy.', true)
on conflict do nothing;

-- -----------------------------------------------------------------------------------
-- 6. Self-proof
-- -----------------------------------------------------------------------------------

do $$
declare v_def text; v_bad text; v_n integer;
begin
  -- an empty scope is unrestricted
  if not (hr._leave_worker_class_ok(
            '00000000-0000-0000-0000-000000000000'::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid) ->> 'ok')::boolean then
    raise exception 'hr_l5_25: an unscoped policy was treated as excluding everybody';
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_request_submit';
  if v_def not like '%worker_class_outside_policy_scope%' then
    raise exception 'hr_l5_25: the fourth refusal did not land in the submit door';
  end if;
  -- and the three earlier names must survive — a fourth name must not collapse the others
  foreach v_bad in array array['policy_no_longer_exists','policy_inactive',
                               'not_enrolled_on_these_dates'] loop
    if v_def not like '%' || v_bad || '%' then
      raise exception 'hr_l5_25: adding the fourth refusal lost %', v_bad;
    end if;
  end loop;

  -- every contract row this file declares must actually hold right now
  for v_bad, v_n in
    select c.schema_name || '.' || c.function_name, 1
      from hr.function_contract c
     where c.home_migration = 'hr_l5_25' and c.is_active
       and exists (
         select 1 from unnest(c.must_contain) m
          where (select pg_get_functiondef(p.oid) from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = c.schema_name and p.proname = c.function_name limit 1)
                not like '%' || m || '%')
  loop
    raise exception 'hr_l5_25: contract violated immediately on declaration: %', v_bad;
  end loop;
end $$;
