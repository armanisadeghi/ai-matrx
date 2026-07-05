-- ============================================================================
-- render block `tasks` — render-block SKILL + content blocks.
--
-- Teaches agents to emit a ```tasks fence: a GitHub-style markdown checklist
-- that renders as an interactive TaskChecklist (progress bar, check/uncheck,
-- edit/add/delete, "Save as Tasks" into the task manager). Trigger is the
-- fence language `tasks` (SPECIAL_CODE_LANGUAGES in content-splitter-v2.ts and
-- aidream block_detector.py). Unlike the `__kind` JSON kinds (flashcard_set,
-- quiz_set, …), `tasks` is a plain markdown checklist inside the fence — the
-- parser is components/mardown-display/blocks/tasks/tasklist-parser.tsx and the
-- renderer is TasksBlock.tsx → TaskChecklist.tsx.
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
-- mermaid-diagrams / flashcard-set skills and every content_blocks row use).
--
-- Legacy coexistence: no existing content_blocks row or skill.definition row
-- for `tasks` — chosen ids `tasks-block` (skill) and `tasks-checklist` /
-- `tasks-checklist-sections` (content blocks) collide with nothing.
--
-- Idempotent on business keys (skill_id / block_id) so re-apply is safe. Do NOT
-- combine with other blocks' migrations — one file each.
-- ============================================================================

BEGIN;

-- ── 1. System skill: tasks-block ────────────────────────────────────────────
-- skill.definition has NO unique on skill_id (composite scoping) → guard with
-- WHERE NOT EXISTS on the global business key, not ON CONFLICT.

INSERT INTO skill.definition
  (skill_id, label, description, skill_type, body, icon_name,
   is_active, is_system, is_public, visibility,
   category_id, sort_order, version, platform_targets, organization_id)
SELECT
  'tasks-block',
  'Tasks',
  'How and when to emit a ```tasks render block: the GitHub-style markdown checklist syntax (sections, tasks, subtasks, bold), the whitespace/checkbox rules that prevent dropped or unchecked items, sizing guidance, and editing etiquette.',
  'render_block',
  $SKILL_BODY$# Tasks

You can create a live, interactive **task checklist** by emitting a ` ```tasks `
code fence containing a GitHub-style markdown checklist. It renders as a checkable
list with a progress bar ("Main: 3 of 8 · All: 5 of 14 (36%)"), a "hide completed"
toggle, and per-item edit / add / delete — and the user can push the whole list
into their task manager with one click ("Save as Tasks"). Reach for it whenever
the user wants a to-do list, a step-by-step procedure they can tick off, a
checklist, an action plan, acceptance criteria, or any set of items with
done/not-done state.

## How to emit a task list

Open a fence with exactly ` ```tasks ` at the start of a line and put a markdown
checklist inside. Nothing else (no wrapper tags, no JSON) is needed:

```tasks
- [ ] Draft the project brief
- [ ] Review with the team
- [x] Create the shared repository
```

Each line is `- [ ] text` (not done) or `- [x] text` (done). That is the whole
core syntax. The three structural elements — sections, tasks, and subtasks — are
below.

## The three structural elements

**1. Task (top-level item).** A line starting with `- ` or `* ` then a checkbox:

```tasks
- [ ] Book the venue
* [x] Send invitations
```

- `- [ ]` unchecked, `- [x]` checked. Both `-` and `*` bullets work.
- Everything after the checkbox (and one space) is the task title.
- Wrap the title (or its lead) in `**bold**` to emphasize it — the renderer shows
  it in a heavier weight: `- [ ] **Critical:** ship the release`.

**2. Subtask (nested item).** Indent a checkbox line by **2 or more spaces**. It
nests under the most recent top-level task:

```tasks
- [ ] Prepare the presentation
  - [ ] Write the outline
  - [ ] Design the slides
  - [x] Gather the data
- [ ] Rehearse
```

- Indentation of 2+ spaces before the `- [ ]` is what makes it a subtask.
- Checking a parent task auto-checks all its subtasks; the progress bar counts
  main tasks and all items separately.
- Subtasks are one level deep — do not indent a subtask under another subtask.

**3. Section (grouping header).** A line starting with `## ` groups the tasks
that follow it under a heading:

```tasks
## Planning
- [ ] Define scope
- [ ] Set the budget

## Execution
- [ ] Kick off the work
  - [ ] Assign owners
- [ ] Track progress
```

- A section is a container, not a checkable item — it has no checkbox and does
  not count toward progress.
- Every task/subtask after a `## ` header belongs to that section until the next
  `## ` header. Sections are optional — a flat list with no `##` is perfectly
  valid (and common).

## Syntax rules that prevent dropped or mis-rendered items

These are the failure modes the parser (parseMarkdownChecklist) actually enforces
— follow them exactly:

1. There MUST be a space between the checkbox and the text: `- [ ] Task`. Writing
   `- [ ]Task` (no space) fails to match and the line is dropped.
2. The checked marker is a **lowercase `x`** only: `- [x]`. `- [X]` (uppercase)
   is NOT recognized as checked — it renders unchecked (or is dropped). Always
   use lowercase `x`, and a single space for unchecked: `- [ ]`.
3. A subtask needs a real top-level task before it. A checklist that opens with an
   indented subtask (no parent task above it) drops that subtask — start every
   group with a `- [ ]` top-level task.
4. Use spaces, not tabs, for subtask indentation (2+ spaces). A tab may not be
   counted as indentation and the item can collapse to a top-level task.
5. Section headers are `## ` (two hashes + a space). A plain line of text, or a
   `#`/`###` heading, is ignored — it will NOT appear.
6. Plain bullets without a checkbox (`- item`, no `[ ]`) are ignored entirely.
   Every list item you want shown must have `[ ]` or `[x]`.
7. Keep each task on ONE line. The parser reads line by line; a title wrapped
   across two lines loses the second line.
8. `**bold**` is honored only at the START of a title. Inline markdown mid-title
   is shown as literal text — keep titles plain prose plus an optional bold lead.

## Sizing guidance

- A focused list is ~5–25 items. For a large effort, group with `## ` sections
  rather than emitting one long flat wall of checkboxes.
- Subtasks: 2–6 per parent task. More than that, promote them to their own
  top-level tasks or split into a new section.
- If two clearly different efforts are in play, emit two separate ` ```tasks `
  fences with a sentence of context between them, rather than one giant list.

## Editing an existing task list

When asked to modify a task list (yours or one provided as context):

- Return ONE complete ` ```tasks ` fence containing the FULL updated checklist —
  never a single line, a fragment, or prose mixed with a partial list.
- Keep the fence language `tasks` (do not switch to a plain ```markdown fence).
- Preserve the existing checked/unchecked state and the wording of items you
  weren't asked to change; only flip a `[ ]`↔`[x]` or edit the lines requested.
- Keep the section structure (`## ` headers) and subtask nesting intact unless
  asked to reorganize.

## One correct minimal example

```tasks
## Launch checklist
- [ ] **Finalize** the landing page copy
  - [x] Write the headline
  - [ ] Proofread
- [ ] Configure analytics
- [x] Register the domain

## Post-launch
- [ ] Monitor error rates
- [ ] Send the announcement email
```
$SKILL_BODY$,
  'ListChecks',
  true, true, true, 'public',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',  -- platform.categories: dimension 'skill', name 'Render Blocks'
  30, '1.0.0', '["web"]'::jsonb,
  '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'tasks-block'
    AND user_id IS NULL AND project_id IS NULL AND task_id IS NULL
);

-- Keep the body/metadata fresh on re-apply (the guard above only inserts once).
UPDATE skill.definition SET
  label = 'Tasks',
  description = 'How and when to emit a ```tasks render block: the GitHub-style markdown checklist syntax (sections, tasks, subtasks, bold), the whitespace/checkbox rules that prevent dropped or unchecked items, sizing guidance, and editing etiquette.',
  skill_type = 'render_block',
  icon_name = 'ListChecks',
  is_active = true, is_system = true, is_public = true, visibility = 'public',
  category_id = '49c845cb-9314-485c-88ed-a7ace4f286ca',
  version = '1.0.0', platform_targets = '["web"]'::jsonb,
  updated_at = now()
WHERE skill_id = 'tasks-block'
  AND user_id IS NULL AND project_id IS NULL AND task_id IS NULL;

-- ── 2. Content blocks (condensed prompt snippets) ───────────────────────────
-- One primary block for the fence + one section-organized variant. Human labels
-- ("Tasks / Checklist"), a live ```tasks example, tight rules. Idempotent on
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
  ('tasks-checklist', 'Tasks / Checklist',
   'Condensed instructions for emitting a ```tasks checklist render block.',
   'ListChecks', 10,
   $CB$When the user wants a to-do list, checklist, action plan, or step-by-step procedure they can tick off, emit a ```tasks render block — it renders as an interactive checklist with a progress bar and can be saved into their task manager:

```tasks
- [ ] **Draft** the proposal
  - [ ] Outline the sections
  - [x] Collect the data
- [ ] Review with the team
- [x] Create the shared folder
```

- Each item is `- [ ] text` (todo) or `- [x] text` (done) — a space after the checkbox is REQUIRED, and the checked marker is a lowercase `x` (never `[X]`).
- Indent a line by 2+ spaces to make it a subtask nested under the task above it (one level deep). Both `-` and `*` bullets work.
- Wrap the start of a title in `**bold**` to emphasize it. One item per line.
- Plain bullets without `[ ]` are ignored — every shown item needs a checkbox.$CB$),

  ('tasks-checklist-sections', 'Tasks with Sections',
   'A ```tasks checklist grouped into phases with ## section headers.',
   'ListTree', 20,
   $CB$For a larger effort, emit a ```tasks checklist grouped into phases with `## ` section headers:

```tasks
## Planning
- [ ] Define the scope
- [ ] Set the budget

## Execution
- [ ] Kick off the work
  - [ ] Assign owners
  - [ ] Set deadlines
- [x] Create the tracking sheet
```

- A `## ` line (two hashes + a space) starts a section — a heading, not a checkable item. Every task after it belongs to that section until the next `## `.
- Tasks are `- [ ] text` / `- [x] text` (lowercase `x`, space after the checkbox required); indent 2+ spaces for a subtask.
- Sections are optional; a flat list works too. Keep it to ~5–25 items and 2–6 subtasks per task.$CB$)
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
