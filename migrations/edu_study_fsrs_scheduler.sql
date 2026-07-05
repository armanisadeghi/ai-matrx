-- Phase 2 of the Flashcards Competitive Parity Push: replace the fixed 6-box
-- Leitner scheduler with real FSRS. `lib/srs/fsrs.ts` is a complete, pure,
-- unit-tested FSRS implementation — duplicating that math in PL/pgSQL would
-- violate single-source-of-truth, so the algorithm stays in TypeScript and
-- these RPCs become DUMB ATOMIC WRITERS: the caller (studyService.ts) reads
-- the item's prior FSRS state, calls `nextState()` (or replays the full
-- history through it for an override), and passes the computed
-- difficulty/stability/due_at/retrievability/lapses straight through.
--
-- `item_mastery.difficulty` / `.stability` / `.retrievability` already existed
-- (unused headroom from the original schema) — only `lapses` is new. `box` /
-- `interval_days` / `ease` are left in place for any historical reads but are
-- no longer written meaningfully by these RPCs (interval_days keeps getting a
-- courtesy value derived from due_at for any legacy display; box/ease are
-- simply frozen at whatever they last were pre-migration — old box history is
-- NOT backfilled into FSRS state, matching the plan's explicit decision: an
-- item with no difficulty/stability yet is treated as a first-review).
--
-- `mastery_score` / `retrievability` are write-time SNAPSHOTS only (retrievability
-- right at the moment of the review, i.e. ~1). They are NOT the canonical
-- "current" mastery — that decays continuously, so every reader must recompute
-- it fresh via `currentRetrievability()` (features/education/study/utils/masteryFsrs.ts)
-- from the persisted difficulty/stability/last_review, never trust the stored
-- snapshot for anything time-sensitive (progress dashboards, weak-area ranking).
--
-- Applied live to txzxabzwovsujtloxrus via Supabase MCP.

alter table education.item_mastery
  add column if not exists lapses integer not null default 0;

comment on column education.item_mastery.lapses is
  'FSRS lapse count (times rated "Again"/incorrect since the item entered the FSRS scheduler). Persisted state written by studyService.ts via lib/srs/fsrs.ts — never computed in SQL.';
comment on column education.item_mastery.difficulty is
  'FSRS difficulty D in [1,10]. Null = item has never been reviewed under the FSRS scheduler (pre-migration box-only history, or truly new). Computed exclusively in lib/srs/fsrs.ts.';
comment on column education.item_mastery.stability is
  'FSRS stability S in days. Null = no FSRS state yet. Computed exclusively in lib/srs/fsrs.ts.';
comment on column education.item_mastery.retrievability is
  'Write-time snapshot of retrievability at the moment of the last review (~1). NOT the current value — recompute fresh via currentRetrievability() using difficulty/stability/last_review + now().';
comment on column education.item_mastery.mastery_score is
  'Write-time snapshot, same caveat as retrievability. Displays should recompute fresh for anything more than a few seconds old.';
comment on column education.item_mastery.box is
  'Deprecated (pre-FSRS Leitner box). Frozen at its last pre-migration value; no longer written.';

-- Postgres resolves overloads by exact parameter-type signature, so
-- `create or replace` with a DIFFERENT param list creates a SECOND overload
-- rather than replacing the old one — explicitly drop the prior signatures
-- first so there is exactly one `study_record_attempt` / `study_override_attempt`
-- and PostgREST/supabase-js can never resolve to the stale box-scheduler version.
drop function if exists public.study_record_attempt(
  text, uuid, uuid, text, text, jsonb, numeric, text, uuid, uuid, text, integer, text
);
drop function if exists public.study_override_attempt(uuid, text, numeric, jsonb);

-- ── study_record_attempt v3: FSRS-aware, dumb atomic writer ────────────────────
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

  -- Ungraded / skipped attempt: log it, bump counts, touch nothing scheduler-wise.
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
    (not v_correct and not v_partial)
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
    struggle_flag   = (not v_correct and not v_partial) or (m.streak = 0 and not v_correct)
  returning * into v_mrow;

  return jsonb_build_object('attempt_id', v_attempt_id, 'mastery', to_jsonb(v_mrow));
end $fn$;

grant execute on function public.study_record_attempt(
  text, uuid, uuid, text, text, jsonb, numeric, text, uuid, uuid, text, integer, text,
  numeric, numeric, timestamptz, numeric, integer
) to authenticated, service_role;

-- ── study_override_attempt v2: FSRS-aware, dumb atomic writer ──────────────────
-- The caller (studyService.overrideAttempt) fetches the item's full attempt
-- history, splices in the edited result, replays lib/srs/fsrs.ts sequentially
-- in TS, and hands this RPC the FINAL computed state — this function no longer
-- runs any scheduler loop itself, it just writes exactly what it's given inside
-- one transaction (same atomicity guarantee as before, just no math in SQL).
create or replace function public.study_override_attempt(
  p_attempt_id uuid,
  p_result text,
  p_score_value numeric default null,
  p_score jsonb default null,
  p_difficulty numeric default null,
  p_stability numeric default null,
  p_due_at timestamptz default null,
  p_retrievability numeric default null,
  p_lapses integer default null,
  p_streak integer default null,
  p_attempt_count integer default null,
  p_correct_count integer default null,
  p_struggle_flag boolean default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_row education.study_attempt%rowtype;
  v_mrow education.item_mastery%rowtype;
  v_interval_days integer;
begin
  if v_uid is null then
    raise exception 'study_override_attempt: not authenticated' using errcode = '42501';
  end if;

  if p_result not in ('correct', 'partial', 'incorrect') then
    raise exception 'study_override_attempt: invalid result %', p_result using errcode = '22023';
  end if;

  select * into v_row from education.study_attempt
   where id = p_attempt_id and deleted_at is null
   for update;

  if v_row.id is null then
    raise exception 'study_override_attempt: attempt not found' using errcode = 'P0002';
  end if;
  if v_row.created_by is distinct from v_uid then
    raise exception 'study_override_attempt: not your attempt' using errcode = '42501';
  end if;
  if p_difficulty is null or p_stability is null or p_due_at is null or p_retrievability is null
     or p_lapses is null or p_streak is null or p_attempt_count is null or p_correct_count is null
     or p_struggle_flag is null then
    raise exception 'study_override_attempt: full replayed FSRS + mastery state is required — compute via lib/srs/fsrs.ts in studyService before calling'
      using errcode = '22023';
  end if;

  update education.study_attempt set
    original_result       = case when is_manually_edited then original_result else result end,
    original_score         = case when is_manually_edited then original_score else score end,
    original_score_value   = case when is_manually_edited then original_score_value else score_value end,
    result          = p_result,
    score_value     = coalesce(p_score_value, score_value),
    score           = coalesce(p_score, score),
    is_manually_edited = true,
    edited_by       = v_uid,
    edited_at       = now()
  where id = p_attempt_id
  returning * into v_row;

  v_interval_days := greatest(0, round(extract(epoch from (p_due_at - now())) / 86400)::integer);

  insert into education.item_mastery as m (
    created_by, item_type, item_id, mastery_score, difficulty, stability, retrievability,
    lapses, interval_days, due_at, last_review, last_result, last_attempt_at,
    attempt_count, correct_count, streak, struggle_flag
  ) values (
    v_uid, v_row.item_type, v_row.item_id, p_retrievability, p_difficulty, p_stability, p_retrievability,
    p_lapses, v_interval_days, p_due_at, now(), p_result, now(),
    p_attempt_count, p_correct_count, p_streak, p_struggle_flag
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
    attempt_count   = excluded.attempt_count,
    correct_count   = excluded.correct_count,
    streak          = excluded.streak,
    struggle_flag   = excluded.struggle_flag
  returning * into v_mrow;

  return jsonb_build_object('attempt', to_jsonb(v_row), 'mastery', to_jsonb(v_mrow));
end $fn$;

grant execute on function public.study_override_attempt(
  uuid, text, numeric, jsonb, numeric, numeric, timestamptz, numeric, integer, integer, integer, integer, boolean
) to authenticated, service_role;
