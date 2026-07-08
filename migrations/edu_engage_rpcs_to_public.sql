-- Follow-up to edu_engage_game_and_forgiveness.sql: move the JS-callable engage
-- RPCs from the education schema to public, matching the codebase convention
-- (supabase.rpc() resolves against public, exactly like study_record_attempt).
-- The functions are unchanged except for schema; they still query education.*.
-- Applied + verified live 2026-07-07.
DROP FUNCTION IF EXISTS education.game_room_by_code(text);
DROP FUNCTION IF EXISTS education.game_room_players(uuid);
DROP FUNCTION IF EXISTS education.league_leaderboard(date);
DROP FUNCTION IF EXISTS education.league_add_result(numeric, text);
DROP FUNCTION IF EXISTS education.set_streak_rest_weekdays(smallint[]);

CREATE OR REPLACE FUNCTION public.game_room_by_code(p_code text)
RETURNS TABLE (id uuid, host_user_id uuid, join_code text, status text, source_kind text, source_set_id uuid, source_title text, config jsonb, started_at timestamptz, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT r.id, r.host_user_id, r.join_code, r.status, r.source_kind, r.source_set_id, r.source_title, r.config, r.started_at, r.created_at
  FROM education.game_room r
  WHERE upper(r.join_code) = upper(p_code) AND r.status IN ('lobby','active') AND r.deleted_at IS NULL AND auth.uid() IS NOT NULL
  ORDER BY r.created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.game_room_players(p_room_id uuid)
RETURNS TABLE (user_id uuid, display_name text, score int, correct_count int, answered_count int, best_streak int, mastery_gain numeric, currency_earned int, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT gr.user_id, gr.display_name, gr.score, gr.correct_count, gr.answered_count, gr.best_streak, gr.mastery_gain, gr.currency_earned, gr.created_at
  FROM education.game_result gr
  WHERE gr.room_id = p_room_id AND gr.deleted_at IS NULL
    AND (EXISTS (SELECT 1 FROM education.game_result me WHERE me.room_id = p_room_id AND me.user_id = auth.uid() AND me.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM education.game_room rm WHERE rm.id = p_room_id AND rm.host_user_id = auth.uid()))
  ORDER BY gr.score DESC, gr.mastery_gain DESC;
$$;

CREATE OR REPLACE FUNCTION public.league_leaderboard(p_week_start date)
RETURNS TABLE (user_id uuid, display_name text, mastery_gain numeric, games_played int, is_me boolean)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT lm.user_id, lm.display_name, lm.mastery_gain, lm.games_played, (lm.user_id = auth.uid()) AS is_me
  FROM education.league_membership lm
  WHERE lm.week_start = p_week_start AND lm.opted_in = true AND lm.deleted_at IS NULL AND auth.uid() IS NOT NULL
  ORDER BY lm.mastery_gain DESC, lm.games_played DESC LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.league_add_result(p_mastery_gain numeric, p_display_name text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_user uuid := auth.uid(); v_week date := (date_trunc('week', (now() at time zone 'utc')::date))::date;
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  UPDATE education.league_membership
     SET mastery_gain = mastery_gain + greatest(p_mastery_gain, 0), games_played = games_played + 1,
         display_name = coalesce(p_display_name, display_name), updated_at = now()
   WHERE user_id = v_user AND week_start = v_week AND opted_in = true AND deleted_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.set_streak_rest_weekdays(p_weekdays smallint[])
RETURNS education.study_streak LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_user uuid := auth.uid(); v_row education.study_streak%rowtype;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_weekdays,'{}')) d WHERE d < 0 OR d > 6) THEN
    RAISE EXCEPTION 'weekdays must be 0..6';
  END IF;
  INSERT INTO education.study_streak (user_id, organization_id, rest_weekdays)
  VALUES (v_user, (SELECT id FROM iam.organizations WHERE created_by = v_user AND is_personal = true LIMIT 1), coalesce(p_weekdays,'{}'))
  ON CONFLICT (user_id) DO UPDATE SET rest_weekdays = excluded.rest_weekdays, updated_at = now();
  SELECT * INTO v_row FROM education.study_streak WHERE user_id = v_user;
  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.game_room_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.game_room_players(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_leaderboard(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_add_result(numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_streak_rest_weekdays(smallint[]) TO authenticated;
