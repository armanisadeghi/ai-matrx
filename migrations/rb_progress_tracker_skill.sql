-- rb_progress_tracker_skill.sql
-- Render-block skill + content blocks for the <progress_tracker> XML-tag block.
--
-- Trigger (exact): the XML tag <progress_tracker> … </progress_tracker>
--   (registered in content-splitter-v2.ts XML_TAG_BLOCKS.progress_tracker = ["<progress_tracker>"])
-- Renderer:  components/mardown-display/blocks/progress/ProgressTrackerBlock.tsx  (live, healthy)
-- Parser:    components/mardown-display/blocks/progress/parseProgressMarkdown.ts
--
-- COEXISTENCE: legacy public.content_blocks rows "progress-tracker" and
-- "progress-tracker-detailed" already exist in a DIFFERENT category
-- (412877af-21b0-4db8-bdb7-89ab22eb1587). We do NOT touch them. New rows below use
-- fresh ids ("progress-tracker-block", "progress-tracker-detailed-block") in the
-- shared Render Blocks content-block category (6913d9fc-...).
--
-- Idempotent. Schema-qualified. Does NOT create new platform.categories rows.
-- Apply centrally with the other render-block skill migrations.

BEGIN;

-- ============================================================================
-- 1) SKILL  →  skill.definition (skill_id = 'progress-tracker')
-- ============================================================================

INSERT INTO skill.definition (
  skill_id, label, description, skill_type,
  is_system, is_active, visibility,
  platform_targets, semver, icon_name,
  organization_id, category_id, sort_order,
  disable_auto_invocation, body
)
SELECT
  'progress-tracker',
  'Progress Tracker',
  'How and when to emit <progress_tracker> render blocks: the tag, the inner markdown checklist structure, per-item modifiers (priority / hours / optional), syntax rules that prevent render failures, sizing guidance, and editing etiquette.',
  'render_block'::public.skl_skill_type,
  true, true, 'public'::platform.visibility,
  '["web"]'::jsonb,
  '1.0.0',
  'ListChecks',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  0,
  false,
  $BODY$# Progress Tracker

You can render a live, interactive progress tracker by wrapping a small markdown
checklist in a `<progress_tracker>` tag. It renders as a rich card: an overall
progress bar, per-category collapsible sections with their own bars, stat tiles
(total / completed / remaining / categories), priority filters, a "Reset" control,
and a celebration state at 100%. Every item is a real checkbox the user can toggle;
the tracker can also be imported into Tasks or opened on the Canvas. Prefer it
whenever the user wants a checklist, a roadmap, a study plan, an onboarding
sequence, a launch checklist, or any set of tasks grouped into sections with a
sense of "how far along am I".

## How to emit a progress tracker

Wrap the content in the tag on its own lines. The body is ordinary markdown:

```
<progress_tracker>
### Course Launch Checklist
Everything left before we ship the new onboarding course.

**Content Production** (60% complete)
- [x] Outline all modules
- [x] Record intro video {high} (2h)
- [ ] Record module 1–3 {high} (6h)
- [ ] Edit captions [optional]

**Marketing**
- [ ] Draft launch email {medium} (1h)
- [ ] Schedule social posts {low} (30min)
</progress_tracker>
```

That is the whole contract — one tag, a title, optional description, and one or
more categories each holding checkbox items.

## Inner structure (what the parser reads)

Read top to bottom:

1. **Title** — a single `### ` heading. Optional; defaults to "Progress Tracker".
2. **Description** — the first plain text line after the title that is NOT a
   heading, NOT a `**bold**` category header, and NOT a `- ` list item. Optional.
3. **Categories** — each starts with a bold header on its own line:
   `**Category Name**` or `**Category Name** (NN% complete)`.
4. **Items** — under a category, one per line, starting with `- [x] ` (done) or
   `- [ ] ` (not done), then the task text with optional inline modifiers.

### Per-item modifiers (all optional, any combination, any order after the text)

| Modifier      | Syntax                | Meaning                                   |
|---------------|-----------------------|-------------------------------------------|
| Priority      | `{high}` `{medium}` `{low}` | Colored priority pill; enables the priority filter. |
| Estimated time| `(2h)` `(1.5h)` `(30min)`   | Shows a clock estimate (minutes convert to hours). |
| Optional      | `[optional]`          | Marks the item as optional (blue pill).   |

Example of a fully decorated item:

```
- [ ] Write integration tests {high} (3h) [optional]
```

## Syntax rules that PREVENT render failures

These come straight from the parser — violating them silently drops content:

- **Every item MUST live under a `**Category**` header.** Items placed before the
  first category header are IGNORED — unless there are NO category headers at all,
  in which case every item collapses into one auto-named "Tasks" bucket. So: EITHER
  give real categories and put all items beneath them, OR use no headers and let the
  single default bucket form. Never mix (a header plus stray items above it loses
  the stray items).
- **Checkbox syntax is exact:** the line must start with `- [x] ` or `- [ ] `
  (hyphen, space, bracket, single `x` or single space, bracket, space). `* [ ]`,
  `- []`, `- [X]` at the start, or nested/indented items are NOT recognized.
  Wrong: `* [ ] Task` / `- [] Task`. Right: `- [ ] Task`.
- **Category headers must open with `**`** at the start of the line. The optional
  suffix is literally `(NN% complete)` — e.g. `**Design** (40% complete)`. Any
  other parenthetical after the name is ignored (the % is recomputed from checked
  items anyway).
- **One `### ` title max.** A second `### ` line overwrites the first.
- **Blank lines are fine** and encouraged between categories; they are stripped
  before parsing. Do not rely on them to separate items within a category.
- **Do not nest** a `<progress_tracker>` inside another block (no `<artifact>`
  wrapper, no code fence) — the tag itself is the block.

## Sizing / limits

- Aim for 1–8 categories and 3–15 items each. It stays readable up to a few dozen
  items; beyond ~60 items consider splitting into separate trackers.
- Keep item text to a short phrase (a task, not a paragraph). Put detail in the
  description line, not in item text.
- Priority and hours are optional flavor — omit them when they add noise.

## Editing etiquette

When a user asks to change a tracker, return ONE complete, updated
`<progress_tracker>` block:

- Keep the SAME tag (`<progress_tracker>`), never switch to a code fence or list.
- Preserve the title and category names unless the user asks to rename them, so
  the user's checked-off state stays meaningful across edits.
- Emit the full tracker, not a diff or a single changed line.
- Reflect completion by moving `- [ ]` ↔ `- [x]`; don't add a separate "done" list.

## Complete minimal example

```
<progress_tracker>
### Onboarding
Steps to get a new engineer productive in week one.

**Setup**
- [x] Grant repo access {high}
- [x] Install toolchain (1h)
- [ ] Configure local env {medium} (1h)

**First Contribution**
- [ ] Pick a starter issue [optional]
- [ ] Open first PR {high} (3h)
</progress_tracker>
```
$BODY$
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'progress-tracker' AND created_by IS NULL
);

-- ============================================================================
-- 2) CONTENT BLOCKS  →  public.content_blocks
--    New ids (coexist with legacy 'progress-tracker' / 'progress-tracker-detailed').
-- ============================================================================

INSERT INTO public.content_blocks (
  block_id, label, description, icon_name, template,
  category_id, organization_id, version, is_active, sort_order, metadata
) VALUES (
  'progress-tracker-block',
  'Progress Tracker',
  'Interactive checklist card with per-category progress bars, priorities, and completion stats.',
  'ListChecks',
  $CB$Render an interactive progress tracker for a grouped checklist. Emit a single <progress_tracker> block:

<progress_tracker>
### Project Roadmap
**Phase 1**
- [x] Kickoff meeting {high}
- [ ] Requirements doc {high} (2h)
**Phase 2**
- [ ] Build MVP {medium} (8h) [optional]
</progress_tracker>

Rules: start with a `### ` title. Every item must sit under a `**Category**` header. Items are exactly `- [x] ` (done) or `- [ ] ` (todo). Optional per-item modifiers: priority `{high|medium|low}`, time `(2h)`/`(30min)`, `[optional]`. Return the whole block when editing; keep the tag.$CB$,
  '6913d9fc-b8c0-4107-af40-27d55c177694',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  1, true, 0, '{}'::jsonb
)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name,
  template = EXCLUDED.template,
  category_id = EXCLUDED.category_id,
  organization_id = EXCLUDED.organization_id,
  version = EXCLUDED.version,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.content_blocks (
  block_id, label, description, icon_name, template,
  category_id, organization_id, version, is_active, sort_order, metadata
) VALUES (
  'progress-tracker-detailed-block',
  'Progress Tracker (Detailed)',
  'Progress tracker with multiple categories, priorities, time estimates, and optional items.',
  'ListChecks',
  $CB$Render a detailed multi-category progress tracker. Emit one <progress_tracker> block using priorities, time estimates, and optional flags:

<progress_tracker>
### Launch Checklist
Everything left before we ship.

**Engineering** (50% complete)
- [x] API endpoints {high} (4h)
- [ ] Load testing {medium} (3h)
- [ ] Rollback plan {high} (1h) [optional]

**Marketing**
- [ ] Announcement email {medium} (1h)
- [ ] Social posts {low} (30min)
</progress_tracker>

Rules: one `### ` title, optional description line, then `**Category**` headers (optionally `(NN% complete)`). Items are `- [x] `/`- [ ] ` with optional `{high|medium|low}`, `(2h)`/`(30min)`, `[optional]`. Never leave items above the first category — they get dropped.$CB$,
  '6913d9fc-b8c0-4107-af40-27d55c177694',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  1, true, 1, '{}'::jsonb
)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name,
  template = EXCLUDED.template,
  category_id = EXCLUDED.category_id,
  organization_id = EXCLUDED.organization_id,
  version = EXCLUDED.version,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  metadata = EXCLUDED.metadata,
  updated_at = now();

COMMIT;
