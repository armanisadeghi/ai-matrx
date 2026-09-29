-- lane: access-ladder T-35b — every Organization/Public type has its "Shown to by default" knob; usage ledger opens on Only me.
--
-- Access ladder T-11f seeded access.shown_to_default/<token> for every Organization and Public type
-- that existed on 2026-09-27. Types moved to Organization or Public afterwards (T-21, T-31, T-33 level
-- moves) got no knob row, so platform.shown_to_default answers NULL for them and their lists fall back
-- to the registry's list scope: 68 types, billing.usage_ledger among them. This seeds the missing rows
-- with T-11f's own rule, unchanged, and names billing_usage_ledger explicitly: a person's own usage
-- opens on Only me (it stays Organization — a coworker who opens it still can; the knob hides, never locks).
-- Only inserts; an existing knob row or override is never touched.
set local lock_timeout = '2s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label, description, set_by,
   basis, review_due, overridable_by, override_direction)
select 'access.shown_to_default', et.token,
       to_jsonb(d.v), to_jsonb(d.v), 'enum',
       case when et.data_class = 'public'
            then '["only_me","my_team","everyone","everyone_on_ai_matrx"]'::jsonb
            else '["only_me","my_team","everyone"]'::jsonb end,
       'Shown to by default: ' || coalesce(nullif(et.label, ''), et.token),
       'Which lists show a new ' || lower(coalesce(nullif(et.label, ''), et.token)) || ' (and every one '
         || 'whose creator made no choice): Only me, My team, Everyone in the organization'
         || case when et.data_class = 'public' then ', or Everyone on AI Matrx' else '' end
         || '. It hides from lists; it never stops anyone who can open the record from opening it.',
       'agent',
       case d.v
         when 'everyone_on_ai_matrx' then 'Access ladder T-11: a Public type is made to be seen; its records appear in the platform-wide lists unless the creator hides them.'
         when 'only_me' then 'Access ladder T-11: this type''s screen opened on "mine" (entity_types.default_list_scope) — a person''s own practice, preferences, drafts or bookkeeping — so it starts hidden from coworkers'' lists.'
         else 'Access ladder T-11: work done in a company account is the organization''s by default (law: every table starts at Organization); lists show it to everyone unless the creator hides it.'
       end,
       date '2026-11-27', '{organization,user}', 'any'
  from platform.entity_types et
  cross join lateral (select case
      when et.data_class = 'public' then 'everyone_on_ai_matrx'
      when et.token in ('working_document', 'billing_usage_ledger') then 'only_me'
      when et.default_list_scope = 'mine' and et.token not in (
        -- work product whose screen merely opened on "mine": the organization's by default
        'document', 'dataset', 'udt_document', 'workbook', 'structured_list', 'spatial_board',
        'google_document', 'processed_document', 'page_extraction_job', 'derive_run', 'data_store',
        'assessment', 'fc_set', 'web_youtube_video', 'podcast_race', 'workflow_comparison',
        'interview_decision_interview', 'interview_session',
        'commerce_cloud_sync_connection', 'commerce_intake_batch', 'commerce_label_batch',
        'commerce_marketplace_account', 'commerce_product',
        'hr_alert_routing_rule', 'hr_asset', 'hr_auto_close_rule', 'hr_checklist_template',
        'hr_course', 'hr_crew', 'hr_deduction_code', 'hr_department', 'hr_earning_code',
        'hr_employee', 'hr_employer_profile', 'hr_holiday_calendar', 'hr_interview_kit',
        'hr_job_title', 'hr_kiosk_device', 'hr_leave_policy', 'hr_location',
        'hr_overtime_alert_rule', 'hr_pay_group', 'hr_requisition', 'hr_schedule',
        'hr_schedule_guidance', 'hr_schedule_template', 'hr_survey')
        then 'only_me'
      else 'everyone' end as v) d
 where et.is_active
   and not coalesce(et.is_component, false)
   and et.data_class in ('organization', 'public')
on conflict (feature, key) do nothing;

do $post$
declare v_missing int;
begin
  select count(*) into v_missing from platform.entity_types et
   where et.is_active and not coalesce(et.is_component, false) and et.data_class in ('organization', 'public')
     and not exists (select 1 from platform.feature_knob k where k.feature = 'access.shown_to_default' and k.key = et.token);
  if v_missing <> 0 then raise exception 't35b: % Organization/Public types still have no Shown to by default knob', v_missing; end if;
  if platform.shown_to_default_system('billing_usage_ledger') is distinct from 'only_me'::platform.shown_to then
    raise exception 't35b: billing_usage_ledger does not default to only_me (reads %)', platform.shown_to_default_system('billing_usage_ledger');
  end if;
end $post$;
