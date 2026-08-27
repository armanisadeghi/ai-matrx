-- HR domain C4 — migration 9 (register item HRB-008 follow-up, lane workflow-engine).
--
-- 🚨 THE ENGINE WAS PASSING AN ORGANIZATION ID INTO `hr.capability`'s SUBJECT-EMPLOYMENT SLOT, AND
-- SINCE hr_c3_13 THAT REFUSES EVERY CALLER, WHATEVER THEY HOLD.
--
-- `hr.capability`'s signature is, and always has been:
--
--     hr.capability(p_user uuid, p_capability text, p_subject_employment uuid default null,
--                   p_at date default current_date, p_organization_id uuid default null)
--
-- Seven C4 call sites wrote `hr.capability(v_uid, '<cap>', inst.organization_id)` — an organization
-- id landing in `p_subject_employment`. It was latent while the third argument only fed the
-- population check (an `org`-scoped role assignment matched regardless of the value). hr_c3_13 made
-- the subject's tenant authoritative:
--
--     if p_subject_employment is not null then
--       select em.organization_id into v_org from hr.employment em where em.id = p_subject_employment ...
--       if v_org is null then return false; end if;
--
-- An organization id is never an employment id, so `v_org` resolved NULL and the predicate returned
-- FALSE unconditionally. The measured effect, found by the HRB-008 proof suite once it could run
-- past §8.2: `hr.wf_publish_definition` refused `no_publish_authority` and `hr.wf_record_result`
-- refused `not_the_integration_actor` for the org's own HR owner. `hr.wf_cancel`,
-- `hr.wf_reassign_step`, `hr.wf_resolve_failure` and `hr.wf_instance` carried the same argument and
-- were refusing every authenticated caller in exactly the same way, unmeasured.
--
-- 🚨 THIS IS A C4 DEFECT THAT C3 EXPOSED, NOT A C3 REGRESSION. hr_c3_13 is right: the subject's
-- organization IS authoritative, and a predicate that cannot resolve the tenant must fail closed.
-- The bug is that this lane never asked the question it meant to ask. The fix is here.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE FIVE-ARGUMENT POSITIONAL FORM, BECAUSE THAT IS WHAT EVERY CORRECT CALLER IN THE DATABASE
--    ALREADY USES. `public.hr_incident_status`, `public.hr_mint_investigation_token` and
--    `public.hr_payroll_export_list` all read
--    `hr.capability(v_uid, '<cap>', null, current_date, <org>)`, and hr_c3_13's own rewrite of its
--    ambient callers landed on the same shape. One house form beats two.
--
-- 2. ONLY THE CALLS WHOSE THIRD ARGUMENT IS LITERALLY AN `organization_id` ARE REWRITTEN.
--    `hr.wf_pending` passes `p_employment_id` there — a genuine subject employment, correct as it
--    stands — and `hr.wf_inbox` passes NULL to ask the ambient question across every org the caller
--    works in, which is what an inbox is. Neither is touched. A blanket rewrite would have broken
--    both.
--
-- 3. THE BODIES ARE REWRITTEN FROM THE LIVE CATALOG, for the reason hr_c4_08 records: these
--    functions have been fixed at the source by later lanes, and re-pasting the C4 originals to
--    change one argument each would silently revert those fixes. `CREATE OR REPLACE FUNCTION`
--    keeps the ACL and the COMMENT. Idempotent: after the first run nothing matches.
--
-- Authority: SPEC-ACCESS §1.4 (the one role-and-population predicate; pass p_organization_id
-- whenever the answer is about a particular tenant) and SPEC-WORKFLOW-ENGINE §4.2.
-- Applied live as `hr_c4_09_capability_organization_argument`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ 1. the rewrite
do $mig$
declare
  r      record;
  v_def  text;
  v_new  text;
  v_done integer := 0;
  -- v_uid, a quoted capability slug, then `inst.organization_id` / `d.organization_id` as the
  -- THIRD POSITIONAL argument — the exact defect and nothing else.
  v_pat  constant text := 'hr\.capability\(v_uid,\s*''([a-z_]+\.[a-z_]+)'',\s*((?:inst|d)\.organization_id)\)';
begin
  for r in
    select p.oid, p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr'
       and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
       and p.prosrc ~ v_pat
     order by 2
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, v_pat,
                            'hr.capability(v_uid, ''\1'', null, current_date, \2)', 'g');
    if v_new = v_def then
      raise exception 'hr_c4_09: % matches the defect in prosrc but not in its definition', r.sig;
    end if;
    execute v_new;
    v_done := v_done + 1;
  end loop;
  raise notice 'hr_c4_09: % engine function(s) now ask hr.capability about the right tenant', v_done;
end
$mig$;

-- ============================================================ 2. post-conditions
do $$
declare
  v_bad  integer;
  v_n    integer;
  v_left text;
begin
  -- 2a. 🚨 NOWHERE in the database may an organization id sit in hr.capability's subject slot.
  -- Scoped to every schema, not just this lane's, because the class is what matters.
  select count(*), string_agg(distinct n.nspname || '.' || p.proname, ', ')
    into v_bad, v_left
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname <> 'capability'
     -- exactly THREE arguments, the third being an organization id. `[^,;()]+` per argument keeps
     -- this off the correct five-argument form, whose organization sits in the fifth slot.
     and p.prosrc ~ 'hr\.capability\(\s*[^,;()]+,\s*[^,;()]+,\s*[a-z_]*\.?organization_id\s*\)';
  if v_bad > 0 then
    raise exception 'hr_c4_09: % function(s) still pass an organization id as hr.capability''s third argument: %',
      v_bad, v_left;
  end if;

  -- 2b. and the seven rewritten call sites are present in the five-argument form
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
    lateral regexp_matches(p.prosrc,
      'hr\.capability\(v_uid, ''[a-z_]+\.[a-z_]+'', null, current_date, (?:inst|d)\.organization_id\)', 'g') m
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_');
  if v_n <> 7 then
    raise exception 'hr_c4_09: expected 7 tenant-scoped engine capability calls, found %', v_n;
  end if;

  -- 2c. the two deliberate non-rewrites are STILL what they were (RECORDED DECISION 2). A future
  -- blanket rewrite of this family would break the inbox and the pending list, so they are pinned.
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_pending')
     !~ 'hr\.capability\(v_uid, ''workflow\.view_queue'', p_employment_id\)' then
    raise exception 'hr_c4_09: hr.wf_pending no longer passes a subject employment to hr.capability';
  end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_inbox')
     !~ 'hr\.capability\(v_uid, ''workflow\.view_queue'', null\)' then
    raise exception 'hr_c4_09: hr.wf_inbox no longer asks the ambient inbox question';
  end if;

  -- 2d. nothing lost SECURITY DEFINER, the pinned search_path, or hr_c4_08's statement-scoped arm.
  -- Scoped to the engine functions that actually reach the catalog — the ones that arm the write
  -- guard or ask the capability predicate. `hr._wf_condition_met(jsonb, jsonb)` is deliberately
  -- outside it: a pure predicate over two jsonb values that touches no table and is SECURITY
  -- INVOKER by design.
  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and (p.prosrc ~ 'arm_write' or p.prosrc ~ 'hr\.capability\(')
     and (not p.prosecdef
          or p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'));
  if v_bad > 0 then
    raise exception 'hr_c4_09: % engine function(s) lost SECURITY DEFINER or the pinned search_path', v_bad;
  end if;
  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'privileged_write';
  if v_bad > 0 then
    raise exception 'hr_c4_09: % engine function(s) went back to the legacy write-guard arm', v_bad;
  end if;

  -- 2e. the public doors kept their grants
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'hr\_wf\_%'
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_bad > 0 then
    raise exception 'hr_c4_09: % public.hr_wf_* door(s) lost the authenticated EXECUTE grant', v_bad;
  end if;

  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  if v_bad > 0 then
    raise exception 'hr_c4_09: % hr tokens no longer certify', v_bad;
  end if;
end $$;

-- ============================================================ 3. the behaviour, on live data
-- Structure is not behaviour. Where a live HR role assignment exists that actually carries
-- `workflow.cancel`, this asks the predicate both ways and refuses to let the file commit unless
-- the two disagree in the direction this migration claims. Read-only; writes nothing.
do $$
declare
  r         record;
  v_as_org  boolean;
  v_as_subj boolean;
begin
  select e.login_user_id as uid, ra.organization_id as org
    into r
    from hr.role_assignment ra
    join hr.employment em on em.id = ra.employment_id and em.deleted_at is null
    join hr.employee   e  on e.id  = em.employee_id
    join hr.access_role ar on ar.role_key = ra.role_key and ar.deleted_at is null and ar.is_active
   where ra.is_active and ra.revoked_at is null
     and ra.effective_from <= current_date
     and (ra.effective_to is null or ra.effective_to >= current_date)
     and e.login_user_id is not null
     and 'workflow.cancel' = any(ar.capabilities)
   limit 1;

  if not found then
    raise notice 'hr_c4_09: no live workflow.cancel role holder to probe; the HRB-008 proof suite covers this on its own fixtures';
    return;
  end if;

  v_as_org  := hr.capability(r.uid, 'workflow.cancel', null, current_date, r.org);
  v_as_subj := hr.capability(r.uid, 'workflow.cancel', r.org);   -- the defect, spelled out

  if not v_as_org then
    raise exception 'hr_c4_09: a live workflow.cancel holder is refused even with the organization named';
  end if;
  if v_as_subj then
    raise exception 'hr_c4_09: an organization id in the subject slot still answers true — hr_c3_13''s tenant rule is not in force';
  end if;
end $$;
