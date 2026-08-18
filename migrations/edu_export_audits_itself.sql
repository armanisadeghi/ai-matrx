-- edu_export_audits_itself.sql
--
-- RECORD of a change already applied live to Supabase (txzxabzwovsujtloxrus) on
-- 2026-08-17 via the Supabase MCP. Idempotent (CREATE OR REPLACE).
--
-- WP9 — an export must audit ITSELF, not rely on the client to confess.
--
-- Found by the end-to-end data-rights verification (not by reading the code):
-- `edu_export_study_data()` hands back the learner's ENTIRE study archive and
-- wrote no audit row. The ledger entry came from a SEPARATE RPC
-- (`edu_log_data_export`) that the frontend calls afterwards as a courtesy. So a
-- direct API caller exported everything unaudited, and a failed second call left
-- an export unrecorded with nothing screaming.
--
-- SCHOOL_SAFE_CHECKLIST claims "Data-rights auditability: education.
-- data_rights_event ledger (export/delete/restore per user)". For export that was
-- true only by client courtesy. It is now true by construction — the same shape
-- delete and restore already had.
--
-- The archive query is unchanged; only the audit insert is added (the function
-- was already VOLATILE, so it could always have written). `edu_log_data_export`
-- stays for older clients but ignores a duplicate within 30 seconds.

CREATE OR REPLACE FUNCTION public.edu_export_study_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'education', 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_archive jsonb;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select jsonb_build_object(
    '__format', 'matrx.education.study_export',
    'version', 1,
    'exported_at', now(),
    'user_id', v_uid,
    'spine', jsonb_build_object(
      'study_sessions',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_session   t where t.created_by = v_uid and t.deleted_at is null),
      'study_attempts',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_attempt   t where t.created_by = v_uid and t.deleted_at is null),
      'item_mastery',      (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.item_mastery    t where t.created_by = v_uid and t.deleted_at is null),
      'study_goals',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_goal      t where t.created_by = v_uid and t.deleted_at is null),
      'study_streak',      (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_streak    t where t.user_id    = v_uid),
      'study_plans',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_plan      t where t.created_by = v_uid and t.deleted_at is null),
      'study_plan_days',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_plan_day  t where t.created_by = v_uid and t.deleted_at is null),
      'study_plan_blocks', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_plan_block t where t.created_by = v_uid and t.deleted_at is null),
      'study_media',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_media     t where t.created_by = v_uid and t.deleted_at is null),
      'assessments',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.assessment      t where t.created_by = v_uid and t.deleted_at is null),
      'assessment_items',  (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.assessment_item t where t.created_by = v_uid and t.deleted_at is null),
      'assessment_results',(select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.assessment_result t where t.created_by = v_uid and t.deleted_at is null),
      'fc_sets',           (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.fc_set          t where t.created_by = v_uid and t.deleted_at is null),
      'fc_cards',          (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.fc_card         t where t.created_by = v_uid and t.deleted_at is null),
      'fc_details',        (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.fc_detail       t where t.created_by = v_uid and t.deleted_at is null),
      'learn_docs',        (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.learn_doc       t where t.created_by = v_uid and t.deleted_at is null),
      'quiz_sessions',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.quiz_sessions   t where t.created_by = v_uid and t.deleted_at is null)
    )
  ) into v_archive;

  insert into education.data_rights_event (user_id, action, detail)
  values (v_uid, 'export', jsonb_build_object('via', 'edu_export_study_data'));

  return v_archive;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.edu_log_data_export()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'education', 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  -- edu_export_study_data now audits itself; this call is a legacy no-op when
  -- the export it belongs to was just recorded.
  if exists (
    select 1 from education.data_rights_event
    where user_id = v_uid and action = 'export'
      and created_at > now() - interval '30 seconds'
  ) then
    return;
  end if;
  insert into education.data_rights_event (user_id, action, detail)
  values (v_uid, 'export', jsonb_build_object('via', 'edu_log_data_export'));
end;
$function$
;

revoke execute on function public.edu_export_study_data() from public, anon;
grant  execute on function public.edu_export_study_data() to authenticated, service_role;
revoke execute on function public.edu_log_data_export() from public, anon;
grant  execute on function public.edu_log_data_export() to authenticated, service_role;
