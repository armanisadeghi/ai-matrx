-- Study-kit coverage knobs (feature `education.study_kit`).
--
-- WHY: every study-kit generator used to send the whole source in ONE agent call
-- with a hardcoded count (deck 15, quiz 10, practice test 20, everything else
-- unbounded-but-unsteered). A 77-slide chemistry deck came back as 10 flashcards,
-- 5 key points, 16 mind-map nodes and 10 quiz questions, all drawn from the front
-- of the document. `features/education/convert/coverage.ts` replaces that with
-- segment-and-fan-out; these are the numbers it runs on.
--
-- AGENT DECISION (2026-08-21, per policies/limits-are-knobs-agents-set-them.md):
-- the starting values are calibrated against the reported run - a 23.5k-character,
-- 77-slide source. At 3000 chars per segment that is 8 segments; at 8 cards per
-- segment, ~64 cards, which is the size a student would call "it covered my deck".
-- Every value is provisional (set_by='agent') and carries a 45-day review.
--
-- Re-running this never clobbers a human's value: `on conflict` refreshes only
-- metadata once `set_by = 'human'`.
--
-- Applied live via Supabase MCP apply_migration on 2026-08-21.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit,
   min_value, max_value, label, description, set_by, basis, review_due)
values
  ('education.study_kit', 'segment_target_chars',
   '3000'::jsonb, '3000'::jsonb, 'integer', 'characters', 500, 20000,
   'Coverage segment size',
   'How much source text one generator call is responsible for. Smaller means better coverage and more calls; larger means fewer calls and more skipped material.',
   'agent',
   'A model reliably attends to ~3k characters (~750 tokens) of dense study material at a time. The reported 23.5k-character, 77-slide source becomes 8 segments, so no slide sits in the tail of a call that already had enough to say.',
   current_date + 45),

  ('education.study_kit', 'max_segments',
   '40'::jsonb, '40'::jsonb, 'integer', 'segments', 1, 200,
   'Maximum coverage segments',
   'Blast-radius backstop on how many agent calls one artifact may fan out to. A source with more sections is re-packed evenly into this many, never truncated.',
   'agent',
   'At 3000 chars per segment this covers a ~120k-character source (a full textbook chapter set) in one kit. Beyond that the per-run cost and wall-clock stop being reasonable for an interactive flow, so we pack denser rather than drop the tail.',
   current_date + 45),

  ('education.study_kit', 'segment_concurrency',
   '4'::jsonb, '4'::jsonb, 'integer', 'calls', 1, 16,
   'Concurrent segment calls',
   'How many segment generations run at once within a single artifact. The kit also fans out across targets, so the real in-flight count is this times the number of selected targets.',
   'agent',
   'Seven kit targets times four segments is 28 concurrent agent runs, which is the most the execution system absorbs without the student watching everything slow down together. Raise only with rate-limit headroom measured.',
   current_date + 45),

  ('education.study_kit', 'max_items_total',
   '150'::jsonb, '150'::jsonb, 'integer', 'items', 5, 1000,
   'Maximum items per artifact',
   'Ceiling on cards / questions / mnemonics / key points a single generated artifact may contain, however large the source or however much the student asks for.',
   'agent',
   'A 150-card deck is already more than a student reviews in a sitting; past that the honest answer is a second deck, not a longer one. Set well above the ~64 a large source produces so the ceiling is a backstop, not the operating point.',
   current_date + 45),

  ('education.study_kit', 'min_items_total',
   '6'::jsonb, '6'::jsonb, 'integer', 'items', 1, 100,
   'Minimum items per artifact',
   'Floor so a short paste still produces a usable artifact rather than one or two items.',
   'agent',
   'Below six items a deck or quiz is not worth opening. A source too thin to support six real items still returns fewer, because the grounding rule forbids padding: this is a floor on what we ASK for, not on what we save.',
   current_date + 45),

  ('education.study_kit', 'items_per_segment_deck',
   '8'::jsonb, '8'::jsonb, 'integer', 'cards', 1, 50,
   'Flashcards per segment',
   'Cards requested for each coverage segment at standard depth.',
   'agent',
   'Eight cards per 3000 characters is roughly one card per lecture slide, which is the density students hand-build. The reported 77-slide source yields ~64 cards instead of the 10 it produced.',
   current_date + 45),

  ('education.study_kit', 'items_per_segment_quiz',
   '5'::jsonb, '5'::jsonb, 'integer', 'questions', 1, 50,
   'Quiz questions per segment',
   'Questions requested for each coverage segment at standard depth.',
   'agent',
   'A quiz is a check, not a full sweep: five per segment (~40 for a large source) is a sitting-length quiz that still touches every section.',
   current_date + 45),

  ('education.study_kit', 'items_per_segment_practice_test',
   '7'::jsonb, '7'::jsonb, 'integer', 'questions', 1, 50,
   'Practice-test questions per segment',
   'Questions requested for each coverage segment at standard depth.',
   'agent',
   'A practice test should feel like the real exam, so it runs denser than the quiz: ~56 questions over a large source, in exam territory.',
   current_date + 45),

  ('education.study_kit', 'items_per_segment_memory_aid',
   '3'::jsonb, '3'::jsonb, 'integer', 'aids', 1, 20,
   'Memory aids per segment',
   'Mnemonics / analogies requested for each coverage segment at standard depth.',
   'agent',
   'Memory aids are only worth having for material that actually resists recall; three per section keeps them selective while still reaching every section, instead of the four total the whole document used to get.',
   current_date + 45),

  ('education.study_kit', 'items_per_segment_summary',
   '4'::jsonb, '4'::jsonb, 'integer', 'key points', 1, 20,
   'Summary key points per segment',
   'Key points requested for each coverage segment at standard depth.',
   'agent',
   'Four points per section is a revision sheet a student can read end to end: ~32 points for a large source, against the 5 the whole 77-slide deck used to get.',
   current_date + 45),

  ('education.study_kit', 'items_per_segment_mind_map',
   '7'::jsonb, '7'::jsonb, 'integer', 'nodes', 1, 40,
   'Mind-map nodes per segment',
   'Nodes requested for each coverage segment at standard depth.',
   'agent',
   'Seven nodes per section gives a branch with real structure under it rather than a single label, and keeps the whole map (~56 nodes for a large source) legible.',
   current_date + 45)

on conflict (feature, key) do update set
  default_value = excluded.default_value,
  value_type    = excluded.value_type,
  unit          = excluded.unit,
  min_value     = excluded.min_value,
  max_value     = excluded.max_value,
  label         = excluded.label,
  description   = excluded.description,
  basis         = excluded.basis,
  -- Never clobber a human's value or reset their review obligation.
  value      = case when platform.feature_knob.set_by = 'human'
                    then platform.feature_knob.value else excluded.value end,
  review_due = case when platform.feature_knob.set_by = 'human'
                    then platform.feature_knob.review_due else excluded.review_due end;

-- Added 2026-08-21 (applied live as edu_study_kit_max_source_chars_knob): the
-- ingest ceiling. Was a hardcoded 48,000 in useIngest.ts because the whole
-- source went into ONE model call; segmentation removed that constraint, so it
-- is now a blast-radius backstop set for a real textbook chapter set.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit,
   min_value, max_value, label, description, set_by, basis, review_due)
values
  ('education.study_kit', 'max_source_chars',
   '400000'::jsonb, '400000'::jsonb, 'integer', 'characters', 1000, 5000000,
   'Maximum source length read into a kit',
   'How much extracted text one study kit will read from an uploaded document. Anything past this is not read, and the student is told so.',
   'agent',
   'This was a hardcoded 48,000 because the whole source went into ONE model call, so a 90-page PDF was silently cut to roughly its first third. Generation is now segmented and no model sees the whole document at once, so the ceiling is a blast-radius backstop rather than a context limit: 400k characters is about 200 dense pages.',
   current_date + 45)
on conflict (feature, key) do update set
  default_value = excluded.default_value,
  value_type    = excluded.value_type,
  unit          = excluded.unit,
  min_value     = excluded.min_value,
  max_value     = excluded.max_value,
  label         = excluded.label,
  description   = excluded.description,
  basis         = excluded.basis,
  value      = case when platform.feature_knob.set_by = 'human'
                    then platform.feature_knob.value else excluded.value end,
  review_due = case when platform.feature_knob.set_by = 'human'
                    then platform.feature_knob.review_due else excluded.review_due end;
