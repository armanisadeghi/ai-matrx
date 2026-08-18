-- WP7 / IC-14: attempt-ledger-authoritative game results, badges, and leagues.

ALTER TABLE education.league_membership
  ADD COLUMN IF NOT EXISTS cohort_key text;

ALTER TABLE education.game_result
  DROP CONSTRAINT IF EXISTS game_result_integrity_bounds;
ALTER TABLE education.game_result
  ADD CONSTRAINT game_result_integrity_bounds CHECK (
    score BETWEEN 0 AND 25000
    AND correct_count BETWEEN 0 AND 100
    AND answered_count BETWEEN 0 AND 100
    AND correct_count <= answered_count
    AND best_streak BETWEEN 0 AND 100
    AND mastery_gain BETWEEN 0 AND 100
    AND currency_earned BETWEEN 0 AND 2500
    AND (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 7200000)
  );

CREATE OR REPLACE FUNCTION public.league_set_opt_in(
  p_opted_in boolean,
  p_display_name text DEFAULT NULL
)
RETURNS education.league_membership
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, education, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_week date := date_trunc('week', now() AT TIME ZONE 'utc')::date;
  v_activity integer;
  v_band text;
  v_cohort text;
  v_row education.league_membership;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'league_set_opt_in requires authentication' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('education-league-' || v_week::text, 0));

  SELECT count(*)::integer
    INTO v_activity
    FROM education.study_attempt a
   WHERE a.created_by = v_user
     AND a.deleted_at IS NULL
     AND a.is_manually_edited = false
     AND a.result IN ('incorrect', 'partial', 'correct')
     AND coalesce(a.reviewed_at, a.created_at) >= now() - interval '28 days';

  v_band := CASE
    WHEN v_activity < 20 THEN 'starter'
    WHEN v_activity < 100 THEN 'steady'
    ELSE 'active'
  END;

  IF p_opted_in THEN
    SELECT lm.cohort_key
      INTO v_cohort
      FROM education.league_membership lm
     WHERE lm.week_start = v_week
       AND lm.opted_in = true
       AND lm.deleted_at IS NULL
       AND lm.cohort_key LIKE v_band || '-%'
     GROUP BY lm.cohort_key
    HAVING count(*) < 30
     ORDER BY count(*) DESC, lm.cohort_key
     LIMIT 1;

    v_cohort := coalesce(
      v_cohort,
      v_band || '-' || substr(md5(v_user::text || clock_timestamp()::text), 1, 8)
    );
  END IF;

  SELECT *
    INTO v_row
    FROM education.league_membership lm
   WHERE lm.created_by = v_user
     AND lm.week_start = v_week
     AND lm.deleted_at IS NULL
   FOR UPDATE;

  IF FOUND THEN
    UPDATE education.league_membership
       SET opted_in = p_opted_in,
           display_name = left(nullif(btrim(p_display_name), ''), 80),
           cohort_key = CASE WHEN p_opted_in THEN coalesce(v_row.cohort_key, v_cohort) ELSE v_row.cohort_key END,
           updated_at = now()
     WHERE id = v_row.id
     RETURNING * INTO v_row;
  ELSE
    INSERT INTO education.league_membership (
      organization_id, created_by, week_start, display_name, opted_in, cohort_key
    ) VALUES (
      iam.personal_org_id(v_user), v_user, v_week,
      left(nullif(btrim(p_display_name), ''), 80), p_opted_in,
      CASE WHEN p_opted_in THEN v_cohort ELSE NULL END
    )
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No organization membership exists for the authenticated learner';
    END IF;
  END IF;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.game_finalize_result(
  p_session_id uuid,
  p_display_name text DEFAULT NULL
)
RETURNS education.game_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, education, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_session education.study_session;
  v_room education.game_room;
  v_result education.game_result;
  v_mode text;
  v_room_text text;
  v_room_id uuid;
  v_total_count integer;
  v_attempt_count integer;
  v_score integer := 0;
  v_correct integer := 0;
  v_streak integer := 0;
  v_best_streak integer := 0;
  v_mastery numeric := 0;
  v_currency integer := 0;
  v_duration integer;
  v_new_badges text[] := ARRAY[]::text[];
  v_badge text;
  v_attempt record;
  v_week date := date_trunc('week', now() AT TIME ZONE 'utc')::date;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'game_finalize_result requires authentication' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'A study session id is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('education-game-' || p_session_id::text, 0));

  SELECT * INTO v_result
    FROM education.game_result gr
   WHERE gr.session_id = p_session_id
     AND gr.created_by = v_user
     AND gr.deleted_at IS NULL;
  IF FOUND THEN
    RETURN v_result;
  END IF;

  IF (SELECT count(*) FROM education.game_result gr
       WHERE gr.created_by = v_user AND gr.deleted_at IS NULL
         AND gr.created_at >= now() - interval '10 minutes') >= 10 THEN
    RAISE EXCEPTION 'Game finalization rate limit exceeded';
  END IF;

  SELECT * INTO v_session
    FROM education.study_session s
   WHERE s.id = p_session_id
     AND s.created_by = v_user
     AND s.deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR v_session.mode <> 'game' OR v_session.status <> 'completed' OR v_session.ended_at IS NULL THEN
    RAISE EXCEPTION 'Game session is missing, foreign, or not completed';
  END IF;
  IF v_session.ended_at < v_session.created_at
     OR v_session.ended_at > v_session.created_at + interval '2 hours' THEN
    RAISE EXCEPTION 'Game session timing is implausible';
  END IF;

  v_mode := coalesce(v_session.metadata ->> 'mode', 'solo');
  IF v_mode NOT IN ('solo', 'multiplayer') THEN
    RAISE EXCEPTION 'Unknown game mode: %', v_mode;
  END IF;
  v_room_text := v_session.metadata ->> 'roomId';
  IF v_room_text IS NOT NULL AND v_room_text <> '' AND
     v_room_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_room_id := v_room_text::uuid;
  ELSIF v_mode = 'multiplayer' THEN
    RAISE EXCEPTION 'Multiplayer session has no valid room id';
  END IF;

  IF v_mode = 'multiplayer' THEN
    SELECT * INTO v_room
      FROM education.game_room r
     WHERE r.id = v_room_id AND r.deleted_at IS NULL;
    IF NOT FOUND OR v_room.status NOT IN ('active', 'ended') OR v_room.started_at IS NULL
       OR v_room.source_kind IS DISTINCT FROM v_session.source_kind
       OR v_room.source_set_id IS DISTINCT FROM v_session.source_set_id THEN
      RAISE EXCEPTION 'Multiplayer room does not match the completed study session';
    END IF;
  END IF;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE a.is_manually_edited = false)::integer
    INTO v_total_count, v_attempt_count
    FROM education.study_attempt a
   WHERE a.session_id = p_session_id
     AND a.created_by = v_user
     AND a.method = 'game'
     AND a.deleted_at IS NULL;

  IF v_total_count < 1 OR v_total_count > 100 OR v_attempt_count < 1 THEN
    RAISE EXCEPTION 'Game attempt count is outside the allowed range';
  END IF;
  -- Manual edits are excluded from contests. Other malformed attempts make the
  -- entire result unverifiable and therefore refuse loudly.
  IF EXISTS (
    SELECT 1 FROM education.study_attempt a
     WHERE a.session_id = p_session_id AND a.created_by = v_user
       AND a.method = 'game' AND a.deleted_at IS NULL
       AND a.is_manually_edited = false
       AND (a.result IS NULL OR a.result NOT IN ('incorrect', 'partial', 'correct')
            OR a.latency_ms IS NULL OR a.latency_ms < 0 OR a.latency_ms > 120000)
  ) THEN
    RAISE EXCEPTION 'Game attempt ledger contains an implausible result or timing';
  END IF;

  FOR v_attempt IN
    SELECT a.result, a.latency_ms
      FROM education.study_attempt a
     WHERE a.session_id = p_session_id
       AND a.created_by = v_user
       AND a.method = 'game'
       AND a.deleted_at IS NULL
       AND a.is_manually_edited = false
     ORDER BY coalesce(a.reviewed_at, a.created_at), a.id
  LOOP
    IF v_attempt.result = 'correct' THEN
      v_streak := v_streak + 1;
      v_correct := v_correct + 1;
      v_score := v_score + 100
        + round(50 * (1 - least(v_attempt.latency_ms, 15000)::numeric / 15000))::integer
        + least(greatest(v_streak - 1, 0) * 10, 100);
      v_currency := v_currency + 25;
      v_best_streak := greatest(v_best_streak, v_streak);
    ELSE
      v_streak := 0;
    END IF;
  END LOOP;

  SELECT coalesce(sum(greatest(session_best - prior_best, 0)), 0)
    INTO v_mastery
    FROM (
      SELECT current_attempt.item_id,
             max(CASE current_attempt.result WHEN 'correct' THEN 1 WHEN 'partial' THEN 0.5 ELSE 0 END) AS session_best,
             coalesce((
               SELECT max(CASE prior.result WHEN 'correct' THEN 1 WHEN 'partial' THEN 0.5 ELSE 0 END)
                 FROM education.study_attempt prior
                WHERE prior.created_by = v_user
                  AND prior.item_id = current_attempt.item_id
                  AND prior.deleted_at IS NULL
                  AND prior.is_manually_edited = false
                  AND prior.result IN ('incorrect', 'partial', 'correct')
                  AND coalesce(prior.reviewed_at, prior.created_at) < v_session.created_at
             ), 0) AS prior_best
        FROM education.study_attempt current_attempt
       WHERE current_attempt.session_id = p_session_id
         AND current_attempt.created_by = v_user
         AND current_attempt.method = 'game'
         AND current_attempt.deleted_at IS NULL
         AND current_attempt.is_manually_edited = false
         AND current_attempt.result IN ('incorrect', 'partial', 'correct')
       GROUP BY current_attempt.item_id
    ) gains;

  v_duration := greatest(0, least(7200000,
    round(extract(epoch FROM (v_session.ended_at - v_session.created_at)) * 1000)::integer
  ));

  INSERT INTO education.game_result (
    organization_id, created_by, room_id, session_id, display_name, mode,
    score, correct_count, answered_count, best_streak, mastery_gain,
    currency_earned, duration_ms, source_kind, source_set_id, source_title, metadata
  ) VALUES (
    v_session.organization_id, v_user, v_room_id, p_session_id,
    left(nullif(btrim(p_display_name), ''), 80), v_mode,
    v_score, v_correct, v_attempt_count, v_best_streak, v_mastery,
    v_currency, v_duration, v_session.source_kind, v_session.source_set_id,
    CASE WHEN v_mode = 'multiplayer' THEN v_room.source_title ELSE NULL END,
    jsonb_build_object(
      'score_policy', 'education-game-v1',
      'integrity', 'verified',
      'excluded_manual_attempts', (
        SELECT count(*) FROM education.study_attempt a
         WHERE a.session_id = p_session_id AND a.created_by = v_user
           AND a.method = 'game' AND a.deleted_at IS NULL AND a.is_manually_edited
      )
    )
  ) RETURNING * INTO v_result;

  UPDATE education.league_membership lm
     SET mastery_gain = lm.mastery_gain + v_mastery,
         games_played = lm.games_played + 1,
         display_name = coalesce(left(nullif(btrim(p_display_name), ''), 80), lm.display_name),
         updated_at = now()
   WHERE lm.created_by = v_user
     AND lm.week_start = v_week
     AND lm.opted_in = true
     AND lm.cohort_key IS NOT NULL
     AND lm.deleted_at IS NULL;

  FOREACH v_badge IN ARRAY ARRAY['first_game']::text[] LOOP
    INSERT INTO education.game_badge (organization_id, created_by, badge_key, context)
    SELECT v_session.organization_id, v_user, v_badge,
           jsonb_build_object('resultId', v_result.id, 'sessionId', p_session_id, 'score', v_score)
    WHERE NOT EXISTS (
      SELECT 1 FROM education.game_badge b
       WHERE b.created_by = v_user AND b.badge_key = v_badge AND b.deleted_at IS NULL
    );
  END LOOP;

  IF v_attempt_count >= 5 AND v_correct = v_attempt_count THEN
    v_new_badges := array_append(v_new_badges, 'perfect_round');
  END IF;
  IF coalesce((SELECT s.current_streak FROM education.study_streak s WHERE s.user_id = v_user), 0) >= 7 THEN
    v_new_badges := array_append(v_new_badges, 'streak_7');
  END IF;
  IF coalesce((SELECT s.current_streak FROM education.study_streak s WHERE s.user_id = v_user), 0) >= 30 THEN
    v_new_badges := array_append(v_new_badges, 'streak_30');
  END IF;
  IF (SELECT count(*) FROM education.item_mastery m
       WHERE m.created_by = v_user AND m.deleted_at IS NULL AND m.retrievability >= 0.9) >= 10 THEN
    v_new_badges := array_append(v_new_badges, 'mastery_10');
  END IF;
  IF (SELECT count(*) FROM education.item_mastery m
       WHERE m.created_by = v_user AND m.deleted_at IS NULL AND m.retrievability >= 0.9) >= 50 THEN
    v_new_badges := array_append(v_new_badges, 'mastery_50');
  END IF;

  FOREACH v_badge IN ARRAY v_new_badges LOOP
    INSERT INTO education.game_badge (organization_id, created_by, badge_key, context)
    SELECT v_session.organization_id, v_user, v_badge,
           jsonb_build_object('resultId', v_result.id, 'sessionId', p_session_id, 'score', v_score)
    WHERE NOT EXISTS (
      SELECT 1 FROM education.game_badge b
       WHERE b.created_by = v_user AND b.badge_key = v_badge AND b.deleted_at IS NULL
    );
  END LOOP;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.league_add_result(
  p_mastery_gain numeric,
  p_display_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, education, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'league_add_result is retired; finalize the owned game session instead';
END;
$function$;

CREATE OR REPLACE FUNCTION public.league_leaderboard(p_week_start date)
RETURNS TABLE(
  created_by uuid,
  display_name text,
  mastery_gain numeric,
  games_played integer,
  is_me boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, education, pg_temp
AS $function$
  WITH mine AS (
    SELECT lm.cohort_key
      FROM education.league_membership lm
     WHERE lm.created_by = auth.uid()
       AND lm.week_start = p_week_start
       AND lm.opted_in = true
       AND lm.deleted_at IS NULL
  )
  SELECT lm.created_by, lm.display_name, lm.mastery_gain, lm.games_played,
         lm.created_by = auth.uid() AS is_me
    FROM education.league_membership lm
    JOIN mine ON mine.cohort_key = lm.cohort_key
   WHERE lm.week_start = p_week_start
     AND lm.opted_in = true
     AND lm.deleted_at IS NULL
   ORDER BY lm.mastery_gain DESC, lm.games_played DESC, lm.created_at
   LIMIT 30;
$function$;

CREATE OR REPLACE FUNCTION public.education_engagement_snapshot(p_session_id uuid DEFAULT NULL)
RETURNS TABLE(
  session_points integer,
  current_streak integer,
  longest_streak integer,
  badges_earned integer,
  next_badge_key text,
  next_badge_progress integer,
  next_badge_target integer,
  league_rank integer,
  league_size integer,
  league_mastery_gain numeric,
  league_opted_in boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, education, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_week date := date_trunc('week', now() AT TIME ZONE 'utc')::date;
  v_mastered integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'education_engagement_snapshot requires authentication' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM education.study_session s
     WHERE s.id = p_session_id AND s.created_by = v_user AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Study session is missing or foreign' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_mastered
    FROM education.item_mastery m
   WHERE m.created_by = v_user AND m.deleted_at IS NULL AND m.retrievability >= 0.9;

  RETURN QUERY
  WITH mine AS (
    SELECT lm.*
      FROM education.league_membership lm
     WHERE lm.created_by = v_user AND lm.week_start = v_week AND lm.deleted_at IS NULL
     LIMIT 1
  ), ranked AS (
    SELECT lm.created_by,
           row_number() OVER (ORDER BY lm.mastery_gain DESC, lm.games_played DESC, lm.created_at)::integer AS rank,
           count(*) OVER ()::integer AS size
      FROM education.league_membership lm
      JOIN mine ON mine.cohort_key = lm.cohort_key
     WHERE lm.week_start = v_week AND lm.opted_in = true AND lm.deleted_at IS NULL
  ), signals AS (
    SELECT coalesce(st.current_streak, 0)::integer AS streak_now,
           coalesce(st.longest_streak, 0)::integer AS streak_best,
           (SELECT count(*)::integer FROM education.game_badge b
             WHERE b.created_by = v_user AND b.deleted_at IS NULL) AS badge_count
      FROM (SELECT 1) seed
      LEFT JOIN education.study_streak st ON st.user_id = v_user
  )
  SELECT
    coalesce((
      SELECT sum(CASE a.result WHEN 'correct' THEN 100 WHEN 'partial' THEN 50 ELSE 20 END)::integer
        FROM education.study_attempt a
       WHERE a.session_id = p_session_id AND a.created_by = v_user
         AND a.deleted_at IS NULL AND a.is_manually_edited = false
         AND a.result IN ('incorrect', 'partial', 'correct')
    ), 0) AS session_points,
    signals.streak_now,
    signals.streak_best,
    signals.badge_count,
    CASE
      WHEN signals.streak_now < 7 THEN 'streak_7'
      WHEN v_mastered < 10 THEN 'mastery_10'
      WHEN signals.streak_now < 30 THEN 'streak_30'
      WHEN v_mastered < 50 THEN 'mastery_50'
      ELSE ''
    END AS next_badge_key,
    CASE
      WHEN signals.streak_now < 7 THEN signals.streak_now
      WHEN v_mastered < 10 THEN v_mastered
      WHEN signals.streak_now < 30 THEN signals.streak_now
      WHEN v_mastered < 50 THEN v_mastered
      ELSE 0
    END AS next_badge_progress,
    CASE
      WHEN signals.streak_now < 7 THEN 7
      WHEN v_mastered < 10 THEN 10
      WHEN signals.streak_now < 30 THEN 30
      WHEN v_mastered < 50 THEN 50
      ELSE 0
    END AS next_badge_target,
    coalesce(ranked.rank, 0),
    coalesce(ranked.size, 0),
    coalesce(mine.mastery_gain, 0),
    coalesce(mine.opted_in, false)
  FROM signals
  LEFT JOIN mine ON true
  LEFT JOIN ranked ON ranked.created_by = v_user;
END;
$function$;

REVOKE INSERT, UPDATE, DELETE ON education.game_result FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON education.game_badge FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON education.league_membership FROM authenticated;

REVOKE ALL ON FUNCTION public.game_finalize_result(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.league_set_opt_in(boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.education_engagement_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_finalize_result(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_set_opt_in(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_leaderboard(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_engagement_snapshot(uuid) TO authenticated;

COMMENT ON FUNCTION public.game_finalize_result(uuid, text) IS
  'IC-14 authority: derives a durable game result, league gain, and badges only from the owned unedited study-attempt ledger.';
COMMENT ON COLUMN education.league_membership.cohort_key IS
  'Private weekly activity-matched league cohort; never a public/global shame board.';
