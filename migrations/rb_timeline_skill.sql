-- rb_timeline_skill.sql
-- Render-block SKILL + content block for the `timeline` render block.
-- Trigger: the XML tag <timeline>…</timeline> (XML_TAG_BLOCKS.timeline in
-- components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts).
-- Parser: components/mardown-display/blocks/timeline/parseTimelineMarkdown.ts
-- Renderer: components/mardown-display/blocks/timeline/TimelineBlock.tsx
--           (unified artifact renderer; renders live + persists as an editable artifact).
--
-- Idempotent, schema-qualified. Do NOT clobber the legacy <timeline> content blocks
-- (block_id timeline / simple-timeline / complex-timeline / timeline-skill), nor the
-- unrelated mermaid-timeline block. We add ONE new content block with a fresh id.
--
-- Global org (system-owned): organization_id = 39c38960-d30c-4840-b0c1-c9960de95582
-- Skill category  (dimension=skill,    "Render Blocks"): 49c845cb-9314-485c-88ed-a7ace4f286ca
-- Block category  (dimension=shortcut, "Render Blocks"): 6913d9fc-b8c0-4107-af40-27d55c177694

BEGIN;

-- ============================================================================
-- SKILL → skill.definition (skill_id = 'timeline-block')
-- Composite unique (skill_id,user_id,organization_id,project_id): insert-if-absent,
-- then mirror the body on re-apply so re-running refreshes content.
-- ============================================================================

INSERT INTO skill.definition (
  skill_id, label, description, skill_type, body, icon_name,
  platform_targets, version, category_id,
  is_active, is_system, is_public, visibility,
  organization_id
)
SELECT
  'timeline-block',
  'Timeline',
  'Emit a live, interactive timeline of phased events with dates, categories, and status — a <timeline> XML block that renders progressively and persists as an editable artifact.',
  'render_block'::skl_skill_type,
  $BODY$# Timeline

You can render a live, interactive **timeline** by emitting a single `<timeline>` XML
block. It renders progressively while you stream and persists as an editable artifact:
the user can check events off (a live progress bar tracks completion), filter by
category, collapse phases, import the whole timeline into the Task Manager, print it,
and other agents can edit it later. Prefer a timeline whenever the user asks about a
schedule, roadmap, project plan, sequence of milestones, phased rollout, historical
sequence, or "what happens when".

## When to use it

- **Project / product roadmap** — phases with dated milestones and deliverables.
- **Historical sequence** — events over time grouped into eras or periods.
- **Study / treatment / onboarding plan** — weeks or stages with actionable items.
- **Release schedule** — versioned phases, each with dated work.

If the user just wants a diagram of a process or dependency graph, prefer a mermaid
diagram instead. Use a timeline when the organizing axis is **time grouped into
named periods**.

## The exact block + inner structure

Emit ONE `<timeline>` … `</timeline>` block. Inside it, in this order:

1. **Title** — a single `### Title` markdown header. This is the first thing inside the
   block. (If omitted, the block falls back to the literal title "Timeline".)
2. **Description** (optional) — one plain paragraph immediately after the title. It must
   NOT start with `#`, `**`, or `-`.
3. **One or more periods**, each introduced by a bold header on its own line:
   `**Phase 1: Foundation**`
4. **Events** under each period — top-level bullets starting with `- ` at the start of
   the line. Event line format (all parts after the title are optional):

   `- **Event Title** (Date) [Category] status`

   - **Title** — bold (`**…**`) or plain text.
   - **Date** — wrapped in parentheses: `(Jan–Feb 2024)`. Shown with a clock icon; if
     absent it renders as `TBD`.
   - **Category** — wrapped in square brackets: `[Research]`. Feeds the category filter.
   - **Status** — the word `completed`, `in-progress` (or `in progress`), or `pending`
     appearing after the category. Sets the event's status icon/color.
5. **Event description** (optional) — put it on the line(s) directly under the event
   bullet, either as plain indented text or as an indented sub-bullet. It is collected
   until the next top-level `- `, the next `**period**`, or the next `#` heading.

## Syntax rules that PREVENT render failures

These come straight from the parser (`parseTimelineMarkdown.ts`). Each is a real
break-or-drop, not a style nicety.

- **A period header must be a bold line and NOTHING else.** The parser matches
  `^**...**$` on the whole trimmed line.
  - WRONG: `**Phase 1** — the foundation`  (trailing text → not recognized as a period;
    its events are dropped)
  - RIGHT: `**Phase 1: The Foundation**`  (put the subtitle INSIDE the bold)

- **Never put `*` inside a period name.** The match is `**([^*]+)**` — any inner
  asterisk breaks it.
  - WRONG: `**Phase 1 *beta***`
  - RIGHT: `**Phase 1 (beta)**`

- **Events MUST come after a period header.** A `- ` bullet before the first
  `**Period**` is silently dropped.
  - WRONG: `### Plan` then `- First task`  (no period → task lost)
  - RIGHT: `### Plan` then `**Phase 1:**` then `- First task`

- **Event bullets must start at the beginning of the line** with `- ` (dash + space).
  Indented dashes are treated as the previous event's description, not as new events.
  - WRONG: `  - Milestone`  (indented → folded into the description above)
  - RIGHT: `- Milestone`

- **Put the date in `( )` and the category in `[ ]`, in that order.** The parser reads
  the date first, then the category.
  - WRONG: `- Research [Planning] (Jan)`  (bracket before paren → date not parsed)
  - RIGHT: `- Research (Jan) [Planning]`

- **Status is a keyword, not a symbol.** Write `completed` / `in-progress` / `pending`
  after the category. Emojis or checkmarks are ignored.
  - WRONG: `- Ship v1 (Mar) [Release] ✅`
  - RIGHT: `- Ship v1 (Mar) [Release] completed`

- **A period with zero events is dropped.** Every `**Period**` needs at least one `- `
  event or it will not appear.

- **The description paragraph can't start with a bullet or bold.** A line starting with
  `-` or `**` right after the title is read as an event or period, not the description.

## Sizing / limits

- Aim for 2–8 periods, each with 2–8 events. Timelines with dozens of events per period
  become hard to scan — split into more phases instead.
- Keep event titles short (a few words); use the description line for detail.
- One `<timeline>` block per timeline. Do not nest timelines.

## Editing etiquette

- When updating a timeline, return **one complete** `<timeline>` … `</timeline>` block
  with the full, revised content — not a diff or a fragment.
- Keep the `<timeline>` tag (do not switch to a code fence or another block type).
- Preserve the existing `### Title` and the period names unless the user asked to change
  them; the user's checked-off progress is keyed off event position within a period.

## Correct minimal example

<timeline>
### Product Launch Roadmap

Path from prototype to public launch across three phases.

**Phase 1: Foundation**
- **Research & Planning** (Jan–Feb) [Planning] completed
  - Scope the MVP and confirm the target audience.
- **Market Analysis** (Feb–Mar) [Research] completed

**Phase 2: Build**
- **Core Features** (Apr–May) [Development] in-progress
  Ship the primary user flows behind a flag.
- **Internal Beta** (Jun) [Development] pending

**Phase 3: Launch**
- **Public Release** (Jul) [Release] pending
</timeline>
$BODY$,
  'Calendar',
  '["web"]'::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  true, true, true, 'public',
  '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'timeline-block' AND user_id IS NULL
);

UPDATE skill.definition SET
  label = 'Timeline',
  description = 'Emit a live, interactive timeline of phased events with dates, categories, and status — a <timeline> XML block that renders progressively and persists as an editable artifact.',
  skill_type = 'render_block'::skl_skill_type,
  body = $BODY$# Timeline

You can render a live, interactive **timeline** by emitting a single `<timeline>` XML
block. It renders progressively while you stream and persists as an editable artifact:
the user can check events off (a live progress bar tracks completion), filter by
category, collapse phases, import the whole timeline into the Task Manager, print it,
and other agents can edit it later. Prefer a timeline whenever the user asks about a
schedule, roadmap, project plan, sequence of milestones, phased rollout, historical
sequence, or "what happens when".

## When to use it

- **Project / product roadmap** — phases with dated milestones and deliverables.
- **Historical sequence** — events over time grouped into eras or periods.
- **Study / treatment / onboarding plan** — weeks or stages with actionable items.
- **Release schedule** — versioned phases, each with dated work.

If the user just wants a diagram of a process or dependency graph, prefer a mermaid
diagram instead. Use a timeline when the organizing axis is **time grouped into
named periods**.

## The exact block + inner structure

Emit ONE `<timeline>` … `</timeline>` block. Inside it, in this order:

1. **Title** — a single `### Title` markdown header. This is the first thing inside the
   block. (If omitted, the block falls back to the literal title "Timeline".)
2. **Description** (optional) — one plain paragraph immediately after the title. It must
   NOT start with `#`, `**`, or `-`.
3. **One or more periods**, each introduced by a bold header on its own line:
   `**Phase 1: Foundation**`
4. **Events** under each period — top-level bullets starting with `- ` at the start of
   the line. Event line format (all parts after the title are optional):

   `- **Event Title** (Date) [Category] status`

   - **Title** — bold (`**…**`) or plain text.
   - **Date** — wrapped in parentheses: `(Jan–Feb 2024)`. Shown with a clock icon; if
     absent it renders as `TBD`.
   - **Category** — wrapped in square brackets: `[Research]`. Feeds the category filter.
   - **Status** — the word `completed`, `in-progress` (or `in progress`), or `pending`
     appearing after the category. Sets the event's status icon/color.
5. **Event description** (optional) — put it on the line(s) directly under the event
   bullet, either as plain indented text or as an indented sub-bullet. It is collected
   until the next top-level `- `, the next `**period**`, or the next `#` heading.

## Syntax rules that PREVENT render failures

These come straight from the parser (`parseTimelineMarkdown.ts`). Each is a real
break-or-drop, not a style nicety.

- **A period header must be a bold line and NOTHING else.** The parser matches
  `^**...**$` on the whole trimmed line.
  - WRONG: `**Phase 1** — the foundation`  (trailing text → not recognized as a period;
    its events are dropped)
  - RIGHT: `**Phase 1: The Foundation**`  (put the subtitle INSIDE the bold)

- **Never put `*` inside a period name.** The match is `**([^*]+)**` — any inner
  asterisk breaks it.
  - WRONG: `**Phase 1 *beta***`
  - RIGHT: `**Phase 1 (beta)**`

- **Events MUST come after a period header.** A `- ` bullet before the first
  `**Period**` is silently dropped.
  - WRONG: `### Plan` then `- First task`  (no period → task lost)
  - RIGHT: `### Plan` then `**Phase 1:**` then `- First task`

- **Event bullets must start at the beginning of the line** with `- ` (dash + space).
  Indented dashes are treated as the previous event's description, not as new events.
  - WRONG: `  - Milestone`  (indented → folded into the description above)
  - RIGHT: `- Milestone`

- **Put the date in `( )` and the category in `[ ]`, in that order.** The parser reads
  the date first, then the category.
  - WRONG: `- Research [Planning] (Jan)`  (bracket before paren → date not parsed)
  - RIGHT: `- Research (Jan) [Planning]`

- **Status is a keyword, not a symbol.** Write `completed` / `in-progress` / `pending`
  after the category. Emojis or checkmarks are ignored.
  - WRONG: `- Ship v1 (Mar) [Release] ✅`
  - RIGHT: `- Ship v1 (Mar) [Release] completed`

- **A period with zero events is dropped.** Every `**Period**` needs at least one `- `
  event or it will not appear.

- **The description paragraph can't start with a bullet or bold.** A line starting with
  `-` or `**` right after the title is read as an event or period, not the description.

## Sizing / limits

- Aim for 2–8 periods, each with 2–8 events. Timelines with dozens of events per period
  become hard to scan — split into more phases instead.
- Keep event titles short (a few words); use the description line for detail.
- One `<timeline>` block per timeline. Do not nest timelines.

## Editing etiquette

- When updating a timeline, return **one complete** `<timeline>` … `</timeline>` block
  with the full, revised content — not a diff or a fragment.
- Keep the `<timeline>` tag (do not switch to a code fence or another block type).
- Preserve the existing `### Title` and the period names unless the user asked to change
  them; the user's checked-off progress is keyed off event position within a period.

## Correct minimal example

<timeline>
### Product Launch Roadmap

Path from prototype to public launch across three phases.

**Phase 1: Foundation**
- **Research & Planning** (Jan–Feb) [Planning] completed
  - Scope the MVP and confirm the target audience.
- **Market Analysis** (Feb–Mar) [Research] completed

**Phase 2: Build**
- **Core Features** (Apr–May) [Development] in-progress
  Ship the primary user flows behind a flag.
- **Internal Beta** (Jun) [Development] pending

**Phase 3: Launch**
- **Public Release** (Jul) [Release] pending
</timeline>
$BODY$,
  icon_name = 'Calendar',
  platform_targets = '["web"]'::jsonb,
  version = '1.0.0',
  category_id = '49c845cb-9314-485c-88ed-a7ace4f286ca',
  is_active = true,
  is_system = true,
  is_public = true,
  visibility = 'public',
  updated_at = now()
WHERE skill_id = 'timeline-block'
  AND user_id IS NULL
  AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582';

-- ============================================================================
-- CONTENT BLOCK → public.content_blocks
-- New id 'timeline-block' to COEXIST with legacy timeline / simple-timeline /
-- complex-timeline / timeline-skill (do not overwrite). block_id is UNIQUE →
-- ON CONFLICT (block_id) DO UPDATE.
-- ============================================================================

INSERT INTO public.content_blocks (
  block_id, label, description, template, icon_name,
  category_id, organization_id, metadata, version, is_active, sort_order
) VALUES (
  'timeline-block',
  'Timeline',
  'Insert an interactive <timeline> render block — phased events with dates, categories, and status.',
  $CB$Render an interactive timeline by emitting a <timeline> block:

<timeline>
### Project Timeline

Short overview of the plan.

**Phase 1: Foundation**
- **Research & Planning** (Jan–Feb) [Planning] completed
- **Market Analysis** (Feb–Mar) [Research] in-progress

**Phase 2: Build**
- **Core Features** (Apr–May) [Development] pending
</timeline>

Rules:
- Title is one `### header`; an optional plain paragraph after it is the description.
- Each period is a bold line alone (`**Phase 1:**`) with NO trailing text and no inner `*`.
- Events are top-level `- ` bullets UNDER a period: `- **Title** (Date) [Category] status`.
- Order matters: date in `( )`, then category in `[ ]`; status is the word completed / in-progress / pending.
- Indented dashes become the event's description, not new events.$CB$,
  'Calendar',
  '6913d9fc-b8c0-4107-af40-27d55c177694',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{}'::jsonb,
  1,
  true,
  0
)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  template = EXCLUDED.template,
  icon_name = EXCLUDED.icon_name,
  category_id = EXCLUDED.category_id,
  organization_id = EXCLUDED.organization_id,
  metadata = EXCLUDED.metadata,
  is_active = EXCLUDED.is_active,
  updated_at = now();

COMMIT;
