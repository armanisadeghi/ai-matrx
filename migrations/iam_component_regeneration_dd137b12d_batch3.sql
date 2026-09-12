-- iam_component_regeneration_dd137b12d_batch3 — REGENERATION BATCH 3 OF 4 (DD-137b, fix round 1).
--
-- Chair ruling 2026-09-12: four batches with per-batch commits, because one 310-table transaction
-- holds ACCESS EXCLUSIVE on every table until it commits and lost to a lock storm and then a
-- deadlock against live traffic. `ddl_lock_timeout_guard` gives this advice on every single run:
-- "commit per table — this bounds waiting, never holding."
--
-- This batch regenerates 80 tokens, in a fixed order (schema, table) so two runs of this file
-- take their locks in the same sequence. The BEFORE snapshot for all four lives in
-- `iam_component_regeneration_dd137b12a_baseline.sql`; the gate over the end state is
-- `iam_component_regeneration_dd137b13_gate.sql`.
--
-- 🚨 THE TWO VAULT TOKENS ARE NOT HERE, BY NAME. DD-137b11 registered `credential_item` and
-- `user_secret` so the class regime and iam.verify_canonical can SEE them — explicitly not so the
-- generator can rewrite them. `apply_table_grants` proved why on the first attempt that included
-- them: "users.user_secrets runs an UNDECLARED column-level grant design for `authenticated` (23 of
-- 24 columns granted; EXCLUDED: value_encrypted) — refusing to issue table-level grants, which
-- would silently REOPEN those columns." They are measured by the baseline and never regenerated.
-- (The vault's own repair is lane B-46 under the chair's DD-160 ruling; nothing here duplicates it.)
--
-- 🚨 A LOCK FAILURE IS NOT A STRUCTURAL REFUSAL. Only a closed set of causes is tolerated — each one
-- a token `iam.apply_rls` cannot generate BY CONSTRUCTION — and everything else aborts this batch
-- naming the table, because a regeneration that silently skips tables is the defect this whole fix
-- round exists to close.
set local lock_timeout = '30s';

do $$
declare
  r record; v_ok int := 0; v_refused int := 0;
  v_tokens text[] := array['hr_employee','hr_employee_private','hr_employer_profile','hr_employment','hr_employment_pin','hr_engagement','hr_establishment','hr_external_identity','hr_holiday','hr_holiday_calendar','hr_i9','hr_i9_document','hr_incident','hr_incident_party','hr_interview','hr_interview_kit','hr_job_title','hr_kiosk_device','hr_kiosk_session','hr_labor_target','hr_leave_case','hr_leave_enrollment','hr_leave_ledger','hr_leave_policy','hr_leave_request','hr_legal_hold','hr_legal_hold_item','hr_location','hr_new_hire_report','hr_offer','hr_opening','hr_overtime_alert','hr_overtime_alert_rule','hr_overtime_preapproval','hr_pay_group','hr_pay_period','hr_pay_period_employment','hr_payroll_export','hr_payroll_export_line','hr_position_assignment','hr_provisioning_result','hr_punch','hr_recalculation_batch','hr_records_request','hr_reference_check','hr_reporting_line','hr_requisition','hr_restricted_note','hr_role_assignment','hr_schedule','hr_schedule_change','hr_schedule_guidance','hr_schedule_template','hr_schedule_template_shift','hr_scorecard','hr_separation','hr_shift','hr_shift_claim','hr_staffing_requirement','hr_survey','hr_survey_invitation','hr_survey_question','hr_survey_response','hr_tax_registration','hr_tax_withholding','hr_time_adjustment','hr_training_assignment','hr_training_attempt','hr_transcript_entry','hr_verification_letter_request','hr_work_interval','hr_workflow_binding','hr_workflow_decision','hr_workflow_event','hr_workflow_failure','hr_workflow_instance','hr_workflow_step','hr_workweek','iam_access_audit','iam_emergency_door_request'];
begin
  for r in select et.schema_name, et.table_name, et.token, et.rls_variant
             from platform.entity_types et
            where et.token = any(v_tokens) and et.is_active
              and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
            order by et.schema_name, et.table_name
  loop
    begin
      perform iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
      v_ok := v_ok + 1;
    exception when others then
      --   P0001 'access machinery'                 — owns the access resolver's inputs
      --   42703 column "id" does not exist          — three bespoke tables with no id
      --   42883 operator does not exist             — extend.wbx_guidance's type mismatch
      --   P0001 'not an active registered entity'   — a token deactivated mid-run
      --   P0001 'has no composition parent'         — the three parentless components (db-rules §6d-1)
      if sqlstate in ('P0001','42703','42883')
         and (sqlerrm like '%access machinery%'
              or sqlerrm like '%column "id" does not exist%'
              or sqlerrm like '%operator does not exist%'
              or sqlerrm like '%not an active registered entity%'
              or sqlerrm like '%has no composition parent%') then
        v_refused := v_refused + 1;
        raise notice 'dd137b12d: % (%.%) keeps its bespoke policy — %',
          r.token, r.schema_name, r.table_name, sqlerrm;
      else
        raise exception 'dd137b12d: % (%.%) failed with %: %. That is not a structural refusal, '
          'so this batch refuses to commit partially. A 55P03 or 40P01 here is a lost race — re-run '
          'this file; it is idempotent.', r.token, r.schema_name, r.table_name, sqlstate, sqlerrm;
      end if;
    end;
  end loop;
  raise notice 'dd137b12d: batch 3/4 — regenerated %, structurally refused %', v_ok, v_refused;
  if v_ok + v_refused < 80 then
    raise exception 'dd137b12d: only % of 80 tokens were reached — a silent drop is exactly '
      'the shape of the omission this file exists to prevent', v_ok + v_refused;
  end if;
end $$;
