-- iam_class_regeneration_dd137b4 — THE REGENERATION, AND THE PLATFORM-ADMIN LANE CLOSED (DD-137b,
-- steps 3 and 5).
--
-- Design: VISIBILITY-BY-CLASS §3.9 step 5 (regenerate, with a per-identity access delta over real
-- non-admin JWTs), §3.1 derivation two (a `private` or `confidential` token suppresses the
-- platform-admin lane), and the B-41a report §7 recommendation — which is the one standing read
-- that survived the emergency door: measured live 2026-09-12, a plain organization admin read 0 of
-- one person's private conversations, a plain member read 0, and a PLATFORM admin read 72.
--
-- 🚨 ARMAN'S RULE, AND IT IS THE POINT OF THIS FILE. §3.5: "`private` means: no standing read for
-- anyone, OUR OWN STAFF INCLUDED." Our staff go through the same audited door as everybody else.
-- The door exists (DD-137a) and is proven working, so closing the lane denies nobody anything they
-- cannot still reach — it makes them ask, in writing, with the subject told.
--
-- THE PREREQUISITE, REPORTED AND NOT BLOCKED ON (the brief's instruction). §3.1 says no shared
-- account may hold super_admin, because a door's audit answers WHO and a shared account cannot.
-- `admin.admins` still holds `admin@admin.com`, the shared login this workspace tells every agent
-- and every developer to use. That is a real gap and it is NOT closed here: it is a human decision
-- about named accounts. What this file does is close the lane, so `admin@admin.com` now uses the
-- door like anyone — and every use of it is one audit row, even if that row names a shared account.
--
-- ═══ THE WIDER-DIFF GATE WAS RUN FIRST, IN FULL, AND IT WENT GREEN ═══
-- Rehearsed on this database on 2026-09-12 in a rolled-back transaction — before snapshot, flip,
-- regenerate, after snapshot, gate, ROLLBACK — over 144 tokens x 6 principals (platform admin, an
-- organization admin who is not one, an organization owner, a plain member, a non-member, and
-- anonymous with no JWT), both snapshots pinned to one instant:
--
--     access_delta gate GREEN: 864 pairs, 0 wider, 125 narrower, 739 unchanged.
--
-- Two earlier rehearsal runs REFUSED, and both refusals were the harness being wrong rather than
-- the change being wrong; both are fixed in their own files and neither was waived
-- (dd137b2c: four bespoke tables have no `id` column and could not be measured at all;
--  dd137b2d: the two snapshots were sixty seconds apart on a live database, so rows born in between
--  read as a widening). A gate that is argued with instead of fixed is not a gate.
--
-- This file takes the BEFORE snapshot again for the record, does the work, and commits. The AFTER
-- snapshot and the gate assertion are DD-137b5, deliberately a separate transaction: taking a
-- sixty-second snapshot while holding ACCESS EXCLUSIVE on 134 live tables is the thing
-- `ddl_lock_timeout_guard` says out loud not to do — "commit per table — this bounds waiting, never
-- holding". The DDL here holds its locks for about four seconds.

do $$
declare
  v_before uuid; v_as timestamptz := now(); r record;
  v_principals uuid[] := array[
    '4cf62e4e-2679-484f-b652-034e697418df',  -- platform admin
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- organization admin, NOT a platform admin
    'c5e92166-e148-4e73-926e-83af0c453665',  -- organization owner
    'f0146c96-e02e-420b-a99f-92774da0566c',  -- plain member
    '71d10ace-7593-447e-af1b-9b628e8ac311',  -- a member of one org and nothing else
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array['access_request','agent_run','agent_surface_binding','ai_api','ai_endpoint','ai_offering','app_instance','app_setting','app_sync_status','assessment_result','assist','browser_authenticator_window','browser_profile','browser_profile_checkpoint','browser_stream_ticket','canvas_score','canvas_view','coding_session','commerce_cloud_sync_connection','commerce_intake_batch','commerce_label_batch','commerce_marketplace_account','commerce_product','contact_submission','context_item_suggestion','conversation','cx_agent_memory','cx_user_request','data_store','dataset','derive_run','dict_setting','dm_conversation','esign_provider','esign_signing_key','game_badge','game_result','heatmap_save','hindsight_enrollment','hr_ai_evidence','hr_alert_routing_rule','hr_asset','hr_auto_close_rule','hr_background_check','hr_candidate','hr_checklist_template','hr_corrective_action','hr_course','hr_crew','hr_deduction_code','hr_department','hr_earning_code','hr_emergency_contact','hr_employee','hr_employer_profile','hr_employment','hr_holiday_calendar','hr_i9','hr_interview_kit','hr_job_title','hr_leave_policy','hr_legal_hold','hr_location','hr_overtime_alert_rule','hr_pay_group','hr_recalculation_batch','hr_records_request','hr_reference_check','hr_requisition','hr_schedule','hr_schedule_guidance','hr_schedule_template','hr_separation','hr_survey','hr_verification_letter_request','hr_workflow_instance','iam_access_audit','iam_emergency_door_request','industry_curator','interview_session','invitation','invitation_request','item_mastery','kg_alert','kg_suggestion_ack','kg_sweep_queue','kg_sweep_run','kg_sweep_state','kg_value_match','league_membership','mandate_reference','mandate_scan','meet_call_invite','membership','ner_shadow','notification','notification_channel_preference','notification_preference','output_feedback','page_extraction_job','page_extraction_page_run','platform_actor_session','platform_actor_token','platform_saved_view','podcast_race','processed_document','quiz_session','sandbox_instance','scope_association_suggestion','scope_item_value_suggestion','scope_suggestion','sms_consent','sms_conversation','sms_notification','sms_notification_preference','sms_phone_number','structured_list','studio_recording_chunks','studio_run','study_attempt','study_goal','study_plan','study_plan_block','study_plan_day','study_reminder_context','study_reminder_delivery','study_session','system_personal_org_failure','udt_document','user_achievement','user_analysis_preference','user_bookmark','user_email_preference','user_feedback','user_form_profile','user_markdown_sample','user_memory','user_preference','user_stat','user_surface_state','wbx_guidance','workbook','workflow_comparison','working_document'];
  v_ok int := 0; v_refused int := 0; v_flipped int;
begin
  if (select count(*) from platform.entity_types where is_active and data_class in ('private','confidential')
        and rls_variant not in ('component','ledger') and not suppress_platform_admin_lane) = 0
     and (select count(*) from iam.access_delta_run where label = 'DD-137b4 BEFORE') > 0 then
    raise notice 'dd137b4: already applied — the lane is closed and the baseline is on record';
    return;
  end if;

  v_before := iam.access_delta_snapshot('DD-137b4 BEFORE', v_principals, v_tokens, 200000,
    'B-41b steps 3+5: the 23 unguarded tables and the platform-admin lane on the two private classes',
    v_as);
  raise notice 'dd137b4: before snapshot % pinned at %', v_before, v_as;

  -- §3.1 derivation two — THE FLIP AND THE REGENERATION ARE ONE ACT, PER TOKEN.
  --
  -- The flip must precede `iam.apply_rls` to take effect, and ten of these tokens CANNOT be
  -- generated at all (six are audit_class='machinery' — they own the inputs the access resolver
  -- consumes, and apply_rls forbids generic RLS on them; three have no `id` column; one has a type
  -- mismatch). Every one of those ten is one of F-7's eleven bespoke owner-only tokens, which is
  -- not a coincidence: they are bespoke precisely BECAUSE they do not have the canonical shape, and
  -- it is exactly why chair R3 says to classify them BEFORE anything regenerates.
  --
  -- So the flip and the regeneration share one sub-transaction. A token that cannot regenerate does
  -- NOT keep a declaration its policies do not honour: the flip rolls back with it, its
  -- hand-written policy is left alone, and `iam.verify_canonical`'s data_class_derivations check
  -- names it FAIL for as long as it stays that way. Dropping `platform_admin_all` from the access
  -- machinery by hand is the unilateral security surgery db-rules §6 forbids ("never add a new
  -- security layer on your own authority") — that is a decision for the machinery's own campaign,
  -- and this file leaves it loudly open rather than quietly done.
  v_flipped := 0;
  for r in select et.schema_name, et.table_name, et.token, et.rls_variant, et.data_class
             from platform.entity_types et where et.token = any(v_tokens) order by 1,2
  loop
    begin
      if r.data_class in ('private','confidential') then
        update platform.entity_types set suppress_platform_admin_lane = true
         where token = r.token and not suppress_platform_admin_lane;
        if found then v_flipped := v_flipped + 1; end if;
      end if;
      perform iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
      v_ok := v_ok + 1;
    exception when others then
      -- 🚨 NOT SWALLOWED, and the flip goes back with it.
      v_refused := v_refused + 1;
      raise notice 'dd137b4: % (%.%) cannot be generated and keeps its bespoke policy AND its open '
        'platform-admin lane — %', r.token, r.schema_name, r.table_name, sqlerrm;
    end;
  end loop;
  raise notice 'dd137b4: closed the platform-admin lane on % tokens', v_flipped;
  raise notice 'dd137b4: regenerated %, structurally refused % (all bespoke by design)', v_ok, v_refused;

  if v_ok < 120 then
    raise exception 'dd137b4: only % tokens regenerated — the rehearsal did 134 and a silent drop '
      'of fourteen tables is exactly the shape of an unnoticed omission', v_ok;
  end if;
end $$;

-- ═══ what must be true the moment this commits ═══
do $$
declare v_n integer; v_q text;
begin
  -- the lane is closed on every private and confidential token
  -- Every private/confidential token whose lane is still open must be one of the ten that cannot
  -- be generated. Eleven would mean one slipped through with a declaration nothing honours.
  select count(*) into v_n from platform.entity_types
   where is_active and data_class in ('private','confidential')
     and rls_variant not in ('component','ledger') and not suppress_platform_admin_lane;
  if v_n > 10 then
    raise exception 'dd137b4: % private/confidential tokens still declare an open platform-admin '
      'lane — at most the ten structurally ungeneratable bespoke tokens may', v_n;
  end if;
  raise notice 'dd137b4: RESIDUE — % private/confidential tokens keep an open platform-admin lane '
    'because iam.apply_rls structurally refuses them (access machinery / no id column). Named, not '
    'waived: iam.verify_canonical FAILs each of them on data_class_derivations.', v_n;

  -- and it is GONE from the policies, not merely declared gone
  select count(*) into v_n from platform.entity_types et
   join pg_policy pol on pol.polrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
  where et.is_active and et.data_class in ('private','confidential')
    and et.rls_variant not in ('component','ledger','personal')
    and et.suppress_platform_admin_lane
    and pol.polname = 'platform_admin_all';
  if v_n > 0 then
    raise exception 'dd137b4: % tables DECLARE the lane closed and still carry a platform_admin_all '
      'policy — a declaration nothing honours is worse than no declaration', v_n;
  end if;

  -- chat.conversation is the table the whole design is named after: owner yes, org role no,
  -- platform staff no, sharing INTACT.
  select pg_get_expr(pol.polqual, pol.polrelid) into v_q from pg_policy pol
   where pol.polrelid = 'chat.conversation'::regclass and pol.polname = 'std_select';
  if v_q like '%is_platform_admin%' or v_q like '%is_super_admin%' then
    raise exception 'dd137b4: chat.conversation still carries a platform-staff read arm';
  end if;
  if v_q like '%om.role = ANY%' then
    raise exception 'dd137b4: chat.conversation still carries an organization-role read arm';
  end if;
  if v_q not like '%created_by = ( SELECT auth.uid()%' then
    raise exception 'dd137b4: chat.conversation lost its OWNER arm';
  end if;
  if v_q not like '%iam.permissions p%' or v_q not like '%iam.has_access(''conversation''%' then
    raise exception 'dd137b4: chat.conversation lost its sharing lane — the class is a floor, not a wall';
  end if;

  -- and the emergency door still resolves it, so "no standing read" is not "no way in"
  if iam.emergency_door_class('conversation') <> 'private' then
    raise exception 'dd137b4: the emergency door no longer classifies conversation as private';
  end if;

  raise notice 'dd137b4: all assertions passed';
end $$;
