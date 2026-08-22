-- ============================================================================
-- study_pack_v2 — content-ir kinds `lesson_script_set` (+ nested child
-- `lesson_script_section`) and the REAL `study_pack_set` composed schema.
--
-- 1. `lesson_script_set` / `lesson_script_section`: the spoken lessons of a
--    Study Pack — TTS-ready narration per section, with duration and key
--    points. TS-OWNED: `data`, `emitted_block_schema`, `emitted_json_schema`
--    and `emitted_fingerprint` are CONVERTER-EMITTED (emit-kind-rows.ts over
--    features/content-ir/kinds/lesson-scripts.ts, 2026-08-22) — never
--    hand-written.
-- 2. `study_pack_set` v5: the v4 "generic structured root" schema
--    (`included_sets` anyOf with the dangling `flashcard_set_beta` ref) is
--    replaced by the composed shape: title/topic/audience + `notes`
--    (study_notes) + `flashcards` (flashcard_set) + `quiz` (quiz_set) +
--    `lessons` (lesson_script_set) + open `sources_summary`. Emitted from
--    features/content-ir/kinds/study-pack.ts by the same converters. The
--    stale `included_sets` edges are removed; the four member edges replace
--    them. The web/output component row flips from `generic_structured` to
--    the real composed renderer (`study_pack` → StudyPackBlock, which
--    DELEGATES each member to its own kind's component).
-- 3. `kind_definition.metadata.loading_component` slugs: lesson_script_set →
--    'document', study_pack_set → 'document', flashcard_set → 'deck',
--    study_notes → 'list' (real-time render for the education kinds).
--
-- kind_example rows: `validation_status` is deliberately NOT written — the
-- `_recompute_validation` trigger DERIVES it on every write.
--
-- is_active is deliberately NOT touched here: activation belongs to
-- `content_ir.set_kind_activation` (run separately after this applies).
-- Idempotent on business keys; re-apply is safe.
-- ============================================================================

BEGIN;

-- ── 1. kind_definition: the lesson child first (the set's edge resolves) ────

INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data,
   emitted_block_schema, emitted_json_schema, emitted_fingerprint,
   is_active, organization_id, visibility, metadata)
VALUES
  (
    'lesson_script_section',
    'Lesson Script Section',
    'ts',
    $J$[{"name":"heading","required":true,"description":"What this part of the lesson covers — a short, plain title.","type":"string"},{"name":"script","required":true,"description":"The full narration for this section, written to be read aloud — complete sentences, no markup, ready for TTS.","type":"string"},{"name":"duration_seconds","description":"Roughly how long this section runs when spoken, in seconds.","type":"number"},{"name":"key_points","description":"The points this section must land, one per item — each a complete statement.","type":"string[]"}]$J$::jsonb,
    $J${"type":"object","properties":{"heading":{"type":"string","description":"What this part of the lesson covers — a short, plain title."},"script":{"type":"string","description":"The full narration for this section, written to be read aloud — complete sentences, no markup, ready for TTS."},"duration_seconds":{"type":"number","description":"Roughly how long this section runs when spoken, in seconds."},"key_points":{"type":"array","items":{"type":"string"},"description":"The points this section must land, one per item — each a complete statement."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"lesson_script_section"}},"required":["__kind","heading","script"],"additionalProperties":false}$J$::jsonb,
    $J${"type":"object","properties":{"heading":{"type":"string","description":"What this part of the lesson covers — a short, plain title."},"script":{"type":"string","description":"The full narration for this section, written to be read aloud — complete sentences, no markup, ready for TTS."},"duration_seconds":{"type":"number","description":"Roughly how long this section runs when spoken, in seconds."},"key_points":{"type":"array","items":{"type":"string"},"description":"The points this section must land, one per item — each a complete statement."}},"required":["heading","script"],"additionalProperties":false}$J$::jsonb,
    'kh-6cawu01bes8bm',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public',
    $J${"family": "education", "description": "One spoken passage of a lesson — its heading, the full TTS-ready narration, roughly how long it runs, and the points it must land."}$J$::jsonb
  ),
  (
    'lesson_script_set',
    'Lesson Scripts',
    'ts',
    $J$[{"name":"title","required":true,"description":"What this set of lessons teaches.","type":"string"},{"name":"overview","description":"The whole lesson in one paragraph — what a listener gets before any section plays.","type":"string"},{"name":"sections","required":true,"description":"The lessons themselves, in teaching order.","type":"array"},{"name":"additionalDetails","type":"inline_object","fields":[],"open":true}]$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string","description":"What this set of lessons teaches."},"overview":{"type":"string","description":"The whole lesson in one paragraph — what a listener gets before any section plays."},"sections":{"type":"array","items":{"$ref":"#/$defs/lesson_script_section"},"description":"The lessons themselves, in teaching order."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"lesson_script_set"}},"required":["__kind","title","sections"],"additionalProperties":false,"$defs":{"lesson_script_section":{"type":"object","properties":{"heading":{"type":"string","description":"What this part of the lesson covers — a short, plain title."},"script":{"type":"string","description":"The full narration for this section, written to be read aloud — complete sentences, no markup, ready for TTS."},"duration_seconds":{"type":"number","description":"Roughly how long this section runs when spoken, in seconds."},"key_points":{"type":"array","items":{"type":"string"},"description":"The points this section must land, one per item — each a complete statement."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"lesson_script_section"}},"required":["__kind","heading","script"],"additionalProperties":false}}}$J$::jsonb,
    $J${"type":"object","properties":{"title":{"type":"string","description":"What this set of lessons teaches."},"overview":{"type":"string","description":"The whole lesson in one paragraph — what a listener gets before any section plays."},"sections":{"type":"array","items":{"$ref":"#/$defs/lesson_script_section"},"description":"The lessons themselves, in teaching order."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true}},"required":["title","sections"],"additionalProperties":false,"$defs":{"lesson_script_section":{"type":"object","properties":{"heading":{"type":"string","description":"What this part of the lesson covers — a short, plain title."},"script":{"type":"string","description":"The full narration for this section, written to be read aloud — complete sentences, no markup, ready for TTS."},"duration_seconds":{"type":"number","description":"Roughly how long this section runs when spoken, in seconds."},"key_points":{"type":"array","items":{"type":"string"},"description":"The points this section must land, one per item — each a complete statement."}},"required":["heading","script"],"additionalProperties":false}}}$J$::jsonb,
    '13i-eovqvu31fbg',
    false,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public',
    $J${"family": "education", "loading_component": "document", "description": "A set of spoken lessons — ordered narration scripts, each section TTS-ready with its heading, duration and key points."}$J$::jsonb
  )
ON CONFLICT (kind) WHERE deleted_at IS NULL DO UPDATE SET
  label = EXCLUDED.label,
  authoring_owner = EXCLUDED.authoring_owner,
  data = EXCLUDED.data,
  emitted_block_schema = EXCLUDED.emitted_block_schema,
  emitted_json_schema = EXCLUDED.emitted_json_schema,
  emitted_fingerprint = EXCLUDED.emitted_fingerprint,
  visibility = EXCLUDED.visibility,
  metadata = EXCLUDED.metadata,
  updated_at = now();
  -- is_active deliberately NOT updated: activation belongs to the dual gate.

-- ── 2. study_pack_set v5: the composed schema replaces the v4 root ──────────

UPDATE content_ir.kind_definition SET
  data = $J$[{"name":"title","required":true,"description":"What this study pack covers.","type":"string"},{"name":"topic","description":"The subject the pack was generated from.","type":"string"},{"name":"audience","description":"Who the pack was written for.","type":"string"},{"name":"notes","description":"The pack's study notes document.","type":"object"},{"name":"flashcards","description":"The pack's flashcard deck.","type":"object"},{"name":"quiz","description":"The pack's practice quiz.","type":"object"},{"name":"lessons","description":"The pack's spoken lesson scripts.","type":"object"},{"name":"sources_summary","description":"What the pack was built from — free-form summary of the ingested sources.","type":"inline_object","fields":[],"open":true}]$J$::jsonb,
  emitted_block_schema = $J${"type":"object","properties":{"title":{"type":"string","description":"What this study pack covers."},"topic":{"type":"string","description":"The subject the pack was generated from."},"audience":{"type":"string","description":"Who the pack was written for."},"notes":{"$ref":"#/$defs/study_notes","description":"The pack's study notes document."},"flashcards":{"$ref":"#/$defs/flashcard_set","description":"The pack's flashcard deck."},"quiz":{"$ref":"#/$defs/quiz_set","description":"The pack's practice quiz."},"lessons":{"$ref":"#/$defs/lesson_script_set","description":"The pack's spoken lesson scripts."},"sources_summary":{"type":"object","properties":{},"required":[],"additionalProperties":true,"description":"What the pack was built from — free-form summary of the ingested sources."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"study_pack_set"}},"required":["__kind","title"],"additionalProperties":false,"$defs":{"study_notes":{"type":"object","properties":{"title":{"type":"string","description":"What these notes cover."},"overview":{"type":"string","description":"The whole topic in one paragraph — what a reader gets before any section."},"sections":{"type":"array","items":{"$ref":"#/$defs/study_notes_section"},"description":"The notes themselves, in teaching order."},"glossary":{"type":"array","items":{"$ref":"#/$defs/glossary_term"},"description":"The terms the material assumes, defined."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"study_notes"}},"required":["__kind","title","sections"],"additionalProperties":false},"flashcard_set":{"type":"object","properties":{"title":{"type":"string"},"set_title":{"type":"string"},"cards":{"type":"array","items":{"anyOf":[{"$ref":"#/$defs/flashcard"},{"$ref":"#/$defs/enhanced_flashcard"},{"$ref":"#/$defs/tiered_flashcard"}]}},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"flashcard_set"}},"required":["__kind","title","cards"],"additionalProperties":false},"quiz_set":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"questions":{"type":"array","items":{"$ref":"#/$defs/quiz_question"}},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"quiz_set"}},"required":["__kind","title","questions"],"additionalProperties":false},"lesson_script_set":{"type":"object","properties":{"title":{"type":"string","description":"What this set of lessons teaches."},"overview":{"type":"string","description":"The whole lesson in one paragraph — what a listener gets before any section plays."},"sections":{"type":"array","items":{"$ref":"#/$defs/lesson_script_section"},"description":"The lessons themselves, in teaching order."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"lesson_script_set"}},"required":["__kind","title","sections"],"additionalProperties":false},"study_notes_section":{"type":"object","properties":{"heading":{"type":"string","description":"What this part of the material is about — a short, plain title."},"summary":{"type":"string","description":"The section in prose: two or three sentences that would stand on their own if the reader read nothing else."},"key_points":{"type":"array","items":{"type":"string"},"description":"The facts worth remembering, one per item — each a complete statement, not a fragment."},"examples":{"type":"array","items":{"type":"string"},"description":"Concrete cases, comparisons or analogies that make the section land."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"study_notes_section"}},"required":["__kind","heading"],"additionalProperties":false},"glossary_term":{"type":"object","properties":{"term":{"type":"string","description":"The word or phrase being defined, exactly as it appears in the material."},"definition":{"type":"string","description":"What it means, in one or two sentences a newcomer to the topic can follow without another lookup."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"glossary_term"}},"required":["__kind","term","definition"],"additionalProperties":false},"flashcard":{"type":"object","properties":{"front":{"type":"string"},"back":{"type":["string","null"]},"card_kind":{"type":"string"},"difficulty":{"type":"string"},"topic":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}},"trust":{"type":"object","properties":{"confidence":{"type":"string","enum":["grounded","inferred","not_in_material"]},"groundedIn":{"type":"string"}},"required":[],"additionalProperties":false},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"flashcard"}},"required":["__kind","front","back"],"additionalProperties":false},"enhanced_flashcard":{"type":"object","properties":{"front":{"type":"string"},"back":{"type":"string"},"card_kind":{"type":"string"},"difficulty":{"type":"string"},"topic":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}},"audio_explanation":{"type":"string"},"detailed_explanation":{"type":"string"},"trust":{"type":"object","properties":{"confidence":{"type":"string","enum":["grounded","inferred","not_in_material"]},"groundedIn":{"type":"string"}},"required":[],"additionalProperties":false},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"enhanced_flashcard"}},"required":["__kind","front","back"],"additionalProperties":false},"tiered_flashcard":{"type":"object","properties":{"front":{"type":"string"},"back":{"type":"string"},"card_kind":{"type":"string"},"difficulty":{"type":"string"},"topic":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}},"subcards":{"type":"array","items":{"$ref":"#/$defs/basic_card"}},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"tiered_flashcard"}},"required":["__kind","front","back","subcards"],"additionalProperties":false},"quiz_question":{"type":"object","properties":{"type":{"type":"string"},"question":{"type":"string"},"options":{"type":"array","items":{"type":"string"}},"correct_answer":{"type":"string"},"explanation":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"quiz_question"}},"required":["__kind","type","question","correct_answer"],"additionalProperties":false},"lesson_script_section":{"type":"object","properties":{"heading":{"type":"string","description":"What this part of the lesson covers — a short, plain title."},"script":{"type":"string","description":"The full narration for this section, written to be read aloud — complete sentences, no markup, ready for TTS."},"duration_seconds":{"type":"number","description":"Roughly how long this section runs when spoken, in seconds."},"key_points":{"type":"array","items":{"type":"string"},"description":"The points this section must land, one per item — each a complete statement."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"lesson_script_section"}},"required":["__kind","heading","script"],"additionalProperties":false},"basic_card":{"type":"object","properties":{"front":{"type":"string"},"back":{"type":"string"},"topic":{"type":"string"},"difficulty":{"type":"string"},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"basic_card"}},"required":["__kind","front","back"],"additionalProperties":false}}}$J$::jsonb,
  emitted_json_schema = $J${"type":"object","properties":{"title":{"type":"string","description":"What this study pack covers."},"topic":{"type":"string","description":"The subject the pack was generated from."},"audience":{"type":"string","description":"Who the pack was written for."},"notes":{"$ref":"#/$defs/study_notes","description":"The pack's study notes document."},"flashcards":{"$ref":"#/$defs/flashcard_set","description":"The pack's flashcard deck."},"quiz":{"$ref":"#/$defs/quiz_set","description":"The pack's practice quiz."},"lessons":{"$ref":"#/$defs/lesson_script_set","description":"The pack's spoken lesson scripts."},"sources_summary":{"type":"object","properties":{},"required":[],"additionalProperties":true,"description":"What the pack was built from — free-form summary of the ingested sources."}},"required":["title"],"additionalProperties":false,"$defs":{"study_notes":{"type":"object","properties":{"title":{"type":"string","description":"What these notes cover."},"overview":{"type":"string","description":"The whole topic in one paragraph — what a reader gets before any section."},"sections":{"type":"array","items":{"$ref":"#/$defs/study_notes_section"},"description":"The notes themselves, in teaching order."},"glossary":{"type":"array","items":{"$ref":"#/$defs/glossary_term"},"description":"The terms the material assumes, defined."}},"required":["title","sections"],"additionalProperties":false},"flashcard_set":{"type":"object","properties":{"title":{"type":"string"},"set_title":{"type":"string"},"cards":{"type":"array","items":{"anyOf":[{"$ref":"#/$defs/flashcard"},{"$ref":"#/$defs/enhanced_flashcard"},{"$ref":"#/$defs/tiered_flashcard"}]}},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true}},"required":["title","cards"],"additionalProperties":false},"quiz_set":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"questions":{"type":"array","items":{"$ref":"#/$defs/quiz_question"}},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true}},"required":["title","questions"],"additionalProperties":false},"lesson_script_set":{"type":"object","properties":{"title":{"type":"string","description":"What this set of lessons teaches."},"overview":{"type":"string","description":"The whole lesson in one paragraph — what a listener gets before any section plays."},"sections":{"type":"array","items":{"$ref":"#/$defs/lesson_script_section"},"description":"The lessons themselves, in teaching order."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true}},"required":["title","sections"],"additionalProperties":false},"study_notes_section":{"type":"object","properties":{"heading":{"type":"string","description":"What this part of the material is about — a short, plain title."},"summary":{"type":"string","description":"The section in prose: two or three sentences that would stand on their own if the reader read nothing else."},"key_points":{"type":"array","items":{"type":"string"},"description":"The facts worth remembering, one per item — each a complete statement, not a fragment."},"examples":{"type":"array","items":{"type":"string"},"description":"Concrete cases, comparisons or analogies that make the section land."}},"required":["heading"],"additionalProperties":false},"glossary_term":{"type":"object","properties":{"term":{"type":"string","description":"The word or phrase being defined, exactly as it appears in the material."},"definition":{"type":"string","description":"What it means, in one or two sentences a newcomer to the topic can follow without another lookup."}},"required":["term","definition"],"additionalProperties":false},"flashcard":{"type":"object","properties":{"front":{"type":"string"},"back":{"type":["string","null"]},"card_kind":{"type":"string"},"difficulty":{"type":"string"},"topic":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}},"trust":{"type":"object","properties":{"confidence":{"type":"string","enum":["grounded","inferred","not_in_material"]},"groundedIn":{"type":"string"}},"required":[],"additionalProperties":false},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true}},"required":["front","back"],"additionalProperties":false},"enhanced_flashcard":{"type":"object","properties":{"front":{"type":"string"},"back":{"type":"string"},"card_kind":{"type":"string"},"difficulty":{"type":"string"},"topic":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}},"audio_explanation":{"type":"string"},"detailed_explanation":{"type":"string"},"trust":{"type":"object","properties":{"confidence":{"type":"string","enum":["grounded","inferred","not_in_material"]},"groundedIn":{"type":"string"}},"required":[],"additionalProperties":false}},"required":["front","back"],"additionalProperties":false},"tiered_flashcard":{"type":"object","properties":{"front":{"type":"string"},"back":{"type":"string"},"card_kind":{"type":"string"},"difficulty":{"type":"string"},"topic":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}},"subcards":{"type":"array","items":{"$ref":"#/$defs/basic_card"}}},"required":["front","back","subcards"],"additionalProperties":false},"quiz_question":{"type":"object","properties":{"type":{"type":"string"},"question":{"type":"string"},"options":{"type":"array","items":{"type":"string"}},"correct_answer":{"type":"string"},"explanation":{"type":"string"}},"required":["type","question","correct_answer"],"additionalProperties":false},"lesson_script_section":{"type":"object","properties":{"heading":{"type":"string","description":"What this part of the lesson covers — a short, plain title."},"script":{"type":"string","description":"The full narration for this section, written to be read aloud — complete sentences, no markup, ready for TTS."},"duration_seconds":{"type":"number","description":"Roughly how long this section runs when spoken, in seconds."},"key_points":{"type":"array","items":{"type":"string"},"description":"The points this section must land, one per item — each a complete statement."}},"required":["heading","script"],"additionalProperties":false},"basic_card":{"type":"object","properties":{"front":{"type":"string"},"back":{"type":"string"},"topic":{"type":"string"},"difficulty":{"type":"string"}},"required":["front","back"],"additionalProperties":false}}}$J$::jsonb,
  emitted_fingerprint = '64s-1r61us019jweua',
  metadata = metadata || $J${"loading_component": "document", "study_pack_v2": "2026-08-22: composed schema (notes/flashcards/quiz/lessons as registered child kinds) replaces the v4 included_sets root; the dangling flashcard_set_beta ref is gone. Rendered by StudyPackBlock, which delegates each member to its own kind's component."}$J$::jsonb,
  updated_at = now()
WHERE kind = 'study_pack_set'
  AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND deleted_at IS NULL;

-- ── 3. loading_component slugs for the education kinds ──────────────────────

UPDATE content_ir.kind_definition
SET metadata = metadata || jsonb_build_object('loading_component', v.slug),
    updated_at = now()
FROM (VALUES
  ('flashcard_set', 'deck'),
  ('study_notes',   'list')
) AS v(kind, slug)
WHERE content_ir.kind_definition.kind = v.kind
  AND content_ir.kind_definition.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND content_ir.kind_definition.deleted_at IS NULL;

-- ── 4. kind_edge: new wiring in, stale wiring out ───────────────────────────

DELETE FROM content_ir.kind_edge e
USING content_ir.kind_definition p
WHERE e.parent_definition_id = p.id
  AND p.kind = 'study_pack_set'
  AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND e.field_name = 'included_sets';

INSERT INTO content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
SELECT p.id, v.field_name, c.id, v.position, p.organization_id
FROM (VALUES
  ('lesson_script_set', 'sections',   'lesson_script_section', 0),
  ('study_pack_set',    'notes',      'study_notes',           0),
  ('study_pack_set',    'flashcards', 'flashcard_set',         0),
  ('study_pack_set',    'quiz',       'quiz_set',              0),
  ('study_pack_set',    'lessons',    'lesson_script_set',     0)
) AS v(parent_kind, field_name, child_kind, position)
JOIN content_ir.kind_definition p
  ON p.kind = v.parent_kind
 AND p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND p.deleted_at IS NULL
JOIN content_ir.kind_definition c
  ON c.kind = v.child_kind
 AND c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND c.deleted_at IS NULL
ON CONFLICT (parent_definition_id, field_name, child_definition_id) DO UPDATE SET
  position = EXCLUDED.position,
  updated_at = now();

-- ── 5. kind_example — validation_status is TRIGGER-DERIVED, never written ───

INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description,
   source, is_canonical, organization_id)
SELECT d.id, d.version, v.data::jsonb, v.label, v.description,
       'authored', v.is_canonical, d.organization_id
FROM (VALUES
  (
    'lesson_script_set', 'Plate tectonics lessons (canonical)', true,
    'A full set: title, overview, and two narration sections carrying duration and key points.',
    $J${"__kind": "lesson_script_set", "title": "Plate Tectonics, Spoken", "overview": "Two short lessons that read the theory aloud — what the plates are, and what happens where they meet.", "sections": [{"__kind": "lesson_script_section", "heading": "What the theory says", "script": "Picture the Earth's surface as a cracked eggshell. Each piece of shell is a plate, and every plate is drifting — about as fast as your fingernails grow. That slow drift, kept up for millions of years, is enough to open oceans and raise mountain ranges.", "duration_seconds": 45, "key_points": ["The lithosphere is broken into rigid plates.", "Plates move a few centimetres a year."]}, {"__kind": "lesson_script_section", "heading": "Where plates meet", "script": "Everything interesting happens at the boundaries. Where plates pull apart, new crust wells up to fill the gap. Where they collide, the denser one dives below and mountains rise. And where they grind past each other, the ground stores stress until it slips — that slip is an earthquake.", "duration_seconds": 60, "key_points": ["Divergent boundaries build new crust.", "Convergent boundaries destroy crust and raise mountains.", "Transform boundaries produce earthquakes."]}]}$J$
  ),
  (
    'lesson_script_set', 'Title and one bare lesson (minimal)', false,
    'Minimal legal form — a title and one section with heading and script, which is also what a mid-stream set looks like.',
    $J${"__kind": "lesson_script_set", "title": "Photosynthesis", "sections": [{"__kind": "lesson_script_section", "heading": "The one-sentence version", "script": "Plants turn light, water and carbon dioxide into sugar and oxygen."}]}$J$
  ),
  (
    'lesson_script_section', 'Boundary lesson section (canonical)', true,
    'One narration section with all four parts: heading, TTS-ready script, duration, key points.',
    $J${"__kind": "lesson_script_section", "heading": "Where plates meet", "script": "Everything interesting happens at the boundaries. Where plates pull apart, new crust wells up to fill the gap. Where they collide, the denser one dives below and mountains rise. And where they grind past each other, the ground stores stress until it slips — that slip is an earthquake.", "duration_seconds": 60, "key_points": ["Divergent boundaries build new crust.", "Convergent boundaries destroy crust and raise mountains.", "Transform boundaries produce earthquakes."]}$J$
  ),
  (
    'study_pack_set', 'Plate tectonics pack (canonical, v5 composed)', true,
    'The composed pack: header plus all four member artifacts (study_notes, flashcard_set, quiz_set, lesson_script_set) and a sources summary.',
    $J${"__kind": "study_pack_set", "title": "Plate Tectonics — Study Pack", "topic": "Earth science", "audience": "High school", "notes": {"__kind": "study_notes", "title": "Plate tectonics notes", "overview": "Earth's rigid outer shell is broken into plates that drift over the softer layer beneath.", "sections": [{"__kind": "study_notes_section", "heading": "The three boundaries", "summary": "Almost everything the theory explains happens where two plates meet.", "key_points": ["Divergent: plates move apart and new crust forms.", "Convergent: plates collide; denser crust subducts.", "Transform: plates slide past one another."], "examples": ["Mid-Atlantic Ridge — divergent, and still widening."]}], "glossary": [{"__kind": "glossary_term", "term": "Lithosphere", "definition": "Earth's rigid outer shell — the crust plus the uppermost mantle — broken into the tectonic plates."}]}, "flashcards": {"__kind": "flashcard_set", "title": "Boundary drills", "cards": [{"__kind": "flashcard", "front": "What happens at a divergent boundary?", "back": "Plates move apart and new crust forms."}, {"__kind": "flashcard", "front": "Which boundary type is defined by its earthquakes?", "back": "Transform — plates slide past one another and stress slips."}]}, "quiz": {"__kind": "quiz_set", "title": "Quick check", "questions": [{"__kind": "quiz_question", "type": "multiple_choice", "question": "Which boundary makes new crust?", "options": ["Divergent", "Convergent", "Transform"], "correct_answer": "Divergent", "explanation": "Seafloor spreading adds new oceanic crust where plates part."}]}, "lessons": {"__kind": "lesson_script_set", "title": "Plate Tectonics, Spoken", "overview": "Two short lessons that read the theory aloud — what the plates are, and what happens where they meet.", "sections": [{"__kind": "lesson_script_section", "heading": "What the theory says", "script": "Picture the Earth's surface as a cracked eggshell. Each piece of shell is a plate, and every plate is drifting — about as fast as your fingernails grow. That slow drift, kept up for millions of years, is enough to open oceans and raise mountain ranges.", "duration_seconds": 45, "key_points": ["The lithosphere is broken into rigid plates.", "Plates move a few centimetres a year."]}, {"__kind": "lesson_script_section", "heading": "Where plates meet", "script": "Everything interesting happens at the boundaries. Where plates pull apart, new crust wells up to fill the gap. Where they collide, the denser one dives below and mountains rise. And where they grind past each other, the ground stores stress until it slips — that slip is an earthquake.", "duration_seconds": 60, "key_points": ["Divergent boundaries build new crust.", "Convergent boundaries destroy crust and raise mountains.", "Transform boundaries produce earthquakes."]}]}, "sources_summary": {"source_count": 2, "sources": ["Pasted material", "Earth Science, chapter 4.pdf"]}}$J$
  )
) AS v(kind, label, is_canonical, description, data)
JOIN content_ir.kind_definition d
  ON d.kind = v.kind
 AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND d.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM content_ir.kind_example x
  WHERE x.kind_definition_id = d.id AND x.label = v.label AND x.deleted_at IS NULL
);

-- ── 6. kind_component: web output → the bundled renderers ───────────────────

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'lesson_scripts', 'bundled',
       jsonb_build_object('legacyBlockType', 'lesson_scripts'), true, true, 100,
       d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind = 'lesson_script_set'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.component_key = 'lesson_scripts'
      AND c.deleted_at IS NULL
  );

-- The pack's default web/output row flips from generic_structured (the v4
-- placeholder) to the real composed renderer.
UPDATE content_ir.kind_component c SET
  component_key = 'study_pack',
  source = 'bundled',
  config = jsonb_build_object('legacyBlockType', 'study_pack'),
  is_active = true,
  updated_at = now()
FROM content_ir.kind_definition d
WHERE c.kind_definition_id = d.id
  AND d.kind = 'study_pack_set'
  AND d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND d.deleted_at IS NULL
  AND c.platform = 'web' AND c.role = 'output'
  AND c.is_default AND c.deleted_at IS NULL;

COMMIT;
