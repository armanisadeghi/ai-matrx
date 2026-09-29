-- lane: access-ladder T-35e — a type's level change seeds its "Shown to by default" knob, with a guard.
--
-- T-11f seeded access.shown_to_default/<token> once; 68 types moved to Organization/Public later got
-- none (T-35b seeded them). This closes the door: ONE seeding function carrying T-11f's rule, called by
-- an AFTER trigger on platform.entity_types whenever a type is registered or its level, component flag
-- or active flag changes, so every path (provisioner, approval functions, a plain registry update)
-- seeds it. platform.shown_to_knob_missing() is the guard: it names every Organization/Public type
-- without its knob and must answer nothing. Inserts only; an existing knob or override is never touched.
set local lock_timeout = '2s';

create or replace function platform.seed_shown_to_default_knob(p_token text)
returns void
language plpgsql volatile security definer
set search_path to 'pg_catalog'
as $fn$
begin
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
   where et.token = p_token and et.is_active
     and not coalesce(et.is_component, false)
     and et.data_class in ('organization', 'public')
  on conflict (feature, key) do nothing;
end $fn$;


insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values
  ('platform', 'seed_shown_to_default_knob', 'p_token text', array['text'::regtype]::oid[],
   'p_token is a registry token; the function makes no access decision, it inserts the type''s system-rung Shown to by default knob when missing. A null or unknown token inserts nothing.',
   'access_ladder_t35e', 'server_only: called by the platform.entity_types level-change trigger and by migrations; no client ever seeds a platform knob.', false, false);

comment on function platform.seed_shown_to_default_knob(text) is
  'Seeds access.shown_to_default/<token> for an active, non-component Organization or Public type (access ladder T-11f rule). Insert-only.';

create or replace function platform._entity_type_seeds_shown_to_knob()
returns trigger
language plpgsql security definer
set search_path to 'pg_catalog'
as $fn$
begin
  if new.is_active and not coalesce(new.is_component, false)
     and new.data_class in ('organization', 'public') then
    perform platform.seed_shown_to_default_knob(new.token);
  end if;
  return null;
end $fn$;

create trigger entity_type_seeds_shown_to_knob
  after insert or update of data_class, is_component, is_active on platform.entity_types
  for each row execute function platform._entity_type_seeds_shown_to_knob();

create or replace function platform.shown_to_knob_missing()
returns table (token text, data_class text)
language sql stable security definer
set search_path to 'pg_catalog'
as $fn$
  select et.token, et.data_class::text from platform.entity_types et
   where et.is_active and not coalesce(et.is_component, false) and et.data_class in ('organization', 'public')
     and not exists (select 1 from platform.feature_knob k where k.feature = 'access.shown_to_default' and k.key = et.token)
   order by 1;
$fn$;


insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values
  ('platform', 'shown_to_knob_missing', '', '{}'::oid[],
   'No arguments; reads the registry and the knob table and names every Organization/Public type without its knob. No access decision.',
   'access_ladder_t35e', 'server_only: a guard read by migrations, checks and the owner session; nothing client-side calls it.', false, false);

comment on function platform.shown_to_knob_missing() is
  'Guard (access ladder T-35e): every active non-component Organization/Public type has its Shown to by default knob. Must return no rows.';

do $post$
begin
  if exists (select 1 from platform.shown_to_knob_missing()) then
    raise exception 't35e: types without a Shown to by default knob: %', (select string_agg(token, ', ') from platform.shown_to_knob_missing());
  end if;
end $post$;
