-- lane: access-ladder T-11, step 1: "Shown to by default" — one knob per type, system ->
-- organization -> person — and the one list predicate every list asks.
--
-- Law: common-docs/policies/access-ladder.md ("Organization behavior is knobs and filters, not row
-- security"); words: common-docs/projects/access-ladder/terminology.md §3 (Shown to: Only me · My
-- team · Everyone · Everyone on AI Matrx; stored `shown_to`, NULL = follow the type knob).
--
--   * knob `access.shown_to_default/<token>` for every Organization and Public type. System
--     default: Everyone for work product (agents, notes, deals, workflows, documents, HR setup…),
--     Only me for a person's own practice, preferences and drafts (the types whose screens opened
--     on "mine" before — study sessions, notification preferences, working documents…), Everyone
--     on AI Matrx for Public types. Overridable by the organization and by the person.
--   * platform.entity_default_list_scope (the tab a list opens on) now reads that knob instead of
--     platform.entity_types.default_list_scope: Only me opens on "mine", anything else on the
--     organization. The registry column is no longer read by any list.
--   * platform.shown_to_lists(...) — THE predicate: does this row belong in this viewer's
--     organization list? Mine always; otherwise by the row's effective Shown to (its own
--     `shown_to`, else a legacy `visibility = 'personal'` read as Only me until T-13 renames the
--     column, else the knob): Only me -> no; My team -> the creator is one of the viewer's
--     teammates (iam.teammate_user_ids); Everyone / Everyone on AI Matrx -> yes.
--     A list resolves the knob and the teammates ONCE per query for the viewer's organizations
--     (platform.shown_to_context) and hands the jsonb to the predicate — never a knob read per row.
--
-- Row security is not touched here: Shown to hides, it never locks.
set local lock_timeout = '2s';
-- based-on: platform.entity_default_list_scope(text) 803505fd7494af1ca1b9fc43def64034e9865e7d2452729bfda16c63313cf62b

create type platform.shown_to as enum ('only_me', 'my_team', 'everyone', 'everyone_on_ai_matrx');
comment on type platform.shown_to is
  'Access ladder "Shown to": which lists show a record to people who can already open it. Never a '
  'lock. only_me = the creator''s lists only; my_team = the creator''s teammates '
  '(iam.teammate_user_ids); everyone = everyone in the organization; everyone_on_ai_matrx = also '
  'the platform-wide lists (Public types, or a record published to the web).';

-- ── 1. The knob rows ────────────────────────────────────────────────────────────────────────────
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
      when et.token in ('working_document') then 'only_me'
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

-- ── 2. Readers ──────────────────────────────────────────────────────────────────────────────────
-- The system rung only (no organization / person): what a type starts as on this platform.
create or replace function platform.shown_to_default_system(p_token text)
returns platform.shown_to
language sql
stable
set search_path to 'pg_catalog'
as $function$
  select (coalesce(k.value, k.default_value) #>> '{}')::platform.shown_to
    from platform.feature_knob k
   where k.feature = 'access.shown_to_default' and k.key = p_token;
$function$;

-- The resolved default for one organization and person. NULL for a type with no knob (Private,
-- Confidential and child types have no "Shown to").
create or replace function platform.shown_to_default(p_token text, p_organization_id uuid, p_user_id uuid default null)
returns platform.shown_to
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
begin
  if not exists (select 1 from platform.feature_knob k
                  where k.feature = 'access.shown_to_default' and k.key = p_token) then
    return null;
  end if;
  if p_organization_id is null then
    return platform.shown_to_default_system(p_token);
  end if;
  return (platform.knob_resolve('access.shown_to_default', p_token, p_organization_id,
                                coalesce(p_user_id, auth.uid()), null) #>> '{}')::platform.shown_to;
end;
$function$;

-- ONE read per list query: for each organization the viewer belongs to, the type's resolved
-- default and the viewer's teammates there. {"<org id>": {"d": "<shown_to>", "t": ["<uid>", …]}}
-- Security invoker: it reads only the caller's own memberships (under their row security), the
-- knob register (readable by everyone signed in) and the caller's own teammates.
create or replace function platform.shown_to_context(p_token text)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_uid uuid := auth.uid();
  v_out jsonb := '{}'::jsonb;
  r record;
begin
  if v_uid is null then
    return v_out;
  end if;
  for r in select om.organization_id from iam.organization_member om where om.user_id = v_uid loop
    v_out := v_out || jsonb_build_object(r.organization_id::text, jsonb_build_object(
      'd', platform.shown_to_default(p_token, r.organization_id, v_uid),
      't', to_jsonb(coalesce(iam.teammate_user_ids(v_uid, r.organization_id), array[v_uid]))));
  end loop;
  return v_out;
end;
$function$;

-- THE predicate. p_ctx comes from platform.shown_to_context for the same token and viewer.
create or replace function platform.shown_to_lists(
  p_shown_to platform.shown_to, p_visibility platform.visibility, p_created_by uuid,
  p_organization_id uuid, p_viewer uuid, p_ctx jsonb)
returns boolean
language sql
immutable
as $function$
  select p_created_by is not distinct from p_viewer
      or case coalesce(p_shown_to,
                       case when p_visibility = 'personal' then 'only_me'::platform.shown_to end,
                       (p_ctx -> p_organization_id::text ->> 'd')::platform.shown_to,
                       'everyone'::platform.shown_to)
           when 'only_me' then false
           when 'my_team' then coalesce((p_ctx -> p_organization_id::text -> 't') ? p_created_by::text, false)
           else true
         end;
$function$;

comment on function platform.shown_to_lists(platform.shown_to, platform.visibility, uuid, uuid, uuid, jsonb) is
  'Access ladder T-11: does this row belong in this viewer''s organization lists? The creator always '
  'sees their own; otherwise the effective Shown to decides (row shown_to, else legacy visibility '
  '''personal'' = only_me until T-13, else the type knob resolved in p_ctx). Lists only — never row '
  'security.';

-- The tab a list opens on: Only me -> "mine", anything else -> the organization.
create or replace function platform.entity_default_list_scope(p_token text)
 returns text
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'platform'
as $function$
  -- Access ladder T-11: the type's "Shown to by default" knob (system rung) decides where its list
  -- opens. A type with no knob (Private, Confidential, a child) opens on `mine`: the narrower
  -- screen is never wrong, only sometimes emptier, and the organization is one click away.
  select case platform.shown_to_default_system(p_token)
           when 'my_team' then 'orgs'
           when 'everyone' then 'orgs'
           when 'everyone_on_ai_matrx' then 'orgs'
           else 'mine' end;
$function$;

comment on column platform.entity_types.default_list_scope is
  'RETIRED from every list (access ladder T-11): the knob access.shown_to_default/<token> decides '
  'what a type''s lists show and where they open. Still written by the provisioner; its removal is '
  'tracked in the access-ladder register.';

grant execute on function platform.shown_to_context(text) to authenticated;
grant execute on function platform.shown_to_default(text, uuid, uuid) to authenticated;
grant execute on function platform.shown_to_default_system(text) to authenticated;
grant execute on function platform.shown_to_lists(platform.shown_to, platform.visibility, uuid, uuid, uuid, jsonb) to authenticated;
