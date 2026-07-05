-- kind_math_problem_skill.sql
-- ---------------------------------------------------------------------------
-- Render-block SKILL + content blocks for the content-ir kind `math_problem`
-- (with its child kinds `math_solution` and `math_solution_step`).
--
-- Teaches agents to emit a `{"__kind":"math_problem", ...}` JSON block that the
-- content-ir pipeline recognizes live (fenced or bare) and renders as an
-- interactive, worked-solution artifact (MathProblemArtifact → MathProblem,
-- KaTeX-backed).
--
-- Live-verified table names (2026 reorg):
--   skill.definition          (composite unique: skill_id,user_id,organization_id,project_id)
--   public.content_blocks     (UNIQUE (block_id))
--   platform.categories       (dimension-based; render-block cats already exist)
--
-- Global system rows: organization_id = the platform system org
-- (39c38960-d30c-4840-b0c1-c9960de95582 — NOT NULL on both tables, matches every
-- existing render-block skill/content block); user_id/project_id/task_id NULL.
--
-- Idempotent on business keys (skill_id / block_id) so re-apply is safe.
-- Do NOT apply directly — the orchestrator applies all kind skills centrally.
-- ---------------------------------------------------------------------------

BEGIN;

-- ===========================================================================
-- 1. SKILL — skill.definition (skill_id = 'math-problem')
-- ===========================================================================
-- Composite-unique table → insert only when the global row is absent, else
-- refresh the mutable teaching columns. (No ON CONFLICT: the unique is
-- (skill_id,user_id,organization_id,project_id), not (skill_id).)

INSERT INTO skill.definition (
    skill_id, label, description, skill_type, body, icon_name,
    platform_targets, version, category_id,
    is_system, is_public, is_active, disable_auto_invocation, sort_order,
    organization_id, user_id, project_id, task_id, visibility
)
SELECT
    'math-problem',
    'Math Problems',
    'How and when to emit a {"__kind":"math_problem"} render block: the flat problem/solution/step structure, the split KaTeX equation-vs-prose rules that prevent render failures, JSON backslash escaping, sizing guidance, and editing etiquette.',
    'render_block',
    $BODY$# Math Problems

You can present a fully worked math problem as a live, interactive block by
emitting a single JSON object carrying `"__kind": "math_problem"`. It renders
progressively as you stream, persists as a versioned artifact the user can open
full-screen, print, download, and hand to another agent to edit later.

Reach for it whenever the user wants a problem *worked out* — a step-by-step
solution, a tutoring walkthrough, a worked example for a lesson — rather than a
one-line answer. Equations render with KaTeX, so fractions, roots, exponents,
integrals, and Greek symbols all typeset properly.

## How to emit one

Emit one JSON object. The system recognizes it whether bare or inside a
```json fence — a fence is fine for readability:

```json
{
  "__kind": "math_problem",
  "title": "Solving a Linear Equation",
  "topic_name": "Algebra",
  "course_name": "Algebra I",
  "module_name": "Linear Equations",
  "problem_statement": {
    "text": "Solve the following equation for x.",
    "equation": "2x + 3 = 11",
    "instruction": "Isolate x on one side."
  },
  "solutions": [
    {
      "__kind": "math_solution",
      "task": "Solve for x",
      "steps": [
        {
          "__kind": "math_solution_step",
          "title": "Subtract 3 from both sides",
          "equation": "2x = 8",
          "explanation": "Cancel the constant term on the left."
        },
        {
          "__kind": "math_solution_step",
          "title": "Divide both sides by 2",
          "equation": "x = \\frac{8}{2} = 4",
          "explanation": "Isolate x."
        }
      ],
      "solutionAnswer": "x = 4"
    }
  ],
  "hint": "Undo addition before undoing multiplication."
}
```

## The structure (three nested `__kind`s)

The block is FLAT — no `math_problem` wrapper key. Every object carries its own
`__kind`; children are objects inside arrays.

**`math_problem`** (the root)
- `__kind` — always the literal string `"math_problem"`. *(required)*
- `title` — short problem title. *(required)*
- `problem_statement` — an object `{ text, equation, instruction }`, ALL three
  strings required. *(required)*
- `solutions` — array of `math_solution` objects, at least one. *(required)*
- `course_name`, `topic_name`, `module_name` — context strings (rendered as a
  subtitle). Provide them when you know them.
- `hint` — a single nudge string. *(optional)*
- `intro_text`, `description`, `final_statement` — prose framing around the
  problem. *(optional)*
- `difficulty_level` — one of `"easy" | "medium" | "hard"`. *(optional)*
- `resources`, `related_content` — arrays of strings. *(optional)*

**`math_solution`** (each entry of `solutions`)
- `__kind` — `"math_solution"`. *(required)*
- `task` — what this solution solves (its heading). *(required)*
- `steps` — array of `math_solution_step` objects. *(required)*
- `solutionAnswer` — the final answer for this solution. *(required)*
- `transitionText` — optional bridging prose after the steps, or `null`.

**`math_solution_step`** (each entry of `steps`)
- `__kind` — `"math_solution_step"`. *(required)*
- `title` — what the step does (e.g. "Divide both sides by 2"). *(required)*
- `equation` — the equation at this step. *(required)*
- `explanation` — why the step is valid. *(optional)*
- `simplified` — a simplified/cleaned-up form of the equation. *(optional)*

Emit a SEPARATE solution object only for a genuinely different method; multiple
approaches to the same problem is the intended use of a multi-element
`solutions` array — not one solution split arbitrarily.

## Equation vs. prose — the rule that prevents broken output

This block has TWO kinds of fields, rendered two different ways. Getting this
wrong is the #1 cause of broken math blocks:

1. **`equation` fields are RAW KaTeX with NO delimiters.**
   The `equation` inside `problem_statement`, every step's `equation`, and a
   `solutionAnswer` that is pure math all go straight into a KaTeX block
   renderer. Write the LaTeX body ONLY — never wrap it in `$…$` or `\(…\)`.
   - Right: `"equation": "x = \\frac{8}{2}"`
   - Wrong: `"equation": "$x = \\frac{8}{2}$"`  (the `$` becomes literal text)

2. **Prose fields carry INLINE math in `$…$` or `\(…\)`.**
   `text`, `instruction`, `explanation`, `title`, `intro_text`, `description`,
   `final_statement`, `task`, `transitionText`, `hint` are read as text with
   embedded math. To typeset math mid-sentence, delimit it:
   - `"explanation": "Because $2x = 8$, dividing by 2 gives the result."`
   - Bare, well-known commands (`\\frac`, `\\sqrt`, `x^{2}`, `x_{i}`) are also
     auto-detected in prose even without delimiters, but delimiting is safest.

3. **`solutionAnswer`** may be pure LaTeX (`"x = 4"` → typeset as a block) OR
   mixed prose with `$…$`/`\(…\)`. For a multi-line answer, separate lines with
   a literal `\n` inside the string.

## JSON escaping — double every backslash

You are emitting JSON, so every LaTeX backslash must be DOUBLED in the source:
- `\frac{1}{2}` → write `"\\frac{1}{2}"`
- `\sqrt{x}` → write `"\\sqrt{x}"`
- `\cdot`, `\pi`, `\theta`, `\int` → `"\\cdot"`, `"\\pi"`, `"\\theta"`, `"\\int"`

A single backslash in JSON (`"\frac"`) is an invalid/again-corrupted escape
(`\f` = form-feed) and will mangle the equation. The renderer repairs some
common corruption defensively, but that is a safety net — always emit valid,
double-escaped JSON. Never put a literal newline inside a string value; use `\n`.

## Sizing and limits

- One problem per block. For a set of problems, emit several blocks with a
  sentence between them — do not cram multiple problems into one.
- Keep a solution to roughly 3–8 steps; if it needs more, it is usually two
  problems. Split it.
- Provide 1–3 `solutions` at most (alternate methods), not a long list.
- Fill `course_name` / `topic_name` / `module_name` when known — they render as
  the problem's context subtitle and make saved problems findable.

## Editing an existing math problem

When asked to modify a problem (yours or one provided as context):
- Return ONE complete, valid `math_problem` JSON object — the FULL updated
  block, never a fragment, a diff, or prose describing the change.
- Keep every `__kind` intact on the root and on every child object.
- Preserve fields, steps, and solutions you were not asked to change so the
  version history stays a clean diff.
- Keep the equation-vs-prose and double-backslash rules above on every edit.
$BODY$,
    'Sigma',
    '["web"]'::jsonb,
    '1.0.0',
    '49c845cb-9314-485c-88ed-a7ace4f286ca',  -- platform.categories: dimension 'skill', "Render Blocks"
    true,   -- is_system
    true,   -- is_public
    true,   -- is_active
    false,  -- disable_auto_invocation
    10,     -- sort_order
    '39c38960-d30c-4840-b0c1-c9960de95582',  -- system org
    NULL, NULL, NULL,                         -- user/project/task = global
    'public'
WHERE NOT EXISTS (
    SELECT 1 FROM skill.definition
    WHERE skill_id = 'math-problem'
      AND user_id IS NULL
      AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
      AND project_id IS NULL
);

-- Refresh the mutable teaching columns on re-apply (keeps the row current
-- without duplicating; matches the composite-unique scope above).
UPDATE skill.definition SET
    label            = 'Math Problems',
    description      = 'How and when to emit a {"__kind":"math_problem"} render block: the flat problem/solution/step structure, the split KaTeX equation-vs-prose rules that prevent render failures, JSON backslash escaping, sizing guidance, and editing etiquette.',
    skill_type       = 'render_block',
    icon_name        = 'Sigma',
    platform_targets = '["web"]'::jsonb,
    version          = '1.0.0',
    category_id      = '49c845cb-9314-485c-88ed-a7ace4f286ca',
    is_system        = true,
    is_public        = true,
    is_active        = true,
    visibility       = 'public',
    updated_at       = now()
WHERE skill_id = 'math-problem'
  AND user_id IS NULL
  AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND project_id IS NULL;

-- ===========================================================================
-- 2. CONTENT BLOCK — public.content_blocks (block_id = 'math-problem-kind')
-- ===========================================================================
-- Reuses the existing shared shortcut/content-block category "Render Blocks"
-- (6913d9fc-b8c0-4107-af40-27d55c177694). UNIQUE (block_id) → ON CONFLICT.
-- Uses 'math-problem-kind' so it COEXISTS with the legacy 'math-problem' block
-- (which teaches the old shape) rather than clobbering it.

INSERT INTO public.content_blocks (
    block_id, label, description, icon_name, template,
    sort_order, is_active, category_id, organization_id,
    user_id, project_id, task_id, version, metadata
)
VALUES (
    'math-problem-kind',
    'Math Problems',
    'Teach an agent to work a problem step-by-step as an interactive {"__kind":"math_problem"} block.',
    'Sigma',
    $CB$When you work a problem step-by-step, emit it as a math_problem block so equations typeset and the solution renders interactively:

```json
{ "__kind": "math_problem", "title": "Solve for x", "topic_name": "Algebra",
  "problem_statement": { "text": "Solve the equation.", "equation": "2x + 3 = 11", "instruction": "Isolate x." },
  "solutions": [ { "__kind": "math_solution", "task": "Solve for x", "solutionAnswer": "x = 4",
    "steps": [
      { "__kind": "math_solution_step", "title": "Subtract 3", "equation": "2x = 8" },
      { "__kind": "math_solution_step", "title": "Divide by 2", "equation": "x = \\frac{8}{2} = 4" } ] } ] }
```

Rules: `equation` fields are RAW KaTeX with NO `$` delimiters; prose fields (`text`, `explanation`, `instruction`) put math in `$…$`. Double every backslash in JSON (`\\frac`, `\\sqrt`). Keep every `__kind`. `title`, `problem_statement{text,equation,instruction}`, and `solutions[]` are required; each solution needs `task`, `steps[]`, `solutionAnswer`.$CB$,
    10,
    true,
    '6913d9fc-b8c0-4107-af40-27d55c177694',  -- platform.categories: shortcut/content-block "Render Blocks"
    '39c38960-d30c-4840-b0c1-c9960de95582',  -- system org
    NULL, NULL, NULL,
    1,
    '{}'::jsonb
)
ON CONFLICT (block_id) DO UPDATE SET
    label          = EXCLUDED.label,
    description    = EXCLUDED.description,
    icon_name      = EXCLUDED.icon_name,
    template       = EXCLUDED.template,
    sort_order     = EXCLUDED.sort_order,
    is_active      = EXCLUDED.is_active,
    category_id    = EXCLUDED.category_id,
    updated_at     = now();

COMMIT;
