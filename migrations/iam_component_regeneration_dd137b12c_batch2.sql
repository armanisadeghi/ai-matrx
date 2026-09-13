-- iam_component_regeneration_dd137b12c_batch2 — REGENERATION BATCH 2 OF 4 (DD-137b, fix round 1).
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
  v_tokens text[] := array['commerce_product_media','commerce_product_variant','commerce_recall_audit','contact_submission','content_ir_kind_component','content_ir_kind_component_incident','content_ir_kind_conformance','content_ir_kind_edge','content_ir_kind_example','content_ir_kind_surface','context_item_suggestion','context_item_value','conversation','conversation_value','cx_agent_memory','cx_agent_plan','cx_agent_task','cx_code_edit','cx_code_message_file','cx_media','cx_observational_memory','cx_observational_memory_event','cx_pending_injection','cx_request','cx_request_snapshot','cx_tool_trace','cx_user_request','cx_user_todo','data_store','dataset','derive_run','dict_setting','dm_conversation','dm_message','dm_participant','esign_envelope_event','esign_provider','esign_signing_key','game_badge','game_result','heatmap_save','hindsight_enrollment','hindsight_finding','hindsight_replay','hindsight_review','hr_access_audit','hr_accommodation_request','hr_ai_evidence','hr_alert_routing_rule','hr_application','hr_approval_authority','hr_approval_delegation','hr_asset','hr_asset_assignment','hr_attendance_exception','hr_auto_close_rule','hr_availability','hr_background_check','hr_benefits_event','hr_calculation_snapshot','hr_candidate','hr_candidate_conversion','hr_candidate_message','hr_checklist_item','hr_checklist_run','hr_checklist_template','hr_checklist_template_item','hr_compensation','hr_corrective_action','hr_course','hr_course_version','hr_credential','hr_crew','hr_deduction_code','hr_department','hr_derived_grant','hr_disposition_event','hr_earning_code','hr_eeo_response','hr_emergency_contact'];
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
        raise notice 'dd137b12c: % (%.%) keeps its bespoke policy — %',
          r.token, r.schema_name, r.table_name, sqlerrm;
      else
        raise exception 'dd137b12c: % (%.%) failed with %: %. That is not a structural refusal, '
          'so this batch refuses to commit partially. A 55P03 or 40P01 here is a lost race — re-run '
          'this file; it is idempotent.', r.token, r.schema_name, r.table_name, sqlstate, sqlerrm;
      end if;
    end;
  end loop;
  raise notice 'dd137b12c: batch 2/4 — regenerated %, structurally refused %', v_ok, v_refused;
  if v_ok + v_refused < 80 then
    raise exception 'dd137b12c: only % of 80 tokens were reached — a silent drop is exactly '
      'the shape of the omission this file exists to prevent', v_ok + v_refused;
  end if;
end $$;
