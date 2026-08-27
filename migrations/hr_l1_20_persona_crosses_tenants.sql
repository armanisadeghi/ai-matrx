-- HR domain L1 — migration 20 (register item HRB-013, lane l1-employees).
--
-- 🚨 SECURITY. AN HR ROLE IN ONE EMPLOYER GRANTED HR ADMIN IN EVERY EMPLOYER.
--
-- Applied live as `hr_l1_20_persona_crosses_tenants`. Idempotent.
-- Authority: SPEC-ACCESS (tenancy), SPEC-EMPLOYEES §1.3, §3.1 (directory opt-out).
--
-- ===================================================================================
-- THE MECHANISM, read out of `hr.capability`'s own body.
--
-- `hr.capability(p_user, p_capability, p_subject_employment, p_at, p_organization_id)`
-- resolves the tenant it is being asked about in one of two ways:
--
--     v_org := p_organization_id;                     -- (a) told directly
--     if p_subject_employment is not null then        -- (b) derived from the subject
--       select em.organization_id into v_org from hr.employment em where em.id = …;
--       if v_org is null then return false; end if;
--     end if;
--
-- and then applies the tenant boundary to the role lookup as:
--
--     and (v_org is null or ra.organization_id = v_org)
--
-- 🚨 THAT PREDICATE IS A NO-OP WHEN `v_org` IS NULL. It does not mean "any org is
-- fine to ask about"; it means **the boundary is not checked at all**. So a call
-- that passes NEITHER a subject NOR an organization — `hr.capability(u, 'x', null,
-- at)` — returns true if the user holds that capability in ANY tenant, and the
-- role assignment that satisfies it may belong to a completely unrelated company.
--
-- The population check (`hr.population_contains`) is likewise gated on
-- `p_subject_employment is not null`, so it does not constrain these calls either.
-- Passing the organization is what closes both: `v_org` becomes non-null, and the
-- role must live in the employer actually being asked about.
--
-- ===================================================================================
-- WHAT IT REACHED. Eight unguarded calls in this lane, in six functions — the
-- reported one is the least of them.
--
--   hr._l1_persona          ×2  identity.write / working_record.write. Returns
--                               'hr_admin' for a user whose only HR role is in
--                               another company. `hr_directory_list` uses the
--                               persona to bypass `directory_opt_out`, so a person
--                               who asked to be hidden was shown to a stranger who
--                               happened to be an HR admin somewhere else. Also
--                               reached through `hr_my_context` (×2), `hr_org_chart`
--                               and `hr_position_change`.
--   hr._l1_settings_gate    ×1  identity.write. This is a WRITE gate: HR settings
--                               for ANY employer were writable by anyone holding
--                               identity.write anywhere.
--   public.hr_structure_list ×3 comp.read ×2 — which unlocks JOB TITLE PAY RANGES —
--                               and identity.write. The door does check standing, so
--                               this needed membership; it did not need it to be
--                               *this* employer's HR role.
--   public.hr_duplicate_scan ×1 identity.write, and this door has no other org
--                               check, so it let an outsider probe a tenant's
--                               employee names and emails for matches.
--   public.hr_knob_index     ×1 identity.write.
--
-- Two callers in the same schema were ALREADY correct and are the pattern this file
-- follows — `hr_access_audit_query` passes `v_org`, `hr_incident_status` passes
-- `i.organization_id`. Nothing here invents a new idea; it applies the existing one
-- everywhere it was missed.
--
-- 🚨 THE REWRITE IS PROGRAMMATIC, from `pg_get_functiondef`, because these bodies
-- are long and retyping them by hand is how an unrelated line gets changed. Each
-- replacement is asserted to have actually landed, and the file refuses to finish if
-- any NULL-subject call without an organization remains anywhere in the lane.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

do $$
declare
  r record;
  v_def text;
  v_new text;
  v_hits int := 0;
  -- fn, the exact call text as it appears, the org expression to append
  v_fix text[][] := array[
    ['hr._l1_persona(uuid,uuid,date)',
     'hr.capability(p_user, ''identity.write'', null, p_at)',
     'hr.capability(p_user, ''identity.write'', null, p_at, p_org)'],
    ['hr._l1_persona(uuid,uuid,date)',
     'hr.capability(p_user, ''working_record.write'', null, p_at)',
     'hr.capability(p_user, ''working_record.write'', null, p_at, p_org)'],
    ['hr._l1_settings_gate(uuid,text)',
     'hr.capability(v_uid, ''identity.write'', null, current_date)',
     'hr.capability(v_uid, ''identity.write'', null, current_date, p_org)'],
    ['public.hr_duplicate_scan(uuid,jsonb)',
     'hr.capability(v_uid, ''identity.write'', null, current_date)',
     'hr.capability(v_uid, ''identity.write'', null, current_date, p_organization_id)'],
    ['public.hr_knob_index(uuid,boolean)',
     'hr.capability(v_uid, ''identity.write'', null, current_date)',
     'hr.capability(v_uid, ''identity.write'', null, current_date, p_organization_id)'],
    ['public.hr_structure_list(uuid)',
     'hr.capability(v_uid, ''identity.write'', null, current_date)',
     'hr.capability(v_uid, ''identity.write'', null, current_date, p_organization_id)'],
    ['public.hr_structure_list(uuid)',
     'hr.capability(v_uid,''comp.read'',null,current_date)',
     'hr.capability(v_uid,''comp.read'',null,current_date,p_organization_id)']
  ];
  i int;
begin
  for i in 1 .. array_length(v_fix, 1) loop
    v_def := pg_get_functiondef(v_fix[i][1]::regprocedure);

    -- already org-scoped from a previous run of this file
    if position(v_fix[i][2] in v_def) = 0 then
      continue;
    end if;

    -- `replace` rewrites EVERY occurrence, which is what `hr_structure_list`'s two
    -- identical `comp.read` calls need.
    v_new := replace(v_def, v_fix[i][2], v_fix[i][3]);
    if v_new = v_def then
      raise exception 'hr_l1_20: replacement produced no change for % / %', v_fix[i][1], v_fix[i][2];
    end if;
    execute v_new;
    v_hits := v_hits + 1;
  end loop;

  raise notice 'hr_l1_20: rewrote % function bodies', v_hits;
end $$;

-- ============================================================ assertions

do $$
declare v_bad int; v_list text;
begin
  -- 🚨 THE STANDING GUARD. Any NULL-subject `hr.capability` call in this lane that
  -- does not also pass an organization is the same leak wearing a different name.
  -- Counted by pattern rather than by a list of known sites, so a NEW one added
  -- tomorrow fails here instead of shipping.
  select count(*), string_agg(fn || ' :: ' || call, E'\n')
    into v_bad, v_list
  from (
    select n.nspname || '.' || p.proname as fn, m[1] as call
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral regexp_matches(p.prosrc, '(hr\.capability\([^;]{0,200}?\))', 'g') m
     where n.nspname in ('hr','public')
       and (p.proname like '\_l1\_%' or p.proname in
            ('hr_directory_list','hr_org_chart','hr_my_context','hr_employee_profile',
             'hr_employment_history','hr_pending_changes','hr_structure_list','hr_knob_index',
             'hr_duplicate_scan','hr_position_change'))
       -- a NULL subject …
       and m[1] ~ 'null'
       -- … and no organization argument after the date
       and m[1] !~ '(p_org|p_organization_id|v_org|organization_id)\s*\)$'
  ) q;

  if v_bad > 0 then
    raise exception 'hr_l1_20: % unguarded NULL-subject capability call(s) remain:%s',
      v_bad, E'\n' || v_list;
  end if;
end $$;

do $$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_l1_persona';
  if v_src !~ 'identity\.write.{0,30}p_org' then
    raise exception 'hr_l1_20: _l1_persona is not org-scoped';
  end if;

  -- the lane's other standing invariants stay closed
  if (select count(*) from hr.stable_doors_that_write()) > 0 then
    raise exception 'hr_l1_20: a non-volatile door can reach a writer';
  end if;
end $$;
