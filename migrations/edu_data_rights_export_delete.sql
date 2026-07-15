-- edu_data_rights_export_delete.sql
--
-- School-safe compliance (FERPA / COPPA data rights). A student can EXPORT their
-- entire study spine and DELETE it — a real, gated, auditable, reversible-window
-- delete. Reuses the existing per-deck export (`features/education/onboard/export`)
-- for decks; this adds the SERVER-side full-spine archive + the account-scoped
-- delete/restore the client per-deck exporter can't do.
--
--   • edu_export_study_data()  → jsonb archive of every study row the caller owns
--     (sessions, attempts, mastery, goals, plans, media, assessments, decks,
--      learn docs, quizzes) — the "download everything we store" right.
--   • edu_delete_study_data()  → SOFT-deletes the whole spine (deleted_at = now()),
--     records a loud audit event, returns per-table counts + a restore window.
--   • edu_restore_study_data() → within the window, un-deletes exactly the rows
--     the last delete event soft-deleted (matched on the delete timestamp).
--
-- Hard PURGE happens after the reversible window via a server cron (documented in
-- SCHOOL_SAFE_CHECKLIST.md); we never expose an irreversible one-click purge to
-- the account itself.
--
-- WHY a new table (education.data_rights_event): a data-rights action is a
-- genuinely new entity with its own identity + lifecycle (export/delete/restore
-- events that FERPA/COPPA auditability requires we retain) — not a variant of any
-- existing row. Justified per reuse-first DB rules.
--
-- Idempotent: CREATE TABLE/POLICY IF NOT EXISTS, CREATE OR REPLACE.

-- ─── Audit ledger for data-rights actions ────────────────────────────────────
create table if not exists education.data_rights_event (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  action      text not null check (action in ('export', 'delete', 'restore')),
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_data_rights_event_user
  on education.data_rights_event (user_id, created_at desc);

comment on table education.data_rights_event is
  'FERPA/COPPA data-rights audit ledger: every export/delete/restore a user performs on their own study data. Written only by the edu_* data-rights RPCs.';

alter table education.data_rights_event enable row level security;
drop policy if exists data_rights_event_select on education.data_rights_event;
create policy data_rights_event_select on education.data_rights_event
  for select using (user_id = auth.uid());
-- No write policies: only the SECURITY DEFINER RPCs below write here.
grant select on education.data_rights_event to authenticated;

-- ─── Export: the full study-spine archive for the current user ────────────────
create or replace function public.edu_export_study_data()
returns jsonb
language sql
security definer
set search_path = education, public, pg_temp
as $$
  select jsonb_build_object(
    '__format', 'matrx.education.study_export',
    'version', 1,
    'exported_at', now(),
    'user_id', auth.uid(),
    'spine', jsonb_build_object(
      'study_sessions',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_session   t where t.created_by = auth.uid() and t.deleted_at is null),
      'study_attempts',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_attempt   t where t.created_by = auth.uid() and t.deleted_at is null),
      'item_mastery',      (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.item_mastery    t where t.created_by = auth.uid() and t.deleted_at is null),
      'study_goals',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_goal      t where t.created_by = auth.uid() and t.deleted_at is null),
      'study_streak',      (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_streak    t where t.user_id    = auth.uid()),
      'study_plans',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_plan      t where t.created_by = auth.uid() and t.deleted_at is null),
      'study_plan_days',   (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_plan_day  t where t.created_by = auth.uid() and t.deleted_at is null),
      'study_plan_blocks', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_plan_block t where t.created_by = auth.uid() and t.deleted_at is null),
      'study_media',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.study_media     t where t.created_by = auth.uid() and t.deleted_at is null),
      'assessments',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.assessment      t where t.created_by = auth.uid() and t.deleted_at is null),
      'assessment_items',  (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.assessment_item t where t.created_by = auth.uid() and t.deleted_at is null),
      'assessment_results',(select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.assessment_result t where t.created_by = auth.uid() and t.deleted_at is null),
      'fc_sets',           (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.fc_set          t where t.created_by = auth.uid() and t.deleted_at is null),
      'fc_cards',          (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.fc_card         t where t.created_by = auth.uid() and t.deleted_at is null),
      'fc_details',        (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.fc_detail       t where t.created_by = auth.uid() and t.deleted_at is null),
      'learn_docs',        (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.learn_doc       t where t.created_by = auth.uid() and t.deleted_at is null),
      'quiz_sessions',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from education.quiz_sessions   t where t.created_by = auth.uid() and t.deleted_at is null)
    )
  );
$$;

-- ─── Delete: soft-delete the whole spine, loud + auditable + reversible ───────
-- Returns { deleted_at, restore_until, counts }. The deleted_at is a single
-- timestamp shared by every row deleted in this call (one statement each), so the
-- restore path can match exactly this delete and nothing else.
create or replace function public.edu_delete_study_data()
returns jsonb
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_at     timestamptz := now();
  v_window interval := interval '30 days';
  v_counts jsonb := '{}'::jsonb;
  v_tbl    text;
  v_n      int;
  v_tables text[] := array[
    'study_session','study_attempt','item_mastery','study_goal','study_plan',
    'study_plan_day','study_plan_block','study_media','assessment','assessment_item',
    'assessment_result','fc_set','fc_card','fc_detail','learn_doc','quiz_sessions'
  ];
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  foreach v_tbl in array v_tables loop
    execute format(
      'update education.%I set deleted_at = $1 where created_by = $2 and deleted_at is null',
      v_tbl
    ) using v_at, v_uid;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object(v_tbl, v_n);
  end loop;

  insert into education.data_rights_event (user_id, action, detail)
  values (v_uid, 'delete', jsonb_build_object(
    'deleted_at', v_at,
    'restore_until', v_at + v_window,
    'counts', v_counts
  ));

  return jsonb_build_object(
    'deleted_at', v_at,
    'restore_until', v_at + v_window,
    'counts', v_counts
  );
end;
$$;

-- ─── Restore: within the window, un-delete exactly the last delete''s rows ─────
create or replace function public.edu_restore_study_data()
returns jsonb
language plpgsql
security definer
set search_path = education, public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_event  education.data_rights_event;
  v_at     timestamptz;
  v_counts jsonb := '{}'::jsonb;
  v_tbl    text;
  v_n      int;
  v_tables text[] := array[
    'study_session','study_attempt','item_mastery','study_goal','study_plan',
    'study_plan_day','study_plan_block','study_media','assessment','assessment_item',
    'assessment_result','fc_set','fc_card','fc_detail','learn_doc','quiz_sessions'
  ];
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_event from education.data_rights_event
   where user_id = v_uid and action = 'delete'
   order by created_at desc limit 1;

  if v_event.id is null then
    raise exception 'No delete to restore' using errcode = 'P0002';
  end if;

  v_at := (v_event.detail->>'deleted_at')::timestamptz;
  if now() > (v_event.detail->>'restore_until')::timestamptz then
    raise exception 'The restore window for that deletion has closed' using errcode = 'P0001';
  end if;

  foreach v_tbl in array v_tables loop
    execute format(
      'update education.%I set deleted_at = null where created_by = $1 and deleted_at = $2',
      v_tbl
    ) using v_uid, v_at;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object(v_tbl, v_n);
  end loop;

  insert into education.data_rights_event (user_id, action, detail)
  values (v_uid, 'restore', jsonb_build_object('restored_from', v_at, 'counts', v_counts));

  return jsonb_build_object('restored_from', v_at, 'counts', v_counts);
end;
$$;

-- Record that an export happened (auditability). Called by the client after a
-- successful export download. Kept separate so the export read itself stays a
-- pure, cacheable SELECT.
create or replace function public.edu_log_data_export()
returns void
language sql
security definer
set search_path = education, public, pg_temp
as $$
  insert into education.data_rights_event (user_id, action, detail)
  values (auth.uid(), 'export', '{}'::jsonb);
$$;

-- ─── Grants (authenticated only; anon/public revoked) ─────────────────────────
revoke execute on function public.edu_export_study_data()  from public, anon;
revoke execute on function public.edu_delete_study_data()  from public, anon;
revoke execute on function public.edu_restore_study_data() from public, anon;
revoke execute on function public.edu_log_data_export()    from public, anon;
grant  execute on function public.edu_export_study_data()  to authenticated;
grant  execute on function public.edu_delete_study_data()  to authenticated;
grant  execute on function public.edu_restore_study_data() to authenticated;
grant  execute on function public.edu_log_data_export()    to authenticated;
