-- D28 fix: a result-less attempt (ungraded / skipped — e.g. FastFire with no grader
-- configured, or a skipped card) must still LOG the ledger row + bump counts, but must
-- NOT reset the spaced-rep box or flag "struggle". The prior version computed struggle_flag
-- via 3-valued boolean logic over a NULL result, yielding NULL → item_mastery.struggle_flag
-- NOT-NULL violation. Now we branch: NULL result → minimal mastery touch (counts only);
-- graded result → full scheduler. Applied live to txzxabzwovsujtloxrus via Supabase MCP.
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
  p_graded_by text default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_attempt_id uuid;
  v_box smallint;
  v_streak integer;
  v_interval integer;
  v_mastery numeric;
  v_correct boolean := (p_result = 'correct');
  v_partial boolean := (p_result = 'partial');
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

  if p_result is null then
    insert into education.item_mastery as m (created_by, item_type, item_id, attempt_count, last_attempt_at)
    values (v_uid, p_item_type, p_item_id, 1, now())
    on conflict (created_by, item_type, item_id) do update set
      attempt_count   = m.attempt_count + 1,
      last_attempt_at = now()
    returning * into v_mrow;
    return jsonb_build_object('attempt_id', v_attempt_id, 'mastery', to_jsonb(v_mrow));
  end if;

  select * into v_mrow from education.item_mastery
   where created_by = v_uid and item_type = p_item_type and item_id = p_item_id;

  v_box    := coalesce(v_mrow.box, 1);
  v_streak := coalesce(v_mrow.streak, 0);

  if v_correct then
    v_box := least(v_box + 1, 6);
    v_streak := v_streak + 1;
  elsif v_partial then
    v_box := greatest(v_box, 1);
    v_streak := 0;
  else
    v_box := 1;
    v_streak := 0;
  end if;

  v_interval := case v_box when 1 then 0 when 2 then 1 when 3 then 3
                           when 4 then 7 when 5 then 16 else 35 end;
  v_mastery := coalesce(p_score_value, (v_box - 1)::numeric / 5.0);

  insert into education.item_mastery as m (
    created_by, item_type, item_id, mastery_score, box, interval_days, due_at,
    last_review, last_result, last_attempt_at, attempt_count, correct_count, streak, struggle_flag
  ) values (
    v_uid, p_item_type, p_item_id, v_mastery, v_box, v_interval, now() + make_interval(days => v_interval),
    now(), p_result, now(), 1, case when v_correct then 1 else 0 end, v_streak,
    (not v_correct and not v_partial)
  )
  on conflict (created_by, item_type, item_id) do update set
    mastery_score   = excluded.mastery_score,
    box             = excluded.box,
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

grant execute on function public.study_record_attempt(text,uuid,uuid,text,text,jsonb,numeric,text,uuid,uuid,text,integer,text) to authenticated, service_role;
