-- HR domain C4 — migration 17 (register item HRB-008 follow-up, lane workflow-engine; round-5 T1).
--
-- 🚨 A DEFECT I SHIPPED IN hr_c4_15, CAUGHT BY THE PROOF SUITE AND FIXED AT ONCE.
--
-- hr_c4_15 registered `unactionable_no_reach` in `platform.categories` — §1.8's vocabulary, which
-- says these classes are category rows *"never enums"* — and taught `hr.wf_activate_step` to raise
-- it. But `hr.workflow_failure` also carries a **hardcoded** CHECK:
--
--     CHECK (failure_class = ANY (ARRAY['unroutable','approver_ineligible','validation_error',
--       'conflict_at_decision','apply_failed','result_unverified','notification_undeliverable',
--       'target_missing','definition_invalid']))
--
-- so the new class was registered and rejected at the same time. **This was live**: any step that
-- activated with candidates but no reachable approver would have raised
-- `workflow_failure_class_registered` out of `hr.wf_activate_step` — turning a routing observation
-- into an exception that aborts the caller. hr_c4_15's own post-conditions checked that the
-- category row existed and never checked that a row of that class could actually be WRITTEN, which
-- is the assertion that would have caught it. It is added below.
--
-- The `hr.wf_resolve_failure` and `hr._wf_not_attested` halves of hr_c4_15 were unaffected and are
-- proven working on the real G2V timecard; only the raise path was broken.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE CHECK IS EXTENDED, NOT REPLACED BY A TRIGGER. §1.8 wants the vocabulary in
--    `platform.categories`, and it IS — the class row carries the label, the default assignee,
--    `retryable` and the legal `resolutions`, and `hr.wf_resolve_failure` reads its behaviour from
--    there. The CHECK is a cheap structural backstop against a typo'd class, and a CHECK cannot
--    subquery. Converting it to a trigger to chase the last of the duplication would add a
--    per-row function call on a hot write path to fix nothing that is actually broken. The nine
--    names stay in the array and gain a tenth.
--
-- 2. THE ASSERTION IS A REAL INSERT, ROLLED BACK. Checking that the constraint's TEXT mentions the
--    class would pass on a constraint that was never re-created. This writes an actual
--    `hr.workflow_failure` row of the new class inside a block that always raises, so the check is
--    the database accepting it, not a string match.
--
-- Authority: SPEC-WORKFLOW-ENGINE §1.8 (the failure-class vocabulary and its nine v1 members).
-- Applied live as `hr_c4_17_failure_class_check_admits_the_new_class`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '30s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  perform set_config('matrx.hr_c4_17_cert_bad_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the CHECK gains the tenth class
do $$
declare v_con text;
begin
  if exists (select 1 from pg_constraint c
              join pg_class t on t.oid = c.conrelid
              join pg_namespace n on n.oid = t.relnamespace
             where n.nspname = 'hr' and t.relname = 'workflow_failure' and c.contype = 'c'
               and pg_get_constraintdef(c.oid) like '%unactionable_no_reach%') then
    raise notice 'hr_c4_17: hr.workflow_failure already admits unactionable_no_reach';
    return;
  end if;
  select c.conname into v_con from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'hr' and t.relname = 'workflow_failure' and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%failure_class = ANY%';
  if v_con is null then
    raise exception 'hr_c4_17: cannot find the failure_class CHECK on hr.workflow_failure';
  end if;
  execute format('alter table hr.workflow_failure drop constraint %I', v_con);
  execute format($f$alter table hr.workflow_failure add constraint %I check (failure_class = any (array[
      'unroutable','approver_ineligible','validation_error','conflict_at_decision','apply_failed',
      'result_unverified','notification_undeliverable','target_missing','definition_invalid',
      'unactionable_no_reach']))$f$, v_con);
  raise notice 'hr_c4_17: hr.workflow_failure.failure_class now admits unactionable_no_reach';
end $$;

-- ============================================================ 2. post-conditions
do $$
declare
  v_bad integer; v_bad_before integer; v_inst uuid; v_org uuid; v_ok boolean := false;
begin
  -- RD 2: the check is that the DATABASE accepts a row of the new class, not that a string matches.
  select i.id, i.organization_id into v_inst, v_org from hr.workflow_instance i limit 1;
  if v_inst is null then
    raise notice 'hr_c4_17: no workflow instance exists to probe against; the proof suite covers it';
    v_ok := true;
  else
    begin
      perform hr.arm_write();
      insert into hr.workflow_failure (organization_id, workflow_instance_id, failure_class, state,
                                       detail)
      values (v_org, v_inst, 'unactionable_no_reach', 'open',
              jsonb_build_object('probe', 'hr_c4_17 install-time assertion'));
      v_ok := true;
      raise exception 'hr_c4_17_probe_rollback';
    exception
      when sqlstate '23514' then
        raise exception 'hr_c4_17: hr.workflow_failure still refuses the unactionable_no_reach class';
      when others then
        if sqlerrm <> 'hr_c4_17_probe_rollback' then raise; end if;
    end;
  end if;
  if not v_ok then
    raise exception 'hr_c4_17: the insert probe never completed';
  end if;

  -- the vocabulary row and the CHECK agree: every registered class is writable
  select count(*) into v_bad
    from platform.categories c
   where c.dimension = 'hr_workflow_failure_class' and c.deleted_at is null
     and not exists (
       select 1 from pg_constraint k
         join pg_class t on t.oid = k.conrelid
         join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'hr' and t.relname = 'workflow_failure' and k.contype = 'c'
          and pg_get_constraintdef(k.oid) like '%''' || c.slug || '''%');
  if v_bad > 0 then
    raise exception 'hr_c4_17: % registered failure class(es) are still refused by the CHECK', v_bad;
  end if;

  -- hr_c4_15/16 still in force
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_activate_step') !~ 'unactionable_no_reach' then
    raise exception 'hr_c4_17: hr_c4_15''s unactionable raise was lost';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_escalate') !~ 'WF_SELF_STEP_NOT_ESCALATABLE' then
    raise exception 'hr_c4_17: hr_c4_16''s self-step escalation guard was lost';
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn';
  if v_bad > 0 then
    raise exception 'hr_c4_17: % hr CONFORMANCE finding(s) — the CHECK rewrite disturbed a table property', v_bad;
  end if;
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  v_bad_before := current_setting('matrx.hr_c4_17_cert_bad_before')::integer;
  if v_bad > v_bad_before then
    raise exception 'hr_c4_17: hr certification failures increased from % to %', v_bad_before, v_bad;
  end if;
end $$;
