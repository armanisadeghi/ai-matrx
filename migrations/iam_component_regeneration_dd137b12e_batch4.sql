-- iam_component_regeneration_dd137b12e_batch4 — REGENERATION BATCH 4 OF 4 (DD-137b, fix round 1).
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
  v_tokens text[] := array['industry_curator','interview_document_revision','interview_hole','interview_question','interview_session','interview_turn','invitation','invitation_request','item_mastery','kg_alert','kg_suggestion_ack','kg_sweep_queue','kg_sweep_run','kg_sweep_state','kg_value_match','league_membership','meet_call_invite','membership','message','ner_shadow','notification','notification_channel_preference','notification_preference','output_feedback','page_extraction_job','page_extraction_page_run','pc_studio_run_asset','platform_actor_session','platform_actor_token','platform_continued_access','platform_saved_view','podcast_race','processed_document','processed_document_page','quiz_session','sandbox_instance','scope_association_suggestion','scope_item_value_suggestion','scope_suggestion','sms_consent','sms_conversation','sms_message','sms_message_media','sms_notification','sms_notification_preference','sms_phone_number','structured_list','studio_recording_chunks','studio_run','study_attempt','study_goal','study_plan','study_plan_block','study_plan_day','study_reminder_context','study_reminder_delivery','study_session','system_personal_org_failure','tool_call','udt_dataset_fields','udt_dataset_rows','udt_document','udt_structured_list_items','user_achievement','user_analysis_preference','user_bookmark','user_email_preference','user_feedback','user_form_profile','user_markdown_sample','user_memory','user_preference','user_stat','user_surface_state','wbx_guidance','wc_impairment_definition','workbook','workflow_card','workflow_comparison','working_document'];
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
        raise notice 'dd137b12e: % (%.%) keeps its bespoke policy — %',
          r.token, r.schema_name, r.table_name, sqlerrm;
      else
        raise exception 'dd137b12e: % (%.%) failed with %: %. That is not a structural refusal, '
          'so this batch refuses to commit partially. A 55P03 or 40P01 here is a lost race — re-run '
          'this file; it is idempotent.', r.token, r.schema_name, r.table_name, sqlstate, sqlerrm;
      end if;
    end;
  end loop;
  raise notice 'dd137b12e: batch 4/4 — regenerated %, structurally refused %', v_ok, v_refused;
  if v_ok + v_refused < 80 then
    raise exception 'dd137b12e: only % of 80 tokens were reached — a silent drop is exactly '
      'the shape of the omission this file exists to prevent', v_ok + v_refused;
  end if;
end $$;
