-- edu_item_type_flashcard_to_fc_card
--
-- `education.item_mastery` / `education.study_attempt` carried TWO spellings for
-- the same thing: the canonical `fc_card` and the pre-rename `flashcard`. The
-- split rendered two "Flashcards" lanes on the Education home ("27 due" above
-- "3 due") and was patched at read time with a `canonicalItemType()` alias in
-- `features/education/study/dashboard/nextActions.ts`. This migration removes
-- the reason for the alias:
--
--   1. `public.game_record_answer` — the ONLY remaining writer of 'flashcard'
--      (three references: the adaptive-queue membership check, the prior-mastery
--      read, and the `study_record_attempt` call) — now writes 'fc_card'.
--      This also fixes a live defect: the game client builds its adaptive queue
--      from `fc_card` mastery (`GAME_ITEM_TYPE`), so the RPC's 'flashcard'
--      queue check rejected cards the client had legitimately offered.
--   2. The existing rows are folded onto 'fc_card'. Where a learner already had
--      BOTH spellings for one card, the counters are merged (attempt/correct/
--      lapses summed, streak maxed, FSRS scheduling state taken from whichever
--      row was attempted last) rather than tripping
--      `item_mastery_owner_item_uniq (created_by, item_type, item_id)`.
--
-- Idempotent: re-running is a no-op once no 'flashcard' rows remain.

CREATE OR REPLACE FUNCTION public.game_record_answer(
  p_session_id uuid,
  p_item_id uuid,
  p_selected_answer text,
  p_expected_result text,
  p_difficulty numeric,
  p_stability numeric,
  p_due_at timestamp with time zone,
  p_retrievability numeric,
  p_lapses integer
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'education', 'platform', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_session education.study_session;
  v_card education.fc_card;
  v_result text;
  v_previous_at timestamptz;
  v_latency_ms integer;
  v_payload jsonb;
  v_prior_mastery education.item_mastery;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'game_record_answer requires authentication' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR p_item_id IS NULL OR p_selected_answer IS NULL THEN
    RAISE EXCEPTION 'A game session, item, and selected answer are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'education-game-answer-' || p_session_id::text, 0
  ));

  SELECT * INTO v_session
    FROM education.study_session s
   WHERE s.id = p_session_id
     AND s.created_by = v_user
     AND s.mode = 'game'
     AND s.status = 'active'
     AND s.deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game session is missing, foreign, or no longer active'
      USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM education.study_attempt a
       WHERE a.session_id = p_session_id AND a.created_by = v_user
         AND a.method = 'game' AND a.deleted_at IS NULL) >= 100 THEN
    RAISE EXCEPTION 'Game attempt limit exceeded';
  END IF;
  IF EXISTS (
    SELECT 1 FROM education.study_attempt a
     WHERE a.session_id = p_session_id AND a.created_by = v_user
       AND a.item_id = p_item_id AND a.method = 'game' AND a.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This item already has an answer in the game session'
      USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_card
    FROM education.fc_card c
   WHERE c.id = p_item_id AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The game card does not exist';
  END IF;

  -- A set round accepts only active members of that set. An adaptive round
  -- accepts only items already present in this learner's mastery queue.
  IF v_session.source_set_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM platform.associations a
       WHERE a.source_type = 'fc_card' AND a.source_id = p_item_id
         AND a.target_type = 'fc_set' AND a.target_id = v_session.source_set_id
         AND a.role = 'member' AND a.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'The card is not part of this game session source';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM education.item_mastery m
     WHERE m.created_by = v_user AND m.item_type = 'fc_card'
       AND m.item_id = p_item_id AND m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Adaptive games accept only cards from the learner queue';
  END IF;

  v_result := CASE
    WHEN lower(btrim(p_selected_answer)) = lower(btrim(v_card.back)) THEN 'correct'
    ELSE 'incorrect'
  END;
  IF p_expected_result NOT IN ('correct', 'incorrect')
     OR p_expected_result <> v_result THEN
    RAISE EXCEPTION 'The submitted grade does not match the canonical card answer'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_prior_mastery
    FROM education.item_mastery m
   WHERE m.created_by = v_user
     AND m.item_type = 'fc_card'
     AND m.item_id = p_item_id
     AND m.deleted_at IS NULL;
  IF p_difficulty NOT BETWEEN 1 AND 10
     OR p_stability <= 0 OR p_stability > 36500
     OR p_due_at <= now() OR p_due_at > now() + interval '10 years'
     OR p_retrievability NOT BETWEEN 0 AND 1
     OR p_lapses < 0 OR p_lapses > 10000
     OR p_lapses < coalesce(v_prior_mastery.lapses, 0)
     OR (v_result = 'incorrect' AND p_lapses <> coalesce(v_prior_mastery.lapses, 0) + 1)
     OR (v_result = 'correct' AND p_lapses <> coalesce(v_prior_mastery.lapses, 0))
     OR (v_result = 'correct' AND p_stability < coalesce(v_prior_mastery.stability, 0)) THEN
    RAISE EXCEPTION 'The FSRS transition is inconsistent with the server-graded answer'
      USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(
           max(coalesce(a.reviewed_at, a.created_at)),
           v_session.started_at,
           v_session.created_at
         )
    INTO v_previous_at
    FROM education.study_attempt a
   WHERE a.session_id = p_session_id
     AND a.created_by = v_user
     AND a.method = 'game'
     AND a.deleted_at IS NULL;
  v_latency_ms := greatest(1, least(120000,
    round(extract(epoch FROM (clock_timestamp() - v_previous_at)) * 1000)::integer
  ));

  PERFORM set_config('education.game_authority_session', p_session_id::text, true);
  v_payload := public.study_record_attempt(
    p_item_type => 'fc_card',
    p_item_id => p_item_id,
    p_session_id => p_session_id,
    p_method => 'game',
    p_result => v_result,
    p_response_kind => 'selected',
    p_latency_ms => v_latency_ms,
    p_difficulty => p_difficulty,
    p_stability => p_stability,
    p_due_at => p_due_at,
    p_retrievability => p_retrievability,
    p_lapses => p_lapses
  );
  PERFORM set_config('education.game_authority_session', '', true);

  RETURN v_payload || jsonb_build_object('result', v_result, 'latency_ms', v_latency_ms);
END;
$function$;

-- ─── Data: fold 'flashcard' onto 'fc_card' ──────────────────────────────────

-- 1. Merge where the learner already has BOTH spellings for one card.
WITH pairs AS (
  SELECT f.id AS alias_id, c.id AS canon_id,
         coalesce(c.attempt_count, 0) + coalesce(f.attempt_count, 0) AS attempt_count,
         coalesce(c.correct_count, 0) + coalesce(f.correct_count, 0) AS correct_count,
         coalesce(c.lapses, 0) + coalesce(f.lapses, 0)               AS lapses,
         greatest(coalesce(c.streak, 0), coalesce(f.streak, 0))      AS streak,
         -- Scheduling state belongs to whichever row was attempted last.
         (f.last_attempt_at IS NOT NULL
          AND (c.last_attempt_at IS NULL OR f.last_attempt_at > c.last_attempt_at)) AS alias_newer,
         f.mastery_score AS f_mastery_score, f.box AS f_box, f.interval_days AS f_interval_days,
         f.ease AS f_ease, f.difficulty AS f_difficulty, f.stability AS f_stability,
         f.retrievability AS f_retrievability, f.last_review AS f_last_review,
         f.due_at AS f_due_at, f.last_result AS f_last_result,
         f.last_attempt_at AS f_last_attempt_at, f.struggle_flag AS f_struggle_flag
    FROM education.item_mastery f
    JOIN education.item_mastery c
      ON c.item_type = 'fc_card'
     AND c.created_by = f.created_by
     AND c.item_id = f.item_id
   WHERE f.item_type = 'flashcard'
)
UPDATE education.item_mastery c
   SET attempt_count = p.attempt_count,
       correct_count = p.correct_count,
       lapses        = p.lapses,
       streak        = p.streak,
       mastery_score  = CASE WHEN p.alias_newer THEN p.f_mastery_score  ELSE c.mastery_score  END,
       box            = CASE WHEN p.alias_newer THEN p.f_box            ELSE c.box            END,
       interval_days  = CASE WHEN p.alias_newer THEN p.f_interval_days  ELSE c.interval_days  END,
       ease           = CASE WHEN p.alias_newer THEN p.f_ease           ELSE c.ease           END,
       difficulty     = CASE WHEN p.alias_newer THEN p.f_difficulty     ELSE c.difficulty     END,
       stability      = CASE WHEN p.alias_newer THEN p.f_stability      ELSE c.stability      END,
       retrievability = CASE WHEN p.alias_newer THEN p.f_retrievability ELSE c.retrievability END,
       last_review    = CASE WHEN p.alias_newer THEN p.f_last_review    ELSE c.last_review    END,
       due_at         = CASE WHEN p.alias_newer THEN p.f_due_at         ELSE c.due_at         END,
       last_result    = CASE WHEN p.alias_newer THEN p.f_last_result    ELSE c.last_result    END,
       last_attempt_at = greatest(c.last_attempt_at, p.f_last_attempt_at),
       struggle_flag  = c.struggle_flag OR coalesce(p.f_struggle_flag, false),
       metadata = coalesce(c.metadata, '{}'::jsonb)
                  || jsonb_build_object('merged_from_flashcard_row', p.alias_id)
  FROM pairs p
 WHERE c.id = p.canon_id;

-- The merged alias rows are gone for good — their counters now live on the
-- canonical row (no-legacy: no shadow twin left behind).
DELETE FROM education.item_mastery f
 WHERE f.item_type = 'flashcard'
   AND EXISTS (
     SELECT 1 FROM education.item_mastery c
      WHERE c.item_type = 'fc_card'
        AND c.created_by = f.created_by
        AND c.item_id = f.item_id
   );

-- 2. Rename the rest.
UPDATE education.item_mastery SET item_type = 'fc_card' WHERE item_type = 'flashcard';

-- 3. The immutable attempt ledger carries the same alias.
UPDATE education.study_attempt SET item_type = 'fc_card' WHERE item_type = 'flashcard';

DO $$
DECLARE v_m integer; v_a integer;
BEGIN
  SELECT count(*) INTO v_m FROM education.item_mastery WHERE item_type = 'flashcard';
  SELECT count(*) INTO v_a FROM education.study_attempt WHERE item_type = 'flashcard';
  IF v_m > 0 OR v_a > 0 THEN
    RAISE EXCEPTION 'flashcard alias rows remain: % mastery, % attempts', v_m, v_a;
  END IF;
  RAISE NOTICE 'edu_item_type_flashcard_to_fc_card: OK';
END $$;
