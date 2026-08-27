-- HR domain L3 — migration 19 (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 `hr.attendance_exception_resolve` COULD NOT PAY A STATUTORY PREMIUM IN ANY ORGANIZATION THAT
-- HAD NOT FORKED THE EARNING-CODE REGISTRY. Ownership transferred to this lane after the exception
-- lane's session closed; same defect and same fix as hr_l3_13b applied to `hr.recompute_apply`.
--
-- The lookup was caller-org-only, but the platform set is DELIBERATELY seeded in the SYSTEM org
-- (39c38960-…) — verified live: 38 codes, none in the organization under test. So a manager
-- resolving a `meal_not_provided` violation in a normal organization got
-- `hr_premium_earning_code_missing` — "This organization has no MEAL_PREMIUM earning code … Seed
-- the earning-code registry for this organization first."
-- Two failures in one: the premium (an hour of statutory pay) could not be written at all, and the
-- message told an administrator to seed a registry that is platform-seeded on purpose — advice that
-- cannot succeed and that forks the registry for no reason if followed.
--
-- THE FIX: resolve through the shared `hr._earning_code_id(org, code)` — the org's OWN row wins
-- where it exists, otherwise the system-org platform row. Same precedence `hr.capability` uses for
-- `hr.access_role`, and now the same resolver on BOTH premium writers, so the two cannot disagree
-- about which code a premium is paid on.
--
-- WHAT DELIBERATELY DID NOT CHANGE: an explicit `p_premium_earning_code_id` still wins untouched,
-- and the downstream `hr_premium_earning_code_mismatch` check still refuses a code that is inactive
-- or not a statutory premium. An organization that DEACTIVATED its own MEAL_PREMIUM has made a
-- choice; this must not silently route around it to the platform row. It refuses naming
-- `active=false`, which is the honest outcome.
--
-- 🚨 NOTE ON THE IDEMPOTENCY PROBE: it matches `hr._earning_code_id(` and NOT the bare substring
-- `_earning_code_id`, because the function already contains `p_premium_earning_code_id` and the
-- column `premium_earning_code_id`. The loose probe made a first attempt of this migration return
-- "already applied" and change nothing, which its own assertion then caught.
--
-- Applied live as `hr_l3_19_resolve_earning_code_system_fallback`. Idempotent.

do $outer$
declare
  v_def   text;
  v_from1 text;
  v_to1   text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.attendance_exception_resolve(uuid,text,text,uuid)'::regprocedure;

  if position('hr._earning_code_id(' in v_def) > 0 then
    raise notice 'hr_l3_19: already applied';
    return;
  end if;

  v_from1 := concat(
    '      select * into v_code from hr.earning_code', chr(10),
    '       where organization_id = v_ae.organization_id and code = v_want and deleted_at is null;');

  v_to1 := concat(
    '      -- hr_l3_19: the org own code wins; otherwise the SYSTEM-org platform set, which is where', chr(10),
    '      -- the seeded MEAL_PREMIUM / REST_PREMIUM actually live. Same shared resolver as', chr(10),
    '      -- hr.recompute_apply, so the two premium writers cannot disagree about the code.', chr(10),
    '      select * into v_code from hr.earning_code', chr(10),
    '       where id = hr._earning_code_id(v_ae.organization_id, v_want);');

  if position(v_from1 in v_def) = 0 then
    raise exception 'hr_l3_19: the caller-org-only lookup was not found';
  end if;

  v_def := replace(v_def, v_from1, v_to1);
  v_def := replace(v_def,
    'Seed the earning-code registry for this organization first.',
    'The premium is still owed - this needs a platform administrator, not an organization setting.');
  v_def := replace(v_def,
    'This organization has no %s earning code',
    'Neither this organization nor the platform earning-code set has a %s code');
  v_def := replace(v_def,
    '''door'', ''hr.earning_code_seed_org''',
    '''door'', ''platform earning-code seed'', ''premium_still_owed'', true');

  execute v_def;
end $outer$;

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr.attendance_exception_resolve(uuid,text,text,uuid)'::regprocedure);
  if v_def not like '%hr._earning_code_id(v_ae.organization_id, v_want)%' then
    raise exception 'hr_l3_19: the shared resolver is not used';
  end if;
  if position('where organization_id = v_ae.organization_id and code = v_want and deleted_at is null;'
              in v_def) > 0 then
    raise exception 'hr_l3_19: the caller-org-only lookup remains';
  end if;
  if v_def like '%Seed the earning-code registry for this organization first%' then
    raise exception 'hr_l3_19: the refusal still gives advice that cannot succeed';
  end if;
  if v_def not like '%p_premium_earning_code_id is not null%'
     or v_def not like '%hr_premium_earning_code_mismatch%' then
    raise exception 'hr_l3_19: the explicit-code path or the mismatch guard was lost';
  end if;
end $$;
