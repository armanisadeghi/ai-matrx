-- Offline replay idempotency for the study spine (IC-8, WP8 — 2026-08-17).
--
-- Problem: study_record_attempt was a non-idempotent ledger append (bare INSERT,
-- delta mastery counters). An offline outbox replayed after reconnect — or any
-- network retry — double-counted attempts and corrupted mastery counters.
--
-- Change (additive; existing callers unaffected):
--   1. education.study_attempt gains reviewed_at (the true instant the learner
--      answered — differs from created_at for attempts captured offline).
--   2. study_record_attempt gains p_attempt_id (client-generated UUID, the
--      idempotency key) + p_reviewed_at. A replayed call (attempt id already
--      present for this user) returns the existing attempt and CURRENT mastery
--      with replayed:true and touches nothing.
--   3. Mastery timestamps and interval math use the (past-clamped) reviewed_at
--      so offline attempts land with their real review instant.
--
-- Idempotency is enforced at the storage layer by the study_attempt PRIMARY KEY
-- (client supplies the id), with an ownership check so one user cannot squat
-- another user's attempt id, and a unique_violation handler for the concurrent
-- replay race.

-- NOTE: adding parameters CHANGES the function signature, so `create or replace`
-- creates a SECOND overload rather than replacing. Two overloads make every
-- existing 18-argument PostgREST call ambiguous ("could not choose the best
-- candidate function") — i.e. it breaks every study mode. The old signature is
-- therefore dropped explicitly at the bottom of this file. Verified live: exactly
-- one study_record_attempt remains.

alter table education.study_attempt
  add column if not exists reviewed_at timestamptz;

comment on column education.study_attempt.reviewed_at is
  'The instant the learner actually answered. Differs from created_at for attempts captured offline and replayed later (IC-8).';

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
  p_due_at timestamptz default null,
  p_retrievability numeric default null,
  p_lapses integer default null,
  p_attempt_id uuid default null,
  p_reviewed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_attempt_id uuid;
  v_existing_owner uuid;
  v_correct boolean := (p_result = 'correct');
  v_partial boolean := (p_result = 'partial');
  v_prev_streak integer := 0;
  v_streak integer;
  v_interval_days integer;
  v_now timestamptz := least(coalesce(p_reviewed_at, now()), now());
  v_mrow education.item_mastery%rowtype;
begin
  if v_uid is null then
    raise exception 'study_record_attempt: not authenticated' using errcode = '42501';
  end if;

  -- Idempotent replay: the client supplied its own attempt id and we already
  -- hold that attempt. Return it with current mastery; never re-apply.
  if p_attempt_id is not null then
    select a.created_by into v_existing_owner
      from education.study_attempt a where a.id = p_attempt_id;
    if found then
      if v_existing_owner is distinct from v_uid then
        raise exception 'study_record_attempt: attempt id belongs to another user' using errcode = '42501';
      end if;
      select * into v_mrow from education.item_mastery
       where created_by = v_uid and item_type = p_item_type and item_id = p_item_id;
      return jsonb_build_object('attempt_id', p_attempt_id, 'mastery', to_jsonb(v_mrow), 'replayed', true);
    end if;
  end if;

  begin
    insert into education.study_attempt (
      id, item_type, item_id, session_id, method, result, score, score_value,
      response_kind, response_audio_file_id, response_image_file_id, response_transcript,
      latency_ms, graded_by, reviewed_at
    ) values (
      coalesce(p_attempt_id, gen_random_uuid()),
      p_item_type, p_item_id, p_session_id, p_method, p_result, p_score, p_score_value,
      p_response_kind, p_response_audio_file_id, p_response_image_file_id, p_response_transcript,
      p_latency_ms, p_graded_by, v_now
    ) returning id into v_attempt_id;
  exception when unique_violation then
    -- Concurrent replay of the same client attempt id: the other call won.
    select * into v_mrow from education.item_mastery
     where created_by = v_uid and item_type = p_item_type and item_id = p_item_id;
    return jsonb_build_object('attempt_id', p_attempt_id, 'mastery', to_jsonb(v_mrow), 'replayed', true);
  end;

  if p_result is null then
    insert into education.item_mastery as m (created_by, item_type, item_id, attempt_count, last_attempt_at)
    values (v_uid, p_item_type, p_item_id, 1, v_now)
    on conflict (created_by, item_type, item_id) do update set
      attempt_count   = m.attempt_count + 1,
      last_attempt_at = greatest(m.last_attempt_at, excluded.last_attempt_at)
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
  v_interval_days := greatest(0, round(extract(epoch from (p_due_at - v_now)) / 86400)::integer);

  insert into education.item_mastery as m (
    created_by, item_type, item_id, mastery_score, difficulty, stability, retrievability,
    lapses, interval_days, due_at, last_review, last_result, last_attempt_at,
    attempt_count, correct_count, streak, struggle_flag
  ) values (
    v_uid, p_item_type, p_item_id, p_retrievability, p_difficulty, p_stability, p_retrievability,
    p_lapses, v_interval_days, p_due_at, v_now, p_result, v_now,
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
end $function$;

-- Drop the superseded 18-argument signature so exactly ONE overload exists.
drop function if exists public.study_record_attempt(
  text, uuid, uuid, text, text, jsonb, numeric, text, uuid, uuid, text,
  integer, text, numeric, numeric, timestamptz, numeric, integer
);
