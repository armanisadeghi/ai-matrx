-- kind_quiz_set_skill.sql
-- Render-block skill + content blocks that teach AI Matrx agents to emit the
-- content-ir kind `quiz_set` (with nested `quiz_question` children).
--
-- Idempotent + schema-qualified. Business-key guarded so re-apply is safe.
-- Do NOT run manually — applied centrally with the other per-kind skills.
--
-- Live-verified names (2026-07):
--   skill.definition        — the skill row (skill_type='render_block').
--   public.content_blocks    — right-click-into-prompt blocks.
--   platform.categories      — dimension-based categories (both REUSED).
--     * skill category "Render Blocks" 49c845cb-… (dimension='skill').
--     * shared content-block category "Render Blocks" 6913d9fc-…
--       (dimension='shortcut', placement_type='content-block'). No new category.
--   Owner org = "Matrx System" 39c38960-d30c-4840-b0c1-c9960de95582 — both
--   organization_id columns are NOT NULL, so the system org is the global
--   owner (this is how mermaid-diagrams + every content_block are stored).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Constants (kept inline as literals below; documented here)
--   system org           : 39c38960-d30c-4840-b0c1-c9960de95582
--   skill category id     : 49c845cb-9314-485c-88ed-a7ace4f286ca ("Render Blocks")
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The skill row — teaches the {"__kind":"quiz_set", ...} JSON shape.
--    Composite-unique guarded (skill.definition has NO single-column PK on
--    skill_id), so INSERT ... SELECT ... WHERE NOT EXISTS, not ON CONFLICT.
-- ---------------------------------------------------------------------------
INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   platform_targets, semver, category_id, is_system, is_active,
   visibility, organization_id, project_id, task_id, sort_order)
SELECT
  'quiz-set',
  'Quiz',
  'How and when to emit a quiz_set render block: the __kind JSON shape, nested quiz_question children, the correct_answer-must-match-an-option rule that prevents wrong keys or dropped questions, sizing, and editing etiquette.',
  'render_block',
  $BODY$# Quiz

You can create a live, interactive quiz by emitting a single JSON object carrying
`"__kind": "quiz_set"`. It renders immediately (multiple-choice with instant
scoring, an explanation per question, retake, and print), streams progressively,
and persists as a versioned artifact the user can edit, share, or hand to another
agent. Prefer a quiz whenever the user wants to be tested, quizzed, or to check
their understanding of material — it is far more useful than a plain list of
Q&A in prose.

## How to emit a quiz

Emit ONE JSON object with `"__kind": "quiz_set"`. The system recognizes it live,
fenced or unfenced; a ```json fence is fine for clarity:

```json
{
  "__kind": "quiz_set",
  "title": "American Revolution Quiz",
  "description": "Multiple choice questions on the founding period",
  "questions": [
    {
      "__kind": "quiz_question",
      "type": "multiple_choice",
      "question": "Who was known as the 'Father of the Constitution'?",
      "options": ["George Washington", "James Madison", "Benjamin Franklin", "Alexander Hamilton"],
      "correct_answer": "James Madison",
      "explanation": "James Madison earned the title for his central role in drafting and promoting the Constitution."
    }
  ]
}
```

One quiz per JSON object. Never wrap it in `<artifact>` tags — the JSON object IS
the artifact.

## When to use it

| User intent | Do this |
|---|---|
| "Quiz me on X" / "test my knowledge" | A quiz_set of multiple_choice questions |
| Check comprehension after teaching something | A short quiz_set (3-8 questions) |
| Review / study aid the user can retake | A quiz_set — it scores and allows retakes |

If the user wants front/back study cards instead of graded questions, emit a
`flashcard_set` instead — a quiz grades answers, flashcards do not.

## The `__kind` + field structure

**quiz_set** (the root object):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Must be exactly `"quiz_set"`. |
| `title` | string | yes | The quiz title shown at the top. |
| `questions` | array | yes | One or more `quiz_question` objects (see below). |
| `description` | string | no | A short subtitle under the title. |

**quiz_question** (each item in `questions`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Must be exactly `"quiz_question"`. |
| `type` | string | yes | `"multiple_choice"` or `"true_false"`. |
| `question` | string | yes | The question prompt. |
| `correct_answer` | string | yes | The FULL TEXT of the correct option (see rules). |
| `options` | string[] | no* | The answer choices. *Required in practice — see rules. |
| `explanation` | string | no | Shown after the user answers. Strongly recommended. |

## Syntax rules that PREVENT render failures

These map to how the quiz renders — break them and a question silently drops or
the wrong answer gets marked correct:

1. **`correct_answer` MUST be the exact text of one of the `options`.** The
   renderer resolves the correct choice by matching this string against the
   options list. If it matches none, it defaults to marking option 1 correct —
   a silent wrong-answer bug. Copy the option text verbatim into `correct_answer`.
2. **Every question needs `options`.** A `multiple_choice` question with no
   `options` array cannot render and is DROPPED. Always supply 2-6 options.
3. **`true_false` questions**: set `"type": "true_false"`; you may omit `options`
   (the renderer synthesizes `["True", "False"]`) — but then `correct_answer`
   must be exactly `"True"` or `"False"`. Supplying `options: ["True","False"]`
   explicitly is also fine and clearer.
4. **`title` is required and non-empty**, and `questions` MUST be a non-empty
   array. An empty/missing title or a non-array `questions` drops the WHOLE quiz.
5. **Valid JSON only** — double-quoted keys/strings, no trailing commas, no
   comments. Escape any quote inside a string.
6. **Keep both `__kind` markers** — the set carries `"__kind":"quiz_set"` and
   EACH question carries `"__kind":"quiz_question"`.

## Sizing / limits

- 3-10 questions is the sweet spot for one quiz; up to ~20 renders fine.
- 2-6 options per question (4 is typical). More than 6 gets unwieldy.
- Keep each question and option to a single clear line; put nuance in
  `explanation`, which the user sees only after answering.

## Editing etiquette

When the user asks you to change a quiz, return ONE complete updated `quiz_set`
object — the full block, not a diff or a single question:
- Keep `"__kind":"quiz_set"` on the set and `"__kind":"quiz_question"` on every
  question.
- Preserve the questions the user did not ask you to change (same text, options,
  answers) so their progress and the artifact's identity stay stable.
- After editing options, re-check that each `correct_answer` still matches an
  option string verbatim.

## One correct minimal example

```json
{
  "__kind": "quiz_set",
  "title": "Photosynthesis Basics",
  "questions": [
    {
      "__kind": "quiz_question",
      "type": "multiple_choice",
      "question": "Which gas do plants absorb during photosynthesis?",
      "options": ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"],
      "correct_answer": "Carbon dioxide",
      "explanation": "Plants take in carbon dioxide and release oxygen."
    },
    {
      "__kind": "quiz_question",
      "type": "true_false",
      "question": "Photosynthesis occurs in the mitochondria.",
      "options": ["True", "False"],
      "correct_answer": "False",
      "explanation": "It occurs in the chloroplasts, not the mitochondria."
    }
  ]
}
```
$BODY$,
  'ListChecks',
  '["web"]'::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  true,
  true,
  'public',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  NULL,
  NULL,
  0
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'quiz-set' AND created_by IS NULL
);

-- ---------------------------------------------------------------------------
-- 2. Content block — right-click "Quiz" into an agent's system prompt.
--    block_id is UNIQUE → ON CONFLICT (block_id) DO UPDATE.
--    Filed under the shared "Render Blocks" content-block category (6913d9fc-…).
-- ---------------------------------------------------------------------------
INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template, sort_order, is_active,
   category_id, organization_id, version)
VALUES
  (
    'quiz-set',
    'Quiz',
    'An interactive, auto-graded multiple-choice quiz',
    'ListChecks',
    $CB$When the user wants to be tested or to check their understanding, emit an interactive, auto-graded quiz as a single JSON object with "__kind":"quiz_set":

```json
{ "__kind": "quiz_set", "title": "American Revolution Quiz", "questions": [
  { "__kind": "quiz_question", "type": "multiple_choice", "question": "Who was the 'Father of the Constitution'?", "options": ["George Washington", "James Madison", "Benjamin Franklin"], "correct_answer": "James Madison", "explanation": "For his central role in drafting it." }
] }
```

Rules: the set needs `title` + a non-empty `questions` array; each question keeps `"__kind":"quiz_question"`. `correct_answer` MUST be the exact text of one of its `options` (otherwise the wrong answer is marked correct). Every question needs `options` (2-6) or it is dropped; `true_false` may omit them. Valid JSON, no trailing commas. Add an `explanation` per question — the user sees it after answering.$CB$,
    10,
    true,
    '6913d9fc-b8c0-4107-af40-27d55c177694',
    '39c38960-d30c-4840-b0c1-c9960de95582',
    1
  )
ON CONFLICT (block_id) DO UPDATE SET
  label        = EXCLUDED.label,
  description  = EXCLUDED.description,
  icon_name    = EXCLUDED.icon_name,
  template     = EXCLUDED.template,
  sort_order   = EXCLUDED.sort_order,
  is_active    = EXCLUDED.is_active,
  category_id  = EXCLUDED.category_id,
  updated_at   = now();

COMMIT;
