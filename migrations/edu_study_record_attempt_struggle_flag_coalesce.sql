-- D28 fix (correct, FSRS-era). Canonical definition of the LIVE study_record_attempt
-- RPC (the FSRS 18-param scheduler) with the struggle_flag NULL bug fixed.
--
-- Bug: item_mastery.struggle_flag is NOT NULL. On the graded ON CONFLICT UPDATE,
--   struggle_flag = (not v_correct and not v_partial) or (m.streak = 0 and not v_correct)
-- yields NULL via 3-valued logic when m.streak IS NULL (a partial result landing on an
-- existing row whose streak was never set) → 23502 NOT-NULL violation, failing the
-- study-spine write. Fix: coalesce(..., false) both struggle_flag expressions.
--
-- Supersedes the obsolete box-based (Leitner, 13-param) drafts
-- edu_study_record_attempt_rpc.sql / edu_study_record_attempt_null_result_fix.sql
-- (deleted) — those never matched the live FSRS function. Idempotent (CREATE OR REPLACE).
create or replace function public.study_record_attempt(
  p_item_type text,
  p_item_id uuid,
  p_session_id uuid default null,
  p_method text default 'flashcards',
  p_result text default null,
  p_score jsonb default null,
  p_score_value numeric default null,
  p_response_kind text default null,
  p_response_audio_file_id uuid default null,
  p_response_image_file_id uuid default null,
  p_response_transcript text default null,
  p_latency_ms integer default null,
  p_graded_by text default null,
  p_difficulty numeric default null,
  p_stability numeric default null,
  p_due_at timestamp with time zone default null,
  p_retrievability numeric default null,
  p_lapses integer default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_attempt_id uuid;
  v_correct boolean := (p_result = 'correct');
  v_partial boolean := (p_result = 'partial');
  v_prev_streak integer := 0;
  v_streak integer;
  v_interval_days integer;
  v_mrow education.item_mastery%rowtype;
begin
  if v_uid is null then
    raise exception 'study_record_attempt: not authenticated' using errcode = '42501';
  end if;

  insert into education.study_attempt (
    item_type, item_id, session_id, method, result, score, score_value,
    response_kind, response_audio_file_id, response_image_file_id, response_transcript,
    latency_ms, graded_by
  ) values (
    p_item_type, p_item_id, p_session_id, p_method, p_result, p_score, p_score_value,
    p_response_kind, p_response_audio_file_id, p_response_image_file_id, p_response_transcript,
    p_latency_ms, p_graded_by
  ) returning id into v_attempt_id;

  -- Ungraded / skipped attempt: log the ledger row + bump counts only; never
  -- touch the scheduler or flag struggle (struggle_flag defaults false).
  if p_result is null then
    insert into education.item_mastery as m (created_by, item_type, item_id, attempt_count, last_attempt_at)
    values (v_uid, p_item_type, p_item_id, 1, now())
    on conflict (created_by, item_type, item_id) do update set
      attempt_count   = m.attempt_count + 1,
      last_attempt_at = now()
    returning * into v_mrow;
    return jsonb_build_object('attempt_id', v_attempt_id, 'mastery', to_jsonb(v_mrow));
  end if;

  if p_difficulty is null or p_stability is null or p_due_at is null or p_retrievability is null or p_lapses is null then
    raise exception 'study_record_attempt: graded attempts require FSRS state (difficulty, stability, due_at, retrievability, lapses) — compute via lib/srs/fsrs.ts before calling'
      using errcode = '22023';
  end if;

  select coalesce(streak, 0) into v_prev_streak from education.item_mastery
   where created_by = v_uid and item_type = p_item_type and item_id = p_item_id;

  v_streak := case when v_correct then coalesce(v_prev_streak, 0) + 1 else 0 end;
  v_interval_days := greatest(0, round(extract(epoch from (p_due_at - now())) / 86400)::integer);

  insert into education.item_mastery as m (
    created_by, item_type, item_id, mastery_score, difficulty, stability, retrievability,
    lapses, interval_days, due_at, last_review, last_result, last_attempt_at,
    attempt_count, correct_count, streak, struggle_flag
  ) values (
    v_uid, p_item_type, p_item_id, p_retrievability, p_difficulty, p_stability, p_retrievability,
    p_lapses, v_interval_days, p_due_at, now(), p_result, now(),
    1, case when v_correct then 1 else 0 end, v_streak,
    coalesce((not v_correct and not v_partial), false)
  )
  on conflict (created_by, item_type, item_id) do update set
    mastery_score   = excluded.mastery_score,
    difficulty      = excluded.difficulty,
    stability       = excluded.stability,
    retrievability  = excluded.retrievability,
    lapses          = excluded.lapses,
    interval_days   = excluded.interval_days,
    due_at          = excluded.due_at,
    last_review     = excluded.last_review,
    last_result     = excluded.last_result,
    last_attempt_at = excluded.last_attempt_at,
    attempt_count   = m.attempt_count + 1,
    correct_count   = m.correct_count + (case when v_correct then 1 else 0 end),
    streak          = excluded.streak,
    struggle_flag   = coalesce((not v_correct and not v_partial) or (m.streak = 0 and not v_correct), false)
  returning * into v_mrow;

  return jsonb_build_object('attempt_id', v_attempt_id, 'mastery', to_jsonb(v_mrow));
end $fn$;

grant execute on function public.study_record_attempt(text,uuid,uuid,text,text,jsonb,numeric,text,uuid,uuid,text,integer,text,numeric,numeric,timestamptz,numeric,integer) to authenticated, service_role;
