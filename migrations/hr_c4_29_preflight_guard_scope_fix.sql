-- HR domain C4 — migration 29 (register item HRB-008 follow-up; repairs hr_c4_25, twin of hr_c4_28).
--
-- 🚨 THE SAME SCOPE TRAP, THE SECOND TIME, IN THE GUARD I ADDED IN hr_c4_25.
--
--     declare v_pf_any boolean;
--     begin   select exists (…) into v_pf_any;
--     exception when others then return <fail-closed>; end;
--     if not v_pf_any then …                       -- ← v_pf_any died with the block
--
--   UndefinedColumnError: column "v_pf_any" does not exist
--
-- hr_c4_28 fixed exactly this shape in the subject lookup and I did not check whether the pre-flight
-- I had written moments earlier carried it too. It did. Both came from the same habit — wrapping a
-- lookup in `declare … begin … exception … end` and then reading the result on the next line — and
-- both hid behind early returns until a path finally ran past them.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE VARIABLE IS HOISTED, NOT THE LOGIC MOVED. `v_pf_action` and `v_pf_step` already live in
--    the function's own DECLARE (hr_c4_21 put them there); `v_pf_any` joins them, and the nested
--    `declare` goes away. The guard's structure, its predicate and both of its returns are
--    untouched — the only change is where the name lives, which is the whole bug.
--
-- 2. 🚨 THE ASSERTION EXECUTES THE DOOR, IT DOES NOT READ IT. hr_c4_26's and hr_c4_25's own
--    post-conditions all passed while the function was broken, because they grepped `prosrc` for
--    text that was present and correct. Text was never the problem; scope was. This file calls
--    `hr.wf_request` for real, on a target that reaches the pre-flight, and fails if the door raises
--    instead of returning an envelope. A migration that can only read itself cannot catch this class.
--
-- 3. AND THE GREP-ONLY ASSERTIONS ARE KEPT AS WELL — they still catch a lost guard, which is a
--    different failure from a broken one. Both, not either.
--
-- Authority: SPEC-WORKFLOW-ENGINE §4.2 (the refusal-envelope law), §2.2 RECORDED DECISION 5.
-- Applied live as `hr_c4_29_preflight_guard_scope_fix`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_29_conf_before', v_bad::text, true);
end $$;

do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_dec_old constant text := $o$  v_pf_action text; v_pf_step text;$o$;
  v_dec_new constant text := $o$  v_pf_action text; v_pf_step text; v_pf_any boolean;$o$;
  v_blk_old constant text := $o$   declare v_pf_any boolean;
   begin$o$;
  v_blk_new constant text := $o$   begin$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_request';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$declare v_pf_any boolean;$chk$ in v_def) = 0 then
    raise notice 'hr_c4_29: the pre-flight guard is already scope-clean';
  else
    if position(v_dec_old in v_def) = 0 or position(v_blk_old in v_def) = 0 then
      raise exception 'hr_c4_29: hr.wf_request does not carry hr_c4_25''s guard in the expected shape — refusing to half-apply';
    end if;
    v_new := replace(v_def, v_dec_old, v_dec_new);
    v_new := replace(v_new, v_blk_old, v_blk_new);
    execute v_new;
    raise notice 'hr_c4_29: v_pf_any hoisted into the function''s own DECLARE';
  end if;
end
$mig$;

-- ============================================================ post-conditions
do $$
declare v_src text; v_bad integer; v_before integer; v_env jsonb; v_org uuid; v_emp uuid;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_request';
  -- RD 1: the name moved, nothing else
  if v_src ~ 'declare v_pf_any boolean;' then
    raise exception 'hr_c4_29: v_pf_any is still declared inside the guarded block';
  end if;
  if v_src !~ 'v_pf_any boolean;' then
    raise exception 'hr_c4_29: v_pf_any is not declared at all';
  end if;
  -- RD 3: the guards themselves are all still present
  if v_src !~ 'WF_NO_POSSIBLE_APPROVER' then
    raise exception 'hr_c4_29: hr_c4_21''s pre-flight was lost';
  end if;
  if (select count(*) from regexp_matches(v_src, 'approval_subject_unmapped', 'g')) < 2 then
    raise exception 'hr_c4_29: a fail-closed guard was lost';
  end if;
  if v_src ~ 'v_looked' then
    raise exception 'hr_c4_29: hr_c4_28''s scope fix was reverted';
  end if;

  -- 🚨 RD 2: EXECUTE THE DOOR. Grep-only assertions passed twice while the function was broken.
  select ra.organization_id, ra.employment_id into v_org, v_emp
    from hr.role_assignment ra join hr.employment em on em.id = ra.employment_id
   where ra.role_key = 'hr_owner' and ra.is_active and em.deleted_at is null limit 1;
  if v_org is null then
    raise notice 'hr_c4_29: no org to smoke-test against; the proof suite covers it';
  else
    begin
      begin
        v_env := hr.wf_request('termination', 'hr_employment', v_emp, v_org);
      exception when others then
        raise exception 'hr_c4_29: the door RAISED instead of returning an envelope: %', sqlerrm;
      end;
      if v_env is null or not (v_env ? 'granted') then
        raise exception 'hr_c4_29: the door returned a malformed envelope: %', v_env;
      end if;
      raise notice 'hr_c4_29: door smoke-test OK (%)',
        coalesce(v_env ->> 'reason', v_env ->> 'state');
      raise exception 'hr_c4_29_smoke_rollback';
    exception when others then
      if sqlerrm <> 'hr_c4_29_smoke_rollback' then raise; end if;
    end;
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_29_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_29: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
end $$;
