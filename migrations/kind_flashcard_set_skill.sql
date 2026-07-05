-- ============================================================================
-- content-ir kind `flashcard_set` — render-block SKILL + content blocks.
--
-- Teaches agents to emit the canonical `{"__kind":"flashcard_set", ...}` JSON
-- structured-content block. Unlike mermaid (a ```mermaid fence), flashcard_set
-- is emitted as a bare JSON object carrying `"__kind"`; the content-IR pipeline
-- recognizes it live whether fenced (```json) or unfenced, streams it card-by-
-- card into the existing FlashcardsBlock, and materializes it into an editable,
-- versioned artifact.
--
-- Live schema (post-2026 reorg — NOT the stale skl_*/shortcut_categories the
-- mermaid migrations used):
--   * skill.definition        — the teaching skill (skill_type='render_block').
--   * platform.categories      — dimension-based categories (both REUSED here):
--       - skill    dimension → existing "Render Blocks" cat 49c845cb-… (skill).
--       - shortcut dimension, placement_type='content-block' → existing shared
--         "Render Blocks" content-block cat 6913d9fc-… (no new category created).
--   * public.content_blocks    — the right-click "inject into system prompt"
--         snippet(s).
--
-- Scope: system + public, global — user_id/project_id/task_id NULL. NOTE:
-- organization_id is NOT NULL on both skill.definition and public.content_blocks,
-- so "global" here means the platform org 39c38960-… (exactly what the live
-- mermaid-diagrams skill and every existing content_blocks row use). The brief's
-- "all scope columns NULL" is corrected to this by the live constraint.
--
-- Idempotent on business keys (skill_id / block_id / category identity) so
-- re-apply is safe. Do NOT combine with other kinds' migrations — one file each.
-- ============================================================================

BEGIN;

-- Platform org that owns global system content (matches skill.definition
-- 'mermaid-diagrams' and every public.content_blocks row).
-- Kept inline (no session GUC) so the file is a single self-contained script.

-- ── 1. System skill: flashcard-set ──────────────────────────────────────────
-- skill.definition has NO unique on skill_id (composite scoping) → guard with
-- WHERE NOT EXISTS on the global business key, not ON CONFLICT.

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, is_public, visibility,
   category_id, sort_order, version, platform_targets, organization_id)
SELECT
  'flashcard-set',
  'Flashcards',
  'How and when to emit a flashcard_set render block: the "__kind" JSON shape, the four card variants (basic / cloze / enhanced / tiered), the fields that prevent dropped cards, sizing guidance, and editing etiquette.',
  'render_block',
  $SKILL_BODY$# Flashcards

You can create a live, interactive **flashcard set** by emitting a single JSON
object marked with `"__kind": "flashcard_set"`. It renders progressively while
you stream — each card appears the moment its front and back arrive — and then
persists as a versioned artifact the user can flip, study in full-screen "flash
mode", print, share, and edit later. Reach for flashcards whenever the user is
studying, memorizing, drilling vocabulary or definitions, or asks you to "quiz
me" on recall-style material.

## How to emit a flashcard set

Emit one JSON object. It may sit inside a ` ```json ` fence for clarity or stand
bare in the message — the pipeline recognizes `"__kind": "flashcard_set"` either
way. Nothing else (no wrapper tags) is needed:

```json
{
  "__kind": "flashcard_set",
  "title": "Cell Biology Basics",
  "cards": [
    { "__kind": "flashcard", "front": "What is the powerhouse of the cell?", "back": "The mitochondrion." },
    { "__kind": "flashcard", "front": "What molecule stores genetic information?", "back": "DNA (deoxyribonucleic acid)." }
  ]
}
```

Rules:
- ONE flashcard set per JSON object. The root `__kind` is exactly `flashcard_set`.
- The root has two required fields: `title` (a string) and `cards` (an array).
- Every card in `cards` carries its OWN `__kind` (see the card variants below).
- It is valid JSON — double-quoted keys and strings, no trailing commas, no
  comments. A single malformed object drops the whole block.

## The root shape

| Field | Type | Required | Notes |
|---|---|---|---|
| `__kind` | string | yes | Always the literal `"flashcard_set"`. |
| `title` | string | yes | The set name, shown as the heading. |
| `cards` | array | yes | One or more card objects (see variants). |

## Card variants (choose per card — mix freely in one set)

Each card is its own object with a `__kind`. Pick the simplest variant that fits
the card; you can mix all four in a single set.

**1. `flashcard` — the default.** Front, back, and optional study metadata.

```json
{ "__kind": "flashcard", "front": "Capital of Japan?", "back": "Tokyo",
  "topic": "World Capitals", "difficulty": "easy", "tags": ["geography", "asia"] }
```
- Required: `__kind`, `front`, `back` (both non-empty strings).
- Optional: `topic` (string), `difficulty` (string, e.g. easy/medium/hard),
  `tags` (array of strings).
- Use `card_kind: "cloze"` on a `flashcard` for fill-in-the-blank prompts —
  write the blank as `___` in the front:
  ```json
  { "__kind": "flashcard", "card_kind": "cloze",
    "front": "The chemical symbol for gold is ___.", "back": "Au" }
  ```

**2. `enhanced_flashcard` — a card with a deeper explanation.** Same as
`flashcard`, plus a long-form explanation and/or an audio explanation URL. Use it
when the back is a short answer but the concept deserves elaboration.

```json
{ "__kind": "enhanced_flashcard",
  "front": "What is the first law of thermodynamics?",
  "back": "Energy cannot be created or destroyed, only transformed.",
  "detailed_explanation": "It is the principle of conservation of energy applied to thermodynamic systems: the change in internal energy equals heat added minus work done by the system (ΔU = Q − W).",
  "topic": "Physics", "difficulty": "medium" }
```
- Extra optional fields: `detailed_explanation` (string), `audio_explanation`
  (a URL string).

**3. `tiered_flashcard` — a headline card that expands into subcards.** Use it
for a broad question whose answer is best broken into several smaller Q&A pairs
the learner can drill after the overview.

```json
{ "__kind": "tiered_flashcard",
  "front": "What are the key causes of the French Revolution?",
  "back": "Financial crisis, social inequality, Enlightenment ideas, and weak leadership.",
  "difficulty": "hard",
  "subcards": [
    { "__kind": "basic_card", "front": "What financial problem did France face?", "back": "Massive debt from wars and lavish court spending." },
    { "__kind": "basic_card", "front": "Which social group bore the tax burden?", "back": "The Third Estate (commoners)." }
  ] }
```
- Required: `__kind`, `front`, `back`, `subcards`.
- Each entry in `subcards` is a **`basic_card`** (`__kind: "basic_card"`, required
  `front`+`back`; optional `topic`, `difficulty`). Subcards do NOT nest further.

## Syntax rules that prevent dropped cards

These are the failure modes the renderer actually enforces — follow them exactly:

1. A card renders ONLY when both `front` and `back` are non-empty strings. A card
   missing either (or with an empty `front`) is silently dropped — never emit a
   half-card as a placeholder.
2. `front` and `back` are plain strings. Markdown inside them (bold, lists, code)
   is fine; keep each side focused — one question, one answer.
3. The root `title` is required. (The legacy key `set_title` is tolerated as an
   alias, but always emit `title`.)
4. Keep `__kind` on the root AND on every card/subcard. A card without its own
   `__kind` falls back to the generic renderer and loses variant styling.
5. Valid JSON only: no trailing commas, no comments, no single quotes, no
   unescaped newlines inside strings (write `\n` if you truly need one).
6. `tags` is an array of strings, never a comma-joined string.

## Sizing guidance

- A focused set is ~5–20 cards. For a big topic, prefer one well-scoped set over
  a sprawling 60-card dump; split distinct subjects into separate sets, each its
  own `flashcard_set` object with a sentence between them.
- Reserve `tiered_flashcard` for genuinely multi-part answers — most cards should
  be plain `flashcard`. Reserve `enhanced_flashcard` for cards where the extra
  explanation adds real value.
- `subcards`: 2–5 per tiered card. More than that, promote them to their own
  top-level cards.

## Editing an existing set

When asked to modify a flashcard set (yours or one provided as context):

- Return ONE complete `flashcard_set` JSON object containing the FULL updated set
  — never a single card, a fragment, or prose mixed with partial JSON.
- Keep the root `__kind: "flashcard_set"` and every card's `__kind`.
- Preserve the cards and fields you weren't asked to change (the platform tracks
  versions; minimal diffs keep history readable).
- Keep the `title` unless asked to rename the set.
- To add cards, append them to `cards`; to remove, omit them — do not leave an
  emptied-out card in place.

## One correct minimal example

```json
{
  "__kind": "flashcard_set",
  "title": "Spanish Greetings",
  "cards": [
    { "__kind": "flashcard", "front": "Hello", "back": "Hola", "topic": "Greetings", "difficulty": "easy" },
    { "__kind": "flashcard", "card_kind": "cloze", "front": "Good morning = Buenos ___.", "back": "días" }
  ]
}
```
$SKILL_BODY$,
  'Layers',
  true, true, true, 'public',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',  -- platform.categories: dimension 'skill', name 'Render Blocks'
  20, '1.0.0', '["web"]'::jsonb,
  '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'flashcard-set'
    AND user_id IS NULL AND project_id IS NULL AND task_id IS NULL
);

-- Keep the body/metadata fresh on re-apply (the guard above only inserts once).
UPDATE skill.definition SET
  label = 'Flashcards',
  description = 'How and when to emit a flashcard_set render block: the "__kind" JSON shape, the four card variants (basic / cloze / enhanced / tiered), the fields that prevent dropped cards, sizing guidance, and editing etiquette.',
  skill_type = 'render_block',
  icon_name = 'Layers',
  is_active = true, is_system = true, is_public = true, visibility = 'public',
  category_id = '49c845cb-9314-485c-88ed-a7ace4f286ca',
  version = '1.0.0', platform_targets = '["web"]'::jsonb,
  updated_at = now()
WHERE skill_id = 'flashcard-set'
  AND user_id IS NULL AND project_id IS NULL AND task_id IS NULL;

-- ── 2. Content blocks (condensed prompt snippets) ───────────────────────────
-- One primary block for the kind + one study-framed variant. Human labels
-- ("Flashcards"), a live ```json __kind example, tight rules. Idempotent on
-- content_blocks.block_id (UNIQUE) via ON CONFLICT. Filed under the shared
-- "Render Blocks" content-block category (6913d9fc-…) — no new category.

INSERT INTO public.content_blocks
  (block_id, label, description, icon_name, template, category_id, sort_order, is_active, organization_id)
SELECT
  v.block_id, v.label, v.description, v.icon_name, v.template,
  '6913d9fc-b8c0-4107-af40-27d55c177694',
  v.sort_order, true,
  '39c38960-d30c-4840-b0c1-c9960de95582'
FROM (VALUES
  ('flashcard-set', 'Flashcards',
   'Condensed instructions for emitting a flashcard_set render block.',
   'Layers', 10,
   $CB$When the user is studying, memorizing, or wants to be quizzed on recall material, emit a flashcard set — it renders live as flippable cards and becomes an editable, shareable study artifact:

```json
{ "__kind": "flashcard_set", "title": "Set title", "cards": [
  { "__kind": "flashcard", "front": "Question?", "back": "Answer.", "topic": "Topic", "difficulty": "easy", "tags": ["tag"] },
  { "__kind": "flashcard", "card_kind": "cloze", "front": "Fill the ___.", "back": "blank" }
] }
```

- Root `__kind` is `flashcard_set`; `title` and `cards` are required. Every card carries its own `__kind`.
- A card renders only if BOTH `front` and `back` are non-empty strings — never emit a half-card.
- Variants: `flashcard` (default; add `card_kind:"cloze"` for fill-in-the-blank), `enhanced_flashcard` (adds `detailed_explanation` / `audio_explanation`), `tiered_flashcard` (adds `subcards` of `basic_card`).
- Valid JSON only — no trailing commas. Keep sets focused (~5–20 cards); `tags` is an array.$CB$),

  ('flashcard-set-tiered', 'Tiered Flashcards',
   'Flashcards where a headline card expands into drill-down subcards.',
   'ListTree', 20,
   $CB$For a broad question best drilled as several smaller Q&A pairs, emit a flashcard set using tiered cards:

```json
{ "__kind": "flashcard_set", "title": "Set title", "cards": [
  { "__kind": "tiered_flashcard", "front": "Big-picture question?", "back": "Concise overview answer.", "difficulty": "hard", "subcards": [
    { "__kind": "basic_card", "front": "Sub-question 1?", "back": "Answer 1." },
    { "__kind": "basic_card", "front": "Sub-question 2?", "back": "Answer 2." }
  ] }
] }
```

- Root `__kind` is `flashcard_set` with required `title` + `cards`; each card keeps its own `__kind`.
- A `tiered_flashcard` requires `front`, `back`, and `subcards`; each subcard is a `basic_card` with `front`+`back`.
- Use 2–5 subcards per tiered card; mix plain `flashcard` cards in the same set freely. Valid JSON, no trailing commas.$CB$)
) AS v(block_id, label, description, icon_name, sort_order, template)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name,
  template = EXCLUDED.template,
  category_id = EXCLUDED.category_id,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

COMMIT;
