-- google_youtube_preview_knobs — the one posture behind the publish-nothing
-- pre-upload check (google-native PLAN §7, unit U-M3).
--
--   google.youtube.preview_target_keyword_required = true
--
-- WHAT IT DECIDES. The pre-upload check scores a title, a description, tags and
-- a thumbnail against a TARGET KEYWORD: keyword in the title and how early,
-- keyword in the first 150 characters of the description, tag count and tag
-- coverage of the keyword. With this on, the check REFUSES to score until a
-- target keyword is typed and says so; with it off, it scores only the checks
-- that stand on their own (title length, description length, tag count,
-- thumbnail legibility) and prints, on every keyword-dependent row, that it was
-- not measured and why.
--
-- WHY A KNOB AND NOT A CONSTANT (Law 6,
-- `common-docs/policies/limits-are-knobs-agents-set-them.md`): "must you name a
-- target keyword before we grade you" is a posture about how an organization
-- works, not a fact about YouTube. An SEO agency publishing against a topical
-- map always has one; a brand posting a customer story often does not, and for
-- them a hard stop would be a screen that refuses to do the four things it
-- could still do.
--
-- STARTING VALUE `true`, AND WHY. The champions both make the keyword the spine
-- of the check: TubeBuddy's Keyword Explorer and its SEO checklist grade a
-- video against a chosen keyword, and vidIQ's scorecard does the same — neither
-- prints a score with no keyword, because half the checks would silently not be
-- measured and the number would read as a verdict on the whole video. A scored
-- checklist that quietly drops four of its eight rows is exactly the "screen
-- that lies" law 4 forbids, so the default is the honest one and the looser
-- posture is one switch away.
--
-- Overridable by organization only (not per user): whether a keyword is
-- required is how a team works, not a personal preference, and two people on
-- one brand grading the same video differently is the drift a knob exists to
-- prevent. `override_direction` is `any` — either posture is legitimate.
--
-- Reader: `features/marketing/youtube/knobs.ts`
-- (`useTargetKeywordRequired`, through `useEffectiveKnob` → the ONE ladder read
-- `platform.knob_resolve`). A MISSING row RAISES by design; the reader turns
-- that into a visible stand-in naming this file and falls back to the value
-- documented here — never an invented one.
--
-- Agent-set under blind approval, 2026-09-19; Arman has NOT reviewed it.
-- Review due 2026-10-31. Idempotent (`value` is never overwritten once a human
-- has set it).
--
-- NOT APPLIED by the session that wrote it: apply with
--   pnpm db:apply migrations/google_youtube_preview_knobs.sql
-- Ledger: public._schema_migrations (source 'matrx-frontend').

INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   allowed_values, label, description, set_by, basis, review_due,
   overridable_by, override_direction)
VALUES
  ('google.youtube', 'preview_target_keyword_required',
   'true'::jsonb, 'true'::jsonb, 'boolean', NULL, NULL, NULL, NULL,
   'Require a target keyword before scoring a video',
   'The pre-upload check grades a video''s title, description, tags and thumbnail before you publish it. With this on, it asks for the keyword you want the video to rank for first, and grades nothing until it has one. With it off, it grades what it can and says on every keyword row that it was not measured.',
   'agent',
   'TubeBuddy and vidIQ both grade a video against a chosen keyword and neither prints a score without one — four of the eight checks are keyword-dependent, so a score computed without it would silently drop half its rows and still read as a verdict.',
   DATE '2026-10-31',
   ARRAY['organization'], 'any')
ON CONFLICT (feature, key) DO UPDATE SET
  default_value      = EXCLUDED.default_value,
  value_type         = EXCLUDED.value_type,
  allowed_values     = EXCLUDED.allowed_values,
  label              = EXCLUDED.label,
  description        = EXCLUDED.description,
  basis              = EXCLUDED.basis,
  overridable_by     = EXCLUDED.overridable_by,
  override_direction = EXCLUDED.override_direction,
  value      = CASE WHEN platform.feature_knob.set_by = 'human'
                    THEN platform.feature_knob.value ELSE EXCLUDED.value END,
  review_due = CASE WHEN platform.feature_knob.set_by = 'human'
                    THEN platform.feature_knob.review_due ELSE EXCLUDED.review_due END,
  updated_at = now();

DO $assert$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM platform.feature_knob
     WHERE feature = 'google.youtube' AND key = 'preview_target_keyword_required'
  ) THEN
    RAISE EXCEPTION 'google.youtube.preview_target_keyword_required was not registered';
  END IF;
END $assert$;
