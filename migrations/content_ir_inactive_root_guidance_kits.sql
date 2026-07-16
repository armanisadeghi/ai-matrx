-- Content IR Wave 1, lane C4 — guidance kits for the six independently-renderable
-- INACTIVE roots: office_document, office_presentation, office_spreadsheet,
-- q_and_a_set, schema_showcase, study_pack_set.
--
-- Closes the shape doctor's `no-skill` / `no-content-block` yellows (and the three
-- office roots' missing-component cells) WITHOUT activating any kind. Data-only —
-- no DDL. Idempotent on business keys. Activation stays reserved to Arman; each
-- kind's remaining gate is recorded on kind_definition.metadata.activation_gate.
--
-- Conventions mirrored from the live render-block campaign rows:
--   skills          -> skill.definition (skill_type='render_block', is_system, org = system org,
--                      category 'Render Blocks' 49c845cb-9314-485c-88ed-a7ace4f286ca)
--   content blocks  -> public.content_blocks (category 'Agent Skills' 2c324058-95e9-4b7e-a991-884f4443eb6e,
--                      metadata.skill_id pairing, per kind-cooking-recipe-*)
--   components      -> content_ir.kind_component 'generic_structured' rows, exactly like the
--                      2026-07-08 R6 rows on q_and_a_set / schema_showcase / study_pack_set.
-- Every example validated with ajv against the LIVE emitted_json_schema
-- (recursive __kind strip, same semantics as kind-dual-gate) before commit.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Skills for the three ts-owned roots (none existed).
--    R9 naming kind_<slug> = the JSON `__kind` syntax.
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name, platform_targets, semver,
   category_id, is_active, is_system, sort_order, organization_id, visibility, metadata)
SELECT
  'kind_q_and_a_set',
  'Q&A Set (structured)',
  'How and when to emit a q_and_a_set render block as structured "__kind" JSON: the root shape, the four card variants (flashcard, enhanced, tiered, basic), the rules that prevent validation failures, sizing guidance, and editing etiquette.',
  'render_block',
  $SKL1$# Q&A Set (structured JSON)

When the user is reviewing material as question-and-answer pairs — study checks, interview prep, recall drills mixing simple and layered questions — emit ONE JSON object carrying `__kind` inside a ```json fence:

```json
{
  "__kind": "q_and_a_set",
  "title": "Photosynthesis — Q&A",
  "cards": [
    { "front": "What pigment captures light energy?", "back": "Chlorophyll, held in the thylakoid membranes.", "topic": "Light reactions", "difficulty": "easy", "tags": ["biology"] },
    { "front": "Where does the Calvin cycle run?", "back": "In the stroma, using ATP and NADPH from the light reactions.", "topic": "Calvin cycle", "difficulty": "medium" }
  ]
}
```

The platform recognizes and validates this shape; it renders through the structured content viewer.

## When to use which block

| Intent | Emit |
|---|---|
| Mixed Q&A: some cards need depth, sub-questions, or explanations | `q_and_a_set` (this block) |
| Plain front/back memorization deck | `flashcard_set` (see the Flashcards skill) |
| Graded questions with one correct answer | `quiz_set` (see the Quiz skill) |
| Quiz plus Q&A bundled as one study package | `study_pack_set` (see the Study Pack skill) |

## The shape

Root object — `title` is REQUIRED:

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required. The set's display title. |
| `cards` | card[] | The cards, in order. Each card is one of the four variants below. |

## The four card variants

A card's variant is STRUCTURAL — the fields you include determine it. Do not add a type discriminator field.

| Variant | Required | Optional | Use for |
|---|---|---|---|
| Standard | `front`, `back` | `topic`, `difficulty`, `tags`, `card_kind` | The default question/answer card. |
| Enhanced | `front`, `back` | standard fields + `detailed_explanation`, `audio_explanation` | A card whose answer deserves a fuller explanation. |
| Tiered | `front`, `back`, `subcards` | standard fields | A broad question drilled through smaller sub-questions. |
| Basic (subcard) | `front`, `back` | `topic`, `difficulty` | ONLY inside `subcards` — no tags, no nesting. |

Enhanced card:

```json
{
  "front": "Why is the inner mitochondrial membrane folded?",
  "back": "Cristae increase surface area for oxidative phosphorylation.",
  "difficulty": "medium",
  "detailed_explanation": "More membrane area means more electron transport chains and ATP synthase complexes per mitochondrion, raising ATP output."
}
```

Tiered card:

```json
{
  "front": "Compare the main transport mechanisms.",
  "back": "Passive moves down the gradient; active consumes ATP.",
  "subcards": [
    { "front": "What drives passive diffusion?", "back": "The concentration gradient alone." },
    { "front": "What does the sodium-potassium pump consume?", "back": "ATP — it moves ions against their gradients." }
  ]
}
```

## Rules that prevent validation failures

1. VALID JSON only — double-quote every key and string, no trailing commas, no comments.
2. The schema is STRICT (`additionalProperties: false`) — any field not listed above fails validation. No `id`, no `question`/`answer` (use `front`/`back`), no invented keys.
3. `front` and `back` are required on EVERY card, including tiered cards (the tiered `back` is the summary answer; details go in `subcards`).
4. `subcards` entries are basic cards only — `front`, `back`, `topic`, `difficulty`. No `tags`, no nested `subcards`.
5. `tags` is an array of strings. `difficulty` is a free string — prefer `easy` / `medium` / `hard`.
6. `title` on the root is required — an untitled set fails validation.

## Sizing

5-15 cards per set reads well. Past ~25 cards, split into multiple sets by topic. Keep `front` a single question; move length into `back` or `detailed_explanation`.

## Editing etiquette

When asked to change a set, return ONE complete updated `q_and_a_set` object — all cards, in order, including untouched ones. Never emit a fragment or a diff, and never change the block to a different kind.
$SKL1$,
  'MessagesSquare', '["web"]'::jsonb, '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca', true, true, 60,
  '39c38960-d30c-4840-b0c1-c9960de95582', 'public',
  '{"kind": "q_and_a_set", "syntax": "json"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'kind_q_and_a_set'
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND deleted_at IS NULL
);

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name, platform_targets, semver,
   category_id, is_active, is_system, sort_order, organization_id, visibility, metadata)
SELECT
  'kind_study_pack_set',
  'Study Pack (structured)',
  'How and when to emit a study_pack_set render block as structured "__kind" JSON: the pack root, bundling quiz sets and Q&A sets, structural set identity (no nested markers), and the rules that prevent validation failures.',
  'render_block',
  $SKL2$# Study Pack (structured JSON)

When the user wants a study PACKAGE — a quiz plus Q&A cards on one topic, an exam-prep bundle, a lesson's practice materials in one place — emit ONE JSON object carrying `__kind` inside a ```json fence:

```json
{
  "__kind": "study_pack_set",
  "title": "Cell Biology — Exam Prep Pack",
  "topic": "Cell biology",
  "difficulty": "intermediate",
  "description": "Quiz plus Q&A covering organelles and membrane transport.",
  "grade_level": "Undergraduate year 1",
  "included_sets": [
    {
      "title": "Organelles quiz",
      "description": "Ten-minute organelle check.",
      "questions": [
        { "type": "multiple_choice", "question": "Which organelle is the primary site of ATP synthesis?", "options": ["Mitochondrion", "Ribosome", "Golgi apparatus", "Lysosome"], "correct_answer": "Mitochondrion", "explanation": "Oxidative phosphorylation occurs across the inner mitochondrial membrane." },
        { "type": "true_false", "question": "Ribosomes are bounded by a lipid membrane.", "options": ["True", "False"], "correct_answer": "False" }
      ]
    },
    {
      "title": "Membrane transport Q&A",
      "cards": [
        { "front": "What drives passive diffusion?", "back": "The concentration gradient alone — no ATP.", "difficulty": "easy" }
      ]
    }
  ]
}
```

The platform recognizes and validates this shape; it renders through the structured content viewer.

## When to use which block

| Intent | Emit |
|---|---|
| Quiz AND recall cards bundled for one topic | `study_pack_set` (this block) |
| A single graded quiz | `quiz_set` (see the Quiz skill) |
| A single Q&A card set | `q_and_a_set` (see the Q&A Set skill) |
| Plain memorization deck | `flashcard_set` (see the Flashcards skill) |

## The shape

Root object — `title` and `included_sets` are REQUIRED:

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required. The pack's display title. |
| `included_sets` | set[] | Required, non-empty. Each entry is a quiz set or a Q&A set (below). |
| `topic` | string | Optional subject label. |
| `difficulty` | string | Optional — prefer `beginner` / `intermediate` / `advanced`. |
| `description` | string | Optional one-or-two-sentence summary. |
| `grade_level` | string | Optional audience label ("Grade 9", "Undergraduate year 1"). |

## The two set types inside `included_sets`

A set's identity is STRUCTURAL — do NOT add a kind marker inside `included_sets`; the fields decide.

**Quiz set** (`questions` present) — `title` and `questions` required:

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required. |
| `questions` | question[] | Required. Each: `type` + `question` + `correct_answer` required; `options` (string[]) and `explanation` optional. |
| `description` | string | Optional. |

Question `type` values: `multiple_choice` (give 3-5 `options`, `correct_answer` matches one exactly) and `true_false` (`options` = ["True", "False"], `correct_answer` one of them).

**Q&A set** (`cards` present) — `title` required; each card needs `front` + `back`, with optional `topic`, `difficulty`, `tags`. Deeper card variants are documented in the Q&A Set skill.

## Rules that prevent validation failures

1. VALID JSON only — double-quote every key and string, no trailing commas, no comments.
2. The schema is STRICT (`additionalProperties: false`) at every level — no invented fields on the pack, the sets, the questions, or the cards.
3. NO kind markers inside `included_sets` — set identity is structural (`questions` means quiz, `cards` means Q&A).
4. `correct_answer` must EXACTLY match one entry in `options` (character for character) or the quiz cannot grade.
5. Every set needs its `title`; the pack needs `title` and a non-empty `included_sets`.
6. Always include `explanation` on quiz questions when you can — it is what makes review valuable.

## Sizing

2-4 sets per pack; 5-12 questions per quiz; 5-15 cards per Q&A set. Bigger material splits into multiple packs by topic.

## Editing etiquette

When asked to change a pack, return ONE complete updated `study_pack_set` object — every set and every question/card, in order, including untouched ones. Never emit a fragment, and never change the block to a different kind.
$SKL2$,
  'BookOpenCheck', '["web"]'::jsonb, '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca', true, true, 61,
  '39c38960-d30c-4840-b0c1-c9960de95582', 'public',
  '{"kind": "study_pack_set", "syntax": "json"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'kind_study_pack_set'
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND deleted_at IS NULL
);

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name, platform_targets, semver,
   category_id, is_active, is_system, sort_order, organization_id, visibility, metadata)
SELECT
  'kind_schema_showcase',
  'Schema Showcase (structured)',
  'The diagnostic schema_showcase kind: one object exercising the full schema feature matrix (required/optional, nullable, enum, nested objects, arrays, string maps, unions). Emit it to verify structured-output plumbing end to end.',
  'render_block',
  $SKL3$# Schema Showcase (structured JSON)

`schema_showcase` is the platform's DIAGNOSTIC shape — one object that exercises every schema feature the kind system supports: required and optional fields, a nullable field, an enum, a nested object, arrays of primitives, a string map, nested item definitions, and a polymorphic union. Emit it when asked to test, verify, or demonstrate structured output — it is not a product display shape.

```json
{
  "__kind": "schema_showcase",
  "label": "Ingestion pipeline profile",
  "count": 42,
  "status": "published",
  "active": true,
  "notes": null,
  "config": { "enabled": true, "retries": 3, "timeout_ms": 30000 },
  "scores": [0.91, 0.87],
  "flags": [true, false],
  "labels": ["ingest", "nightly"],
  "children": [
    { "name": "parse", "weight": 0.4 },
    { "name": "embed", "weight": 0.6 }
  ],
  "metadata": { "owner": "platform", "region": "us-west-1" },
  "nested_ref": { "ref_id": "profile_v2" },
  "polymorphic_value": 3.14
}
```

The platform recognizes and validates this shape; it renders through the structured content viewer.

## The shape

REQUIRED: `label` (string), `count` (number), `status` (enum: `draft` | `published` | `archived`), `config` (object), `scores` (number[]), `metadata` (string-to-string map), `polymorphic_value` (string OR number OR boolean).

| Field | Type | Notes |
|---|---|---|
| `label` | string | Required display label. |
| `count` | number | Required. |
| `status` | enum | Required — exactly `draft`, `published`, or `archived`. |
| `config` | object | Required — `enabled` (boolean) and `retries` (number) required; `timeout_ms` (number) optional. Strict: no other keys. |
| `scores` | number[] | Required. |
| `metadata` | object | Required — every value MUST be a string (a string map, not a free object). |
| `polymorphic_value` | string, number, or boolean | Required — any ONE of the three. |
| `notes` | string or null | Optional and nullable — `null` is valid, omitting it is valid. |
| `active` | boolean | Optional. |
| `flags` | boolean[] | Optional. |
| `labels` | string[] | Optional. |
| `children` | item[] | Optional — each item: `name` (string, required) + `weight` (number, optional). Strict. |
| `nested_ref` | object | Optional — exactly `{ "ref_id": "<string>" }`. |

## Rules that prevent validation failures

1. VALID JSON only — double-quote every key and string, no trailing commas, no comments.
2. STRICT everywhere (`additionalProperties: false`) — any key not in the table fails, including inside `config`, `children` items, and `nested_ref`.
3. `metadata` values are strings ONLY — write `"retries": "3"` there, never a number or nested object.
4. `status` outside the three enum values fails.
5. `polymorphic_value` must be present — pick a string, number, or boolean deliberately (this field exists to prove union handling).
6. `notes: null` is legal and meaningfully different from omitting `notes` — use `null` when testing nullable handling.

## Editing etiquette

When asked to change a showcase, return ONE complete updated `schema_showcase` object. Never emit a fragment, and never change the block to a different kind.
$SKL3$,
  'Braces', '["web"]'::jsonb, '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca', true, true, 62,
  '39c38960-d30c-4840-b0c1-c9960de95582', 'public',
  '{"kind": "schema_showcase", "syntax": "json"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'kind_schema_showcase'
    AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND deleted_at IS NULL
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Office skills already exist (office-*-kind) and correctly teach the
--    FRAMED office-tool contract. Append the canonical Shape-identity section
--    (the in-band `__kind` form for standalone embedding) so the guidance
--    covers both carriers. Guarded — applies once.
-- ────────────────────────────────────────────────────────────────────────────

UPDATE skill.definition SET
  body = body || $OFD$
## Shape identity (`__kind`)

Inside the `office` tool call the spec carries NO kind marker — `format: "docx"` frames it. If you ever embed a document spec standalone in a message (outside the tool call), tag it so the platform recognizes the shape:

```json
{ "__kind": "office_document", "title": "Q3 Brief", "blocks": [ { "type": "heading", "text": "Q3 Brief", "level": 1 }, { "type": "paragraph", "text": "Summary paragraph." } ] }
```

Never put `__kind` inside the tool call's `spec` argument.
$OFD$,
  version = version + 1, updated_at = now()
WHERE skill_id = 'office-document-kind' AND deleted_at IS NULL
  AND body NOT LIKE '%"__kind": "office_document"%';

UPDATE skill.definition SET
  body = body || $OFP$
## Shape identity (`__kind`)

Inside the `office` tool call the spec carries NO kind marker — `format: "pptx"` frames it. If you ever embed a presentation spec standalone in a message (outside the tool call), tag it so the platform recognizes the shape:

```json
{ "__kind": "office_presentation", "title": "Kickoff", "subtitle": "Plan", "slides": [ { "layout": "title", "title": "Kickoff", "body": "Plan" } ] }
```

Never put `__kind` inside the tool call's `spec` argument.
$OFP$,
  version = version + 1, updated_at = now()
WHERE skill_id = 'office-presentation-kind' AND deleted_at IS NULL
  AND body NOT LIKE '%"__kind": "office_presentation"%';

UPDATE skill.definition SET
  body = body || $OFS$
## Shape identity (`__kind`)

Inside the `office` tool call the spec carries NO kind marker — `format: "xlsx"` frames it. If you ever embed a spreadsheet spec standalone in a message (outside the tool call), tag it so the platform recognizes the shape:

```json
{ "__kind": "office_spreadsheet", "sheets": [ { "name": "Summary", "columns": ["Region", "Units"], "rows": [ ["North", 1200] ], "freeze_header": true } ] }
```

Never put `__kind` inside the tool call's `spec` argument.
$OFS$,
  version = version + 1, updated_at = now()
WHERE skill_id = 'office-spreadsheet-kind' AND deleted_at IS NULL
  AND body NOT LIKE '%"__kind": "office_spreadsheet"%';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Content blocks for the three ts-owned roots ("Agent Skills" category,
--    metadata.skill_id pairing, per the kind-cooking-recipe-* precedent).
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template, sort_order, is_active,
   category_id, organization_id, metadata)
SELECT
  'kind-q-and-a-set-simple', 'Q&A Card Set',
  'Question-and-answer card set as structured __kind JSON.',
  'MessagesSquare',
  $CB1$When the user is reviewing material as question-and-answer pairs, emit a Q&A card set as ONE JSON object carrying __kind:

```json
{
  "__kind": "q_and_a_set",
  "title": "Set title",
  "cards": [
    { "front": "Question text", "back": "Answer text", "topic": "Optional topic", "difficulty": "easy" }
  ]
}
```

- `title` is required; every card needs `front` and `back`.
- Optional card fields: `topic`, `difficulty` (easy/medium/hard), `tags` (string array). NO other fields — the schema is strict.
- 5-15 cards per set; split larger material by topic.
- When editing, return the ONE complete updated object with all cards.$CB1$,
  10, true,
  '2c324058-95e9-4b7e-a991-884f4443eb6e', '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"skill_id": "kind_q_and_a_set"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.content_blocks WHERE block_id = 'kind-q-and-a-set-simple' AND deleted_at IS NULL);

INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template, sort_order, is_active,
   category_id, organization_id, metadata)
SELECT
  'kind-q-and-a-set-full', 'Q&A Card Set (layered)',
  'Q&A set mixing standard, explained, and tiered cards.',
  'ListTree',
  $CB2$For Q&A material where some questions deserve depth or sub-questions, emit a q_and_a_set mixing card variants (identity is structural — the fields you include decide the variant):

```json
{
  "__kind": "q_and_a_set",
  "title": "Set title",
  "cards": [
    { "front": "Simple question", "back": "Short answer", "difficulty": "easy" },
    { "front": "Deeper question", "back": "Short answer", "detailed_explanation": "The fuller why-and-how behind the answer." },
    { "front": "Broad question", "back": "Summary answer", "subcards": [
      { "front": "Sub-question 1", "back": "Answer 1" },
      { "front": "Sub-question 2", "back": "Answer 2" }
    ] }
  ]
}
```

- Every card (tiered included) requires `front` and `back`.
- `subcards` entries allow only `front`, `back`, `topic`, `difficulty` — no tags, no nesting.
- Strict schema: no invented fields anywhere. When editing, return the ONE complete updated object.$CB2$,
  11, true,
  '2c324058-95e9-4b7e-a991-884f4443eb6e', '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"skill_id": "kind_q_and_a_set"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.content_blocks WHERE block_id = 'kind-q-and-a-set-full' AND deleted_at IS NULL);

INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template, sort_order, is_active,
   category_id, organization_id, metadata)
SELECT
  'kind-study-pack-set-simple', 'Study Pack',
  'Quiz plus Q&A cards bundled as one structured study pack.',
  'BookOpenCheck',
  $CB3$When the user wants practice material bundled for one topic (a quiz PLUS recall cards), emit a study pack as ONE JSON object carrying __kind:

```json
{
  "__kind": "study_pack_set",
  "title": "Pack title",
  "included_sets": [
    { "title": "Quick quiz", "questions": [
      { "type": "multiple_choice", "question": "Question?", "options": ["A", "B"], "correct_answer": "A", "explanation": "Why A is right." }
    ] },
    { "title": "Recall Q&A", "cards": [
      { "front": "Question", "back": "Answer" }
    ] }
  ]
}
```

- `title` and a non-empty `included_sets` are required.
- Set identity is structural: `questions` means quiz set, `cards` means Q&A set. Do NOT add kind markers inside `included_sets`.
- Quiz `type`: multiple_choice or true_false; `correct_answer` must exactly match an option.
- Strict schema — no invented fields. When editing, return the ONE complete updated object.$CB3$,
  10, true,
  '2c324058-95e9-4b7e-a991-884f4443eb6e', '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"skill_id": "kind_study_pack_set"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.content_blocks WHERE block_id = 'kind-study-pack-set-simple' AND deleted_at IS NULL);

INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template, sort_order, is_active,
   category_id, organization_id, metadata)
SELECT
  'kind-study-pack-set-full', 'Study Pack (exam prep)',
  'Full study pack with topic, difficulty, grade level, and multiple sets.',
  'GraduationCap',
  $CB4$For exam-prep material, emit a complete study_pack_set with its descriptive fields so the pack is self-explanatory:

```json
{
  "__kind": "study_pack_set",
  "title": "Cell Biology — Exam Prep Pack",
  "topic": "Cell biology",
  "difficulty": "intermediate",
  "description": "Quiz plus Q&A covering organelles and membrane transport.",
  "grade_level": "Undergraduate year 1",
  "included_sets": [
    { "title": "Organelles quiz", "description": "Ten-minute check.", "questions": [
      { "type": "multiple_choice", "question": "Which organelle is the primary site of ATP synthesis?", "options": ["Mitochondrion", "Ribosome", "Golgi apparatus", "Lysosome"], "correct_answer": "Mitochondrion", "explanation": "Oxidative phosphorylation occurs across the inner mitochondrial membrane." }
    ] },
    { "title": "Membrane transport Q&A", "cards": [
      { "front": "What drives passive diffusion?", "back": "The concentration gradient alone — no ATP.", "difficulty": "easy" }
    ] }
  ]
}
```

- 2-4 sets per pack; 5-12 quiz questions; 5-15 cards. Include `explanation` on quiz questions.
- No kind markers inside `included_sets` — set identity is structural. Strict schema throughout.$CB4$,
  11, true,
  '2c324058-95e9-4b7e-a991-884f4443eb6e', '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"skill_id": "kind_study_pack_set"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.content_blocks WHERE block_id = 'kind-study-pack-set-full' AND deleted_at IS NULL);

INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template, sort_order, is_active,
   category_id, organization_id, metadata)
SELECT
  'kind-schema-showcase', 'Schema Showcase (diagnostic)',
  'Diagnostic shape exercising the full schema feature matrix.',
  'Braces',
  $CB5$To test or demonstrate structured output end to end, emit the diagnostic schema_showcase shape — it exercises required/optional fields, a nullable field, an enum, nested objects, arrays, a string map, and a polymorphic union:

```json
{
  "__kind": "schema_showcase",
  "label": "Ingestion pipeline profile",
  "count": 42,
  "status": "published",
  "notes": null,
  "config": { "enabled": true, "retries": 3 },
  "scores": [0.91, 0.87],
  "metadata": { "owner": "platform" },
  "polymorphic_value": 3.14
}
```

- Required: `label`, `count`, `status` (draft/published/archived), `config` (`enabled` + `retries`), `scores`, `metadata` (string values ONLY), `polymorphic_value` (string OR number OR boolean).
- Optional: `notes` (nullable), `active`, `flags`, `labels`, `children` ([{ "name": "...", "weight": 0.4 }]), `nested_ref` ({ "ref_id": "..." }).
- Strict at every level — no invented fields. This is a diagnostic shape, not a product display.$CB5$,
  12, true,
  '2c324058-95e9-4b7e-a991-884f4443eb6e', '39c38960-d30c-4840-b0c1-c9960de95582',
  '{"skill_id": "kind_schema_showcase"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.content_blocks WHERE block_id = 'kind-schema-showcase' AND deleted_at IS NULL);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Office content blocks exist (office-*-kind) teaching the tool contract.
--    Append the standalone-embedding identity line. Guarded — applies once.
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.content_blocks SET
  template = template || $CBOD$
- Shape identity: embedding a spec standalone in a message (outside the office tool call)? Tag it { "__kind": "office_document", ... } so the platform recognizes the shape. Never put __kind inside the tool call's spec argument.$CBOD$,
  version = version + 1, updated_at = now()
WHERE block_id = 'office-document-kind' AND deleted_at IS NULL
  AND template NOT LIKE '%"__kind": "office_document"%';

UPDATE public.content_blocks SET
  template = template || $CBOP$
- Shape identity: embedding a spec standalone in a message (outside the office tool call)? Tag it { "__kind": "office_presentation", ... } so the platform recognizes the shape. Never put __kind inside the tool call's spec argument.$CBOP$,
  version = version + 1, updated_at = now()
WHERE block_id = 'office-presentation-kind' AND deleted_at IS NULL
  AND template NOT LIKE '%"__kind": "office_presentation"%';

UPDATE public.content_blocks SET
  template = template || $CBOS$
- Shape identity: embedding a spec standalone in a message (outside the office tool call)? Tag it { "__kind": "office_spreadsheet", ... } so the platform recognizes the shape. Never put __kind inside the tool call's spec argument.$CBOS$,
  version = version + 1, updated_at = now()
WHERE block_id = 'office-spreadsheet-kind' AND deleted_at IS NULL
  AND template NOT LIKE '%"__kind": "office_spreadsheet"%';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Explicit generic_structured component rows for the three office roots —
--    the same R6 disposition applied to q_and_a_set / schema_showcase /
--    study_pack_set on 2026-07-08 (reuse, not a new renderer). Standalone
--    __kind emission of an office spec renders in the generic structured
--    viewer; the canonical consumption path remains the office tool.
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, is_default, is_active,
   sort_order, organization_id, metadata)
SELECT kd.id, 'web', 'output', 'generic_structured', 'bundled', true, true, 100,
       '39c38960-d30c-4840-b0c1-c9960de95582',
       '{"note": "R6 generic fallback binding (lane C4, 2026-07-15): no dedicated inline renderer; canonical consumption is the office tool returning a FileRef."}'::jsonb
FROM content_ir.kind_definition kd
WHERE kd.kind IN ('office_document', 'office_presentation', 'office_spreadsheet')
  AND kd.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component kc
    WHERE kc.kind_definition_id = kd.id AND kc.platform = 'web'
      AND kc.role = 'output' AND kc.deleted_at IS NULL
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Gate status on each kind — WHY it remains inactive, recorded on
--    kind_definition.metadata.activation_gate. Activation itself is reserved
--    to Arman; these rows document the gate, they do not flip is_active.
-- ────────────────────────────────────────────────────────────────────────────

UPDATE content_ir.kind_definition SET metadata = metadata || jsonb_build_object(
  'activation_gate',
  'Guidance kit complete (schema, passing canonical example, skill kind_q_and_a_set, content blocks, generic_structured component). Renders via the generic structured viewer only (R6 disposition 2026-07-08) — activation asserts standalone render-trust, which needs a dedicated card component. Activation decision reserved to Arman.'
) WHERE kind = 'q_and_a_set' AND deleted_at IS NULL;

UPDATE content_ir.kind_definition SET metadata = metadata || jsonb_build_object(
  'activation_gate',
  'Guidance kit complete (schema, passing canonical example, skill kind_study_pack_set, content blocks, generic_structured component). Two gates: generic viewer only (no dedicated renderer), and emitted_json_schema embeds unresolved ref flashcard_set_beta ("schema not available at export time") so that anyOf arm accepts any object. Activation decision reserved to Arman.'
) WHERE kind = 'study_pack_set' AND deleted_at IS NULL;

UPDATE content_ir.kind_definition SET metadata = metadata || jsonb_build_object(
  'activation_gate',
  'Diagnostic kind exercising the schema feature matrix — not a product display shape. Guidance kit complete (schema, passing canonical example, skill kind_schema_showcase, content block, generic_structured component); renders via the generic structured viewer. Activation decision reserved to Arman.'
) WHERE kind = 'schema_showcase' AND deleted_at IS NULL;

UPDATE content_ir.kind_definition SET metadata = metadata || jsonb_build_object(
  'activation_gate',
  'Framed tool contract — canonical consumption is the office tool (format=docx) returning a downloadable FileRef; no dedicated inline renderer, generic_structured bound as the explicit R6 fallback for standalone __kind emission. Guidance kit complete (skill office-document-kind, content block, component). Activation decision reserved to Arman.'
) WHERE kind = 'office_document' AND deleted_at IS NULL;

UPDATE content_ir.kind_definition SET metadata = metadata || jsonb_build_object(
  'activation_gate',
  'Framed tool contract — canonical consumption is the office tool (format=pptx) returning a downloadable FileRef; inline decks are served by the ACTIVE presentation_deck kind; no dedicated inline renderer here, generic_structured bound as the explicit R6 fallback. Guidance kit complete (skill office-presentation-kind, content block, component). Activation decision reserved to Arman.'
) WHERE kind = 'office_presentation' AND deleted_at IS NULL;

UPDATE content_ir.kind_definition SET metadata = metadata || jsonb_build_object(
  'activation_gate',
  'Framed tool contract — canonical consumption is the office tool (format=xlsx) returning a downloadable FileRef; no dedicated inline renderer, generic_structured bound as the explicit R6 fallback for standalone __kind emission. Guidance kit complete (skill office-spreadsheet-kind, content block, component). Activation decision reserved to Arman.'
) WHERE kind = 'office_spreadsheet' AND deleted_at IS NULL;

COMMIT;
