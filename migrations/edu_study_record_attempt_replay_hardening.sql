-- Hardening of the offline-replay branch (WP8, 2026-08-17), from an adversarial
-- review of the migration that introduced it. Three defects, all latent until a
-- client starts passing p_attempt_id (one is now being built):
--   A1 the replay branch returned an ALL-NULL mastery object instead of SQL null
--      when no mastery row existed, and it passed the client's type guard.
--   A2 the replay branch validated ownership but not the ITEM, so a reused or
--      colliding attempt id silently discarded a genuine attempt.
--   A3 the graded branch overwrote FSRS state unconditionally, so a late offline
--      replay could regress a schedule computed from a NEWER online review.
-- Verified live: replay w/o mastery -> null; wrong-item replay -> 22023; a stale
-- replay accrues attempt_count but leaves stability/due_at untouched; a normal
-- online graded attempt is unchanged.
CREATE OR REPLACE FUNCTION public.study_record_attempt(p_item_type text, p_item_id uuid, p_session_id uuid DEFAULT NULL::uuid, p_method text DEFAULT 'flashcards'::text, p_result text DEFAULT NULL::text, p_score jsonb DEFAULT NULL::jsonb, p_score_value numeric DEFAULT NULL::numeric, p_response_kind text DEFAULT NULL::text, p_response_audio_file_id uuid DEFAULT NULL::uuid, p_response_image_file_id uuid DEFAULT NULL::uuid, p_response_transcript text DEFAULT NULL::text, p_latency_ms integer DEFAULT NULL::integer, p_graded_by text DEFAULT NULL::text, p_difficulty numeric DEFAULT NULL::numeric, p_stability numeric DEFAULT NULL::numeric, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_retrievability numeric DEFAULT NULL::numeric, p_lapses integer DEFAULT NULL::integer, p_attempt_id uuid DEFAULT NULL::uuid, p_reviewed_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_attempt_id uuid;
  v_existing education.study_attempt%rowtype;
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

  if p_attempt_id is not null then
    select * into v_existing from education.study_attempt a where a.id = p_attempt_id;
    if found then
      if v_existing.created_by is distinct from v_uid then
        raise exception 'study_record_attempt: attempt id belongs to another user' using errcode = '42501';
      end if;
      -- The id must identify the SAME observation, or the caller is reusing ids
      -- and a real attempt would be silently dropped.
      if v_existing.item_type is distinct from p_item_type
         or v_existing.item_id is distinct from p_item_id then
        raise exception 'study_record_attempt: attempt id % already records a different item (%/%), refusing to treat this as a replay',
          p_attempt_id, v_existing.item_type, v_existing.item_id using errcode = '22023';
      end if;
      select * into v_mrow from education.item_mastery
       where created_by = v_uid and item_type = p_item_type and item_id = p_item_id;
      return jsonb_build_object(
        'attempt_id', p_attempt_id,
        'mastery', case when v_mrow.item_id is null then null else to_jsonb(v_mrow) end,
        'replayed', true);
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
    select * into v_mrow from education.item_mastery
     where created_by = v_uid and item_type = p_item_type and item_id = p_item_id;
    return jsonb_build_object(
      'attempt_id', p_attempt_id,
      'mastery', case when v_mrow.item_id is null then null else to_jsonb(v_mrow) end,
      'replayed', true);
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
    -- Counters and history ALWAYS accrue (this attempt really happened)...
    attempt_count   = m.attempt_count + 1,
    correct_count   = m.correct_count + (case when v_correct then 1 else 0 end),
    last_attempt_at = greatest(m.last_attempt_at, excluded.last_attempt_at),
    -- ...but SCHEDULER state only moves forward. A replayed offline attempt
    -- reviewed BEFORE the stored last_review must not regress the schedule a
    -- newer online review already computed.
    mastery_score   = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.mastery_score  else m.mastery_score  end,
    difficulty      = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.difficulty     else m.difficulty     end,
    stability       = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.stability      else m.stability      end,
    retrievability  = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.retrievability else m.retrievability end,
    lapses          = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.lapses         else m.lapses         end,
    interval_days   = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.interval_days  else m.interval_days  end,
    due_at          = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.due_at         else m.due_at         end,
    last_result     = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.last_result    else m.last_result    end,
    streak          = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.streak         else m.streak         end,
    last_review     = greatest(m.last_review, excluded.last_review),
    struggle_flag   = case when m.last_review is null or excluded.last_review >= m.last_review
                           then coalesce((not v_correct and not v_partial) or (m.streak = 0 and not v_correct), false)
                           else m.struggle_flag end
  returning * into v_mrow;

  return jsonb_build_object('attempt_id', v_attempt_id, 'mastery', to_jsonb(v_mrow));
end $function$
;
