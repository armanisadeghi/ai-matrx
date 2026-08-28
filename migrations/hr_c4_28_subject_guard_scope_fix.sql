-- HR domain C4 — migration 28 (register item HRB-008 follow-up; repairs hr_c4_26).
--
-- 🚨 A SCOPE BUG I SHIPPED IN hr_c4_26, CAUGHT BY THE PROOF SUITE ONE MIGRATION LATER.
--
-- hr_c4_26 guarded the door's subject lookup like this:
--
--     declare v_looked uuid;
--     begin
--       v_looked := hr._approval_subject(v_tbl, p_target_id);
--     exception when others then  return <refusal>;  end;
--     v_subject := coalesce(v_looked, v_requester);      -- ← v_looked is OUT OF SCOPE here
--
-- In plpgsql a nested `declare … begin … end` block's variables die with the block, so the line
-- after it referenced a name that no longer existed:
--
--     UndefinedColumnError: column "v_looked" does not exist
--
-- It did not surface for two migrations because every path that reached it RETURNED first — the
-- unmapped targets refused inside the block, and nothing else got past. The moment hr_c4_27 mapped
-- `esign.envelope` and `hr.shift`, execution ran on to that line and hr.wf_request broke for
-- EVERY flow. The proof suite went from 159 assertions to 4 in one run, which is exactly what a
-- suite that drives the real doors is for.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. NO VARIABLE AT ALL. The coalesce moves INSIDE the guarded block and assigns `v_subject`
--    directly, so there is no name that can outlive its scope. Fewer moving parts than declaring
--    `v_looked` in the function's own DECLARE, and it keeps the whole subject decision in one place.
--
-- 2. THE SEMANTICS ARE UNCHANGED FROM hr_c4_26's INTENT: an explicit `p_subject_employment_id` wins
--    and never consults the allowlist; otherwise the allowlist is asked, a NULL answer falls back to
--    the requester (a subject-less target like an envelope or a requisition), and a RAISE becomes
--    the named `approval_subject_unmapped` refusal instead of an exception out of the RPC.
--
-- 3. THE LESSON, RECORDED: a guarded block whose result is read AFTER the block is a scope trap,
--    and an early-returning code path will hide it for as long as nothing gets past. The suite is
--    what catches this class — not review, and not the migration's own assertions, which all passed.
--
-- Authority: SPEC-WORKFLOW-ENGINE §2.2 RECORDED DECISION 5, §4.2 (the refusal-envelope law).
-- Applied live as `hr_c4_28_subject_guard_scope_fix`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_28_conf_before', v_bad::text, true);
end $$;

do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$    declare v_looked uuid;
    begin
      v_looked := hr._approval_subject(v_tbl, p_target_id);
    exception when others then$o$;
  v_rep constant text := $o$    begin
      -- assigned INSIDE the block: a nested declare's variables die with the block, so reading one
      -- after `end;` is a scope trap that only shows up once some path actually gets past it.
      v_subject := coalesce(hr._approval_subject(v_tbl, p_target_id), v_requester);
    exception when others then$o$;
  v_tail_old constant text := $o$    end;
    v_subject := coalesce(v_looked, v_requester);
  end if;$o$;
  v_tail_new constant text := $o$    end;
  end if;$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_request';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$v_looked$chk$ in v_def) = 0 then
    raise notice 'hr_c4_28: the subject guard is already scope-clean';
  else
    if position(v_old in v_def) = 0 or position(v_tail_old in v_def) = 0 then
      raise exception 'hr_c4_28: hr.wf_request does not carry hr_c4_26''s guard in the expected shape — refusing to half-apply';
    end if;
    execute replace(replace(v_def, v_old, v_rep), v_tail_old, v_tail_new);
    raise notice 'hr_c4_28: hr.wf_request''s subject guard no longer reads a variable past its scope';
  end if;
end
$mig$;

-- ============================================================ post-conditions
do $$
declare v_src text; v_bad integer; v_before integer;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_request';
  if v_src ~ 'v_looked' then
    raise exception 'hr_c4_28: hr.wf_request still references the out-of-scope variable';
  end if;
  -- RD 2: the three behaviours hr_c4_26 intended are all still expressed
  if v_src !~ 'if p_subject_employment_id is not null then' then
    raise exception 'hr_c4_28: an explicit subject is no longer honoured first';
  end if;
  if v_src !~ 'coalesce\(hr\._approval_subject\(v_tbl, p_target_id\), v_requester\)' then
    raise exception 'hr_c4_28: the subject-less fallback to the requester was lost';
  end if;
  if (select count(*) from regexp_matches(v_src, 'approval_subject_unmapped', 'g')) < 2 then
    raise exception 'hr_c4_28: a fail-closed guard was lost';
  end if;

  -- 🚨 AND IT ACTUALLY RUNS. The migration's own assertions all passed last time and the function
  -- was still broken, so this one EXECUTES the door rather than reading it.
  declare v_env jsonb; v_org uuid; v_lr uuid; v_emp uuid;
  begin
    select ra.organization_id, ra.employment_id into v_org, v_emp
      from hr.role_assignment ra join hr.employment em on em.id = ra.employment_id
     where ra.role_key = 'hr_owner' and ra.is_active and em.deleted_at is null limit 1;
    if v_org is null then
      raise notice 'hr_c4_28: no org to smoke-test against; the proof suite covers it';
    else
      -- a target that maps (hr.employment) — the path that was broken
      v_env := hr.wf_request('termination', 'hr_employment', v_emp, v_org);
      if v_env is null then
        raise exception 'hr_c4_28: hr.wf_request returned nothing';
      end if;
      if coalesce(v_env ->> 'reason', '') = 'definition_invalid'
         and (v_env ->> 'detail') like '%v_looked%' then
        raise exception 'hr_c4_28: hr.wf_request still breaks on the scope bug: %', v_env ->> 'detail';
      end if;
      raise notice 'hr_c4_28: door smoke-test returned a well-formed envelope (%)',
        coalesce(v_env ->> 'reason', v_env ->> 'state');
      raise exception 'hr_c4_28_smoke_rollback';
    end if;
  exception when others then
    if sqlerrm not in ('hr_c4_28_smoke_rollback') and sqlerrm not like 'hr_c4_28:%' then
      raise exception 'hr_c4_28: the door raised instead of returning an envelope: %', sqlerrm;
    end if;
    if sqlerrm like 'hr_c4_28:%' then raise; end if;
  end;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_28_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_28: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
end $$;
