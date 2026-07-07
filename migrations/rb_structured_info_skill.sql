-- rb_structured_info_skill.sql
-- Render-block SKILL + content block for the ```structured_info fence.
--
-- Trigger: a fenced code block whose language is exactly `structured_info`
--   (```structured_info … ```). Promoted to a first-class block by
--   SPECIAL_CODE_LANGUAGES in content-splitter-v2.ts (mirrored server-side in
--   aidream block_detector.py). Rendered by StructuredPlanBlock →
--   StructuredPlanViewer, which renders the fence body through
--   BasicMarkdownContent inside a collapsible "Structured Information" card and
--   derives light stats (bold-heading count, `*` bullet count, word count).
--
-- IMPORTANT — the body is ordinary MARKDOWN, not JSON. There is no field
--   schema. The server passthrough is `("structured_info", None)` (no data
--   model). This makes the block forgiving: any markdown renders; malformed
--   "structure" cannot break the render because there is no parser to break.
--
-- COEXIST: a legacy content block `block_id='structured-info'` already exists
--   (category f10ffe4d-…, the old content-block taxonomy). This migration does
--   NOT touch it. It adds a NEW block `structured-info-block` under the shared
--   "Render Blocks" content-block category (6913d9fc-…).
--
-- Idempotent. Schema-qualified. Do NOT wrap in ON CONFLICT for skill.definition
--   (composite unique (skill_id,user_id,organization_id,project_id) — insert
--   guarded by NOT EXISTS; insert-once, so re-applying is a no-op when the row exists).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) SKILL  →  skill.definition
-- ---------------------------------------------------------------------------

INSERT INTO skill.definition (
  skill_id, label, description, skill_type, body, icon_name,
  platform_targets, semver, category_id, is_active, is_system,
  visibility, organization_id
)
SELECT
  'structured-info-blocks',
  'Structured Information Blocks',
  'How and when to emit ```structured_info render blocks: a collapsible, copy-able card for well-organized reference/summary content written as ordinary markdown — headings, bullets, short tables — with syntax rules that keep it clean and readable.',
  'render_block',
  $BODY$# Structured Information Blocks

You can present well-organized reference or summary content as a **structured
information** block by emitting a ```structured_info code fence. It renders as a
collapsible "Structured Information" card with a one-click "Copy All" button and
a small stat line (sections, bullet points, words). The body is ordinary
markdown, so the reader gets clean headings, lists, and tables inside a tidy,
scannable container instead of a wall of loose prose.

Prefer it whenever the user asks you to organize, summarize, brief, or lay out
facts they will want to scan, copy, or refer back to — a project brief, a
requirements rundown, a person/place/thing profile, a "here's everything about
X" summary, meeting notes, a spec digest, or a structured answer to a
multi-part question.

## How to emit one

Write a standard code fence with the language `structured_info`. Nothing else
is required — no wrapper tags, no JSON, no front matter:

```structured_info
**Project: Atlas Migration**

**Goal**
* Move billing off the legacy monolith by Q3.
* Zero customer-visible downtime.

**Owners**
* Backend: Priya
* Frontend: Marco
* QA: Dana

**Open risks**
* Data backfill window is tight.
* Third-party webhook contract is unversioned.
```

That is the whole contract: a `structured_info` fence around markdown.

## What goes inside

The body is **markdown**, rendered by the platform's standard markdown
renderer. Use the same syntax you would in any answer:

- `**Bold text**` for section titles (each bold run is counted as a "section"
  in the stat line, so use bold specifically for the headings you want tallied).
- `*` or `-` bulleted lists for points under each section.
- `1.` numbered lists for ordered steps.
- Short markdown tables for two-column facts (key/value, item/status).
- `` `inline code` `` for identifiers, flags, or values.
- Regular paragraphs where a sentence reads better than a bullet.

Structure it top-down: a title line, then labelled sections, then the points
under each. Keep each section focused on one thing.

## When to use it vs. other blocks

Reach for `structured_info` for organized, mostly-static reference/summary
content. Choose a different block when the content is really something else:

| The content is… | Use instead |
|---|---|
| A step-by-step plan of action to execute | a `tasks` block |
| A verbatim conversation with speakers/timestamps | a `transcript` block |
| A process, hierarchy, or relationship best seen visually | a ```mermaid diagram |
| A comparison across several options on shared criteria | a `comparison_table` block |
| A recipe (ingredients + steps) | a `cooking_recipe` block |
| Q&A the user should answer interactively | a `questionnaire` block |

If it's simply "organized information the user will read and maybe copy," this
is the right block.

## Syntax rules that keep it clean

This block is forgiving — because the body is plain markdown, malformed content
cannot crash the render. These rules are about keeping the result **readable and
correctly parsed by the markdown renderer**, not about avoiding a hard failure:

1. OPEN the fence with exactly ```structured_info at the start of a line, and
   CLOSE it with a line of exactly ``` — otherwise everything after leaks into
   the block (or the block never closes).
   - Wrong: ` ```structured info ` (space, not underscore) — this is NOT the
     trigger; it renders as a plain code block.
   - Right: ` ```structured_info `

2. NEVER nest a triple-backtick code fence inside the block. A ``` on its own
   line ends the `structured_info` fence early. For code samples inside the
   card, use `inline code` instead.
   - Wrong: opening a ```python fence inside the structured_info body.
   - Right: describe or inline-code the snippet, or emit the code as its own
     separate ```python block AFTER the structured_info block.

3. PUT A BLANK LINE before a list, a heading, or a table. Markdown needs the
   blank line to start a new block; without it the list collapses into the
   previous paragraph.
   - Wrong:
     `**Owners**` immediately followed by `* Priya` on the next line with no
     blank line — the bullet may not render as a list.
   - Right: a blank line between the `**Owners**` line and the first `*` bullet.

4. USE `**bold**` for section headings, not markdown `#` headings, and not
   ALL-CAPS plain text. Bold is what the stat line counts as a section and it
   sizes correctly inside the card; `#` headings render oversized in the
   compact card.

5. KEEP TABLES SIMPLE — a header row, the `|---|---|` separator row, then data
   rows, every row with the same column count. Ragged tables render broken.

6. ONE cohesive topic per block. If you have two unrelated subjects, emit two
   separate `structured_info` blocks rather than cramming both into one card.

## Sizing

- Ideal: a handful of sections, a few bullets each — something the reader can
  scan in one screen. This is a summary/reference card, not a document.
- If the content grows past ~2 screens or becomes a narrative document, it is
  probably a full markdown answer or an artifact, not a `structured_info` card.
- Do not put a single giant paragraph inside — if there's nothing to structure,
  just answer in normal prose without the block.

## Editing etiquette

When asked to change a `structured_info` block:

- Return ONE complete, updated `structured_info` block containing the full
  revised content — not a diff and not just the changed section.
- Keep it a `structured_info` fence (do not switch it to a plain code block or
  a different block type unless the user asks for a different presentation).
- Preserve the existing section order and titles the user has been working
  with; add, edit, or remove only what was requested.

## Complete example

```structured_info
**API Key Rotation — Runbook Summary**

**When to rotate**
* On a fixed 90-day schedule.
* Immediately on any suspected leak.

**Steps at a glance**
1. Mint a new key in the provider console.
2. Deploy the new key to `secrets/prod`.
3. Verify traffic on the new key for 24h.
4. Revoke the old key.

**Owners & contacts**

| Area | Owner |
|---|---|
| Provider console | Platform team |
| Secrets deploy | On-call SRE |

**Notes**
* Never commit a key to the repo; use `secrets/`.
* Rotation is logged in the audit trail automatically.
```
$BODY$,
  'AlignLeft',
  '["web"]'::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  true, true,
  'public',
  '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'structured-info-blocks' AND created_by IS NULL
);

-- ---------------------------------------------------------------------------
-- 2) CONTENT BLOCK  →  public.content_blocks
--    NEW id 'structured-info-block' (legacy 'structured-info' is left intact).
-- ---------------------------------------------------------------------------

INSERT INTO public.content_blocks (
  block_id, label, description, template, icon_name,
  category_id, organization_id, version, is_active, sort_order, metadata
)
VALUES (
  'structured-info-block',
  'Structured Info',
  'A collapsible, copy-able card of organized reference/summary content, written as ordinary markdown (bold section headings + bullets + short tables). Rendered by the ```structured_info fence.',
  $CB$Emit a ```structured_info fence to present organized, scannable reference/summary content as a collapsible, copy-able card. Example:

```structured_info
**Section Title**

**Key Points**
* First point.
* Second point.
```

Rules: body is plain markdown (no JSON). Use **bold** for section headings (not # headings). Put a blank line before every list, heading, or table. Never nest a triple-backtick fence inside. Keep tables simple and rectangular. One topic per block; return the whole block when editing.$CB$,
  'AlignLeft',
  '6913d9fc-b8c0-4107-af40-27d55c177694',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  1,
  true,
  0,
  '{}'::jsonb
)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  template = EXCLUDED.template,
  icon_name = EXCLUDED.icon_name,
  category_id = EXCLUDED.category_id,
  organization_id = EXCLUDED.organization_id,
  version = EXCLUDED.version,
  is_active = EXCLUDED.is_active,
  metadata = EXCLUDED.metadata,
  updated_at = now();

COMMIT;
