-- P10 ENGAGE — the engagement engine: SRS-wired multiplayer study game, solo
-- arcade results, outcome badges, opt-in mastery-gain leagues, and HEALTHY
-- streak forgiveness (freezes + planned rest days) applied hub-wide.
--
-- Design notes:
--   * game_room / game_result / game_badge / league_membership all follow the
--     platform base-entity shape (mirrors education.fc_set / study_media) and
--     get canonical RLS via iam.apply_rls.
--   * LIVE game state (roster, per-player score, questions) rides Supabase
--     Broadcast, NOT the DB (CLAUDE.md realtime rule). We persist ONLY the
--     finalized results (game_result) + every answer (study_attempt via the
--     existing spine). Rooms are a lightweight coordination row.
--   * Joiners are NOT the room owner, so owner-RLS can't let them read the
--     room by code — hence SECURITY DEFINER lookups (game_room_by_code,
--     game_room_players, league_leaderboard) gated to lobby/active + auth.uid().
--   * Streak forgiveness is added to the SHARED bump_study_streak() trigger so
--     EVERY study mode (not just the game) gets healthy streaks — the
--     "anti-Duolingo" stance is a platform property, not a game feature.
--
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / guarded ALTERs). Safe re-apply.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. study_session.mode/source_kind widened for 'game'
-- ─────────────────────────────────────────────────────────────────────────────
alter table education.study_session
  drop constraint if exists study_session_source_kind_check;
alter table education.study_session
  add constraint study_session_source_kind_check
  check (source_kind is null or source_kind in
    ('set','dynamic_batch','adaptive','weak_area','topic','game','due'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. education.game_room — the coordination row for a multiplayer match
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS education.game_room (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  version         int  NOT NULL DEFAULT 1,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility      platform.visibility NOT NULL DEFAULT 'private',

  host_user_id  uuid NOT NULL,
  join_code     text NOT NULL,
  -- lobby | active | ended
  status        text NOT NULL DEFAULT 'lobby',
  -- what the questions come from
  source_kind   text NOT NULL DEFAULT 'set' CHECK (source_kind IN ('set','topic','due')),
  source_set_id uuid,
  source_title  text,
  -- duration_ms, max_players, leaderboard_visibility, powerups_enabled, item_type…
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at    timestamptz,
  ended_at      timestamptz
);

-- join_code is unique among LIVE rooms only (ended rooms may recycle a code).
CREATE UNIQUE INDEX IF NOT EXISTS game_room_join_code_live_idx
  ON education.game_room (join_code)
  WHERE status IN ('lobby','active') AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS game_room_host_idx
  ON education.game_room (host_user_id, status) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. education.game_result — one finalized result row per player per game
--    (room_id NULL = solo arcade result)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS education.game_result (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  version         int  NOT NULL DEFAULT 1,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility      platform.visibility NOT NULL DEFAULT 'private',

  room_id        uuid,   -- education.game_room.id (NULL for solo)
  session_id     uuid,   -- education.study_session.id (the spine session)
  user_id        uuid NOT NULL,
  display_name   text,
  mode           text NOT NULL DEFAULT 'multiplayer' CHECK (mode IN ('multiplayer','solo')),
  score          int NOT NULL DEFAULT 0,
  correct_count  int NOT NULL DEFAULT 0,
  answered_count int NOT NULL DEFAULT 0,
  best_streak    int NOT NULL DEFAULT 0,
  -- sum of positive mastery deltas earned this game (the outcome metric)
  mastery_gain   numeric NOT NULL DEFAULT 0,
  currency_earned int NOT NULL DEFAULT 0,
  duration_ms    int,
  source_kind    text,
  source_set_id  uuid,
  source_title   text
);

CREATE INDEX IF NOT EXISTS game_result_room_idx
  ON education.game_result (room_id) WHERE room_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS game_result_user_idx
  ON education.game_result (user_id, created_at DESC) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. education.game_badge — earned OUTCOME badges (once per user per key)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS education.game_badge (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  version         int  NOT NULL DEFAULT 1,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility      platform.visibility NOT NULL DEFAULT 'private',

  user_id    uuid NOT NULL,
  badge_key  text NOT NULL,   -- catalog key (features/education/engage/engine/badges.ts)
  earned_at  timestamptz NOT NULL DEFAULT now(),
  context    jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS game_badge_user_key_idx
  ON education.game_badge (user_id, badge_key) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. education.league_membership — opt-in, weekly, mastery-gain-scored
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS education.league_membership (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  version         int  NOT NULL DEFAULT 1,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility      platform.visibility NOT NULL DEFAULT 'private',

  user_id      uuid NOT NULL,
  week_start   date NOT NULL,       -- Monday of the league week (UTC)
  display_name text,
  opted_in     boolean NOT NULL DEFAULT true,
  mastery_gain numeric NOT NULL DEFAULT 0,
  games_played int NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS league_membership_user_week_idx
  ON education.league_membership (user_id, week_start) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS league_membership_week_idx
  ON education.league_membership (week_start, mastery_gain DESC) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. base FKs (canonical bar; mirrors fc_set) for all four tables
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['game_room','game_result','game_badge','league_membership'] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE education.%I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES iam.organizations(id)', t, t||'_organization_id_fkey');
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      EXECUTE format('ALTER TABLE education.%I ADD CONSTRAINT %I FOREIGN KEY (created_by) REFERENCES auth.users(id)', t, t||'_created_by_fkey');
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      EXECUTE format('ALTER TABLE education.%I ADD CONSTRAINT %I FOREIGN KEY (updated_by) REFERENCES auth.users(id)', t, t||'_updated_by_fkey');
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. canonical triggers for all four tables (identical to fc_set / study_media)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['game_room','game_result','game_badge','league_membership'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS _touch_row ON education.%I', t);
    EXECUTE format('CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON education.%I FOR EACH ROW EXECUTE FUNCTION platform._touch_row()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS _stamp_actor ON education.%I', t);
    EXECUTE format('CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON education.%I FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS _stamp_org_default ON education.%I', t);
    EXECUTE format('CREATE TRIGGER _stamp_org_default BEFORE INSERT ON education.%I FOR EACH ROW EXECUTE FUNCTION _stamp_org_default()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS _version_capture ON education.%I', t);
    EXECUTE format('CREATE TRIGGER _version_capture AFTER INSERT OR UPDATE OR DELETE ON education.%I FOR EACH ROW EXECUTE FUNCTION platform._version_capture(%L)', t, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. register entities + canonical RLS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, is_active)
SELECT * FROM (VALUES
  ('game_room','education','game_room','Game Room','private',false,true,true),
  ('game_result','education','game_result','Game Result','private',false,true,true),
  ('game_badge','education','game_badge','Game Badge','private',false,true,true),
  ('league_membership','education','league_membership','League Membership','private',false,true,true)
) AS v(token, schema_name, table_name, label, default_visibility, is_component, is_versioned, is_active)
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types e WHERE e.token = v.token);

SELECT iam.apply_rls('education','game_room','game_room','entity');
SELECT iam.apply_rls('education','game_result','game_result','entity');
SELECT iam.apply_rls('education','game_badge','game_badge','entity');
SELECT iam.apply_rls('education','league_membership','league_membership','entity');

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. SECURITY DEFINER cross-owner reads (joiners aren't the owner)
-- ─────────────────────────────────────────────────────────────────────────────

-- Find a joinable room by its code. Only lobby/active, not deleted. Returns the
-- minimal fields a joiner needs (never leaks other orgs' private data beyond
-- what a join requires). Auth required.
CREATE OR REPLACE FUNCTION education.game_room_by_code(p_code text)
RETURNS TABLE (
  id uuid, host_user_id uuid, join_code text, status text,
  source_kind text, source_set_id uuid, source_title text,
  config jsonb, started_at timestamptz, created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT r.id, r.host_user_id, r.join_code, r.status, r.source_kind,
         r.source_set_id, r.source_title, r.config, r.started_at, r.created_at
  FROM education.game_room r
  WHERE upper(r.join_code) = upper(p_code)
    AND r.status IN ('lobby','active')
    AND r.deleted_at IS NULL
    AND auth.uid() IS NOT NULL
  ORDER BY r.created_at DESC
  LIMIT 1;
$$;

-- Read the finalized result rows for a room (any participant may read the
-- scoreboard of a room they were in — enforced by requiring a matching own
-- result row OR being the host). Auth required.
CREATE OR REPLACE FUNCTION education.game_room_players(p_room_id uuid)
RETURNS TABLE (
  user_id uuid, display_name text, score int, correct_count int,
  answered_count int, best_streak int, mastery_gain numeric,
  currency_earned int, created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT gr.user_id, gr.display_name, gr.score, gr.correct_count,
         gr.answered_count, gr.best_streak, gr.mastery_gain,
         gr.currency_earned, gr.created_at
  FROM education.game_result gr
  WHERE gr.room_id = p_room_id
    AND gr.deleted_at IS NULL
    AND (
      EXISTS (SELECT 1 FROM education.game_result me
              WHERE me.room_id = p_room_id AND me.user_id = auth.uid() AND me.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM education.game_room rm
                 WHERE rm.id = p_room_id AND rm.host_user_id = auth.uid())
    )
  ORDER BY gr.score DESC, gr.mastery_gain DESC;
$$;

-- The current-week league leaderboard (opted-in members, mastery-gain desc).
-- Cross-user read → SECURITY DEFINER. Only exposes opted-in rows + display name.
CREATE OR REPLACE FUNCTION education.league_leaderboard(p_week_start date)
RETURNS TABLE (
  user_id uuid, display_name text, mastery_gain numeric, games_played int, is_me boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT lm.user_id, lm.display_name, lm.mastery_gain, lm.games_played,
         (lm.user_id = auth.uid()) AS is_me
  FROM education.league_membership lm
  WHERE lm.week_start = p_week_start
    AND lm.opted_in = true
    AND lm.deleted_at IS NULL
    AND auth.uid() IS NOT NULL
  ORDER BY lm.mastery_gain DESC, lm.games_played DESC
  LIMIT 100;
$$;

-- Add a player's game outcome to their weekly league standing (upsert-add).
-- Only affects the caller's OWN row (auth.uid()); no-op if they never opted in.
CREATE OR REPLACE FUNCTION education.league_add_result(
  p_mastery_gain numeric, p_display_name text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_week date := (date_trunc('week', (now() at time zone 'utc')::date))::date;
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  UPDATE education.league_membership
     SET mastery_gain = mastery_gain + greatest(p_mastery_gain, 0),
         games_played = games_played + 1,
         display_name = coalesce(p_display_name, display_name),
         updated_at = now()
   WHERE user_id = v_user AND week_start = v_week AND opted_in = true AND deleted_at IS NULL;
END $$;

GRANT EXECUTE ON FUNCTION education.game_room_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION education.game_room_players(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION education.league_leaderboard(date) TO authenticated;
GRANT EXECUTE ON FUNCTION education.league_add_result(numeric, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. HEALTHY STREAK FORGIVENESS (hub-wide) — extend study_streak + rewrite the
--     shared bump trigger to honor freezes + planned rest days.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE education.study_streak
  ADD COLUMN IF NOT EXISTS freezes_available int NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS freezes_used int NOT NULL DEFAULT 0,
  -- ISO dow of planned rest days (0=Sun … 6=Sat) that never break a streak
  ADD COLUMN IF NOT EXISTS rest_weekdays smallint[] NOT NULL DEFAULT '{}',
  -- dates a freeze auto-covered (for the "you used a freeze" UI)
  ADD COLUMN IF NOT EXISTS frozen_dates date[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Max freezes a learner can bank (kept generous — anti-Duolingo).
-- Earn one freeze per 7 days of active streak, capped here.
CREATE OR REPLACE FUNCTION education.bump_study_streak()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_user  uuid := new.created_by;
  v_today date := (now() at time zone 'utc')::date;
  v_row   education.study_streak%rowtype;
  v_gap   int;
  v_cursor date;
  v_missed_nonrest int := 0;
  v_missed_days date[] := '{}';
  v_new_streak int;
  v_max_freezes constant int := 5;
BEGIN
  IF v_user IS NULL THEN RETURN new; END IF;

  SELECT * INTO v_row FROM education.study_streak WHERE user_id = v_user FOR UPDATE;

  -- First-ever activity.
  IF v_row.user_id IS NULL THEN
    INSERT INTO education.study_streak
      (user_id, organization_id, current_streak, longest_streak, last_active_date)
    VALUES (v_user, new.organization_id, 1, 1, v_today);
    RETURN new;
  END IF;

  -- Already counted today.
  IF v_row.last_active_date = v_today THEN
    RETURN new;
  END IF;

  -- Consecutive day — simple increment.
  IF v_row.last_active_date = v_today - 1 THEN
    v_new_streak := v_row.current_streak + 1;
    UPDATE education.study_streak
       SET current_streak = v_new_streak,
           longest_streak = greatest(v_row.longest_streak, v_new_streak),
           last_active_date = v_today,
           -- earn a freeze every 7 days, capped
           freezes_available = LEAST(v_max_freezes,
             v_row.freezes_available + (CASE WHEN v_new_streak % 7 = 0 THEN 1 ELSE 0 END)),
           updated_at = now()
     WHERE user_id = v_user;
    RETURN new;
  END IF;

  -- There is a gap. Walk each missed day; a day is FORGIVEN if it's a planned
  -- rest weekday. Non-rest missed days must be covered by available freezes,
  -- else the streak breaks.
  IF v_row.last_active_date IS NOT NULL AND v_row.last_active_date < v_today - 1 THEN
    v_cursor := v_row.last_active_date + 1;
    WHILE v_cursor < v_today LOOP
      -- extract(dow) → 0=Sun … 6=Sat, matches rest_weekdays convention
      IF NOT (extract(dow FROM v_cursor)::smallint = ANY (v_row.rest_weekdays)) THEN
        v_missed_nonrest := v_missed_nonrest + 1;
        v_missed_days := array_append(v_missed_days, v_cursor);
      END IF;
      v_cursor := v_cursor + 1;
    END LOOP;

    IF v_missed_nonrest <= v_row.freezes_available THEN
      -- Streak SURVIVES: consume freezes for the non-rest gap days, continue +1.
      v_new_streak := v_row.current_streak + 1;
      UPDATE education.study_streak
         SET current_streak = v_new_streak,
             longest_streak = greatest(v_row.longest_streak, v_new_streak),
             last_active_date = v_today,
             freezes_used = v_row.freezes_used + v_missed_nonrest,
             freezes_available = LEAST(v_max_freezes,
               (v_row.freezes_available - v_missed_nonrest)
               + (CASE WHEN v_new_streak % 7 = 0 THEN 1 ELSE 0 END)),
             frozen_dates = (v_row.frozen_dates || v_missed_days),
             updated_at = now()
       WHERE user_id = v_user;
      RETURN new;
    END IF;
  END IF;

  -- Gap too large to forgive — reset to 1 (a fresh, guilt-free start).
  UPDATE education.study_streak
     SET current_streak = 1,
         longest_streak = greatest(v_row.longest_streak, 1),
         last_active_date = v_today,
         updated_at = now()
   WHERE user_id = v_user;
  RETURN new;
END;
$fn$;

-- User-set rest weekdays (their own row only). Auth required.
CREATE OR REPLACE FUNCTION education.set_streak_rest_weekdays(p_weekdays smallint[])
RETURNS education.study_streak
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row education.study_streak%rowtype;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  -- validate 0..6
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_weekdays,'{}')) d WHERE d < 0 OR d > 6) THEN
    RAISE EXCEPTION 'weekdays must be 0..6';
  END IF;
  INSERT INTO education.study_streak (user_id, organization_id, rest_weekdays)
  VALUES (v_user, (SELECT id FROM iam.organizations WHERE created_by = v_user AND is_personal = true LIMIT 1), coalesce(p_weekdays,'{}'))
  ON CONFLICT (user_id) DO UPDATE SET rest_weekdays = excluded.rest_weekdays, updated_at = now();
  SELECT * INTO v_row FROM education.study_streak WHERE user_id = v_user;
  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION education.set_streak_rest_weekdays(smallint[]) TO authenticated;
