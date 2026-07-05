-- rb_resources_skill.sql
-- Render-block skill + content block for the `<resources>` render block.
--
-- Trigger: the XML tag <resources> … </resources>
--   (registered in content-splitter-v2.ts XML_TAG_BLOCKS as resources: ["<resources>"]).
-- Live path: <resources> tag → content splitter → unified artifact renderer
--   (ResourcesArtifact) → parseResourcesMarkdown() → ResourceCollectionBlock.
--   Verified live and wired (not a dead block).
--
-- Inner body is LIGHT MARKDOWN read by parseResourcesMarkdown:
--   ### Title                                        (optional collection title)
--   One plain line                                   (optional collection description)
--   **Category Name**                                (category header)
--   - [Title](url) - Description (duration) [type] {difficulty} *rating* #tag  (resource line)
--
-- Idempotent, schema-qualified, wrapped in BEGIN/COMMIT.
-- Reuses existing categories: skill 49c845cb (Render Blocks), content block 6913d9fc.
-- Global org: 39c38960-d30c-4840-b0c1-c9960de95582.
-- NOTE: a legacy v2 content_block 'resource-collection' already exists (category
-- 01c14d75 "Research"); this migration must NOT clobber it, so the new block uses
-- block_id 'resource-collection-block'.

BEGIN;

-- ============================================================================
-- SKILL: skill.definition
-- ============================================================================

INSERT INTO skill.definition (
  skill_id, label, description, skill_type, body, icon_name,
  platform_targets, version, category_id,
  is_active, is_system, is_public, sort_order,
  organization_id, visibility
)
SELECT
  'render-block-resources',
  'Resource Collection',
  'How and when to emit a <resources> render block: the XML tag, the category + link-list structure it parses, the syntax rules that prevent items from being dropped, sizing guidance, and editing etiquette.',
  'render_block'::public.skl_skill_type,
  $BODY$# Resource Collection

You can present a curated, interactive collection of links by emitting a
`<resources>` block. It renders as a searchable, categorized card grid with
per-item type/difficulty/duration/rating badges, favorite + completed toggles,
and a live progress meter. It persists as an editable artifact the user can
expand full-screen, filter, and share. Prefer it whenever you hand the user a
set of links — docs, tools, videos, courses — instead of a plain bullet list.

## How to emit a resource collection

Wrap light markdown in a single `<resources>` … `</resources>` tag:

```
<resources>
### Getting Started with Rust
A curated path from zero to writing real programs.

**Documentation**
- [The Rust Book](https://doc.rust-lang.org/book/) - The official guide {beginner} *5*
- [Std Library Reference](https://doc.rust-lang.org/std/) - API docs {intermediate} *4*

**Video Courses**
- [Rust in 100 Minutes](https://youtu.be/example) - Fast visual intro (100 min) [video] {beginner} *5*
</resources>
```

- One collection per tag. Open `<resources>` at the start of a line, close with
  `</resources>` on its own line.
- Inside the tag is light markdown, NOT JSON. The parser reads four line shapes
  (below) and ignores everything else.

## When to use it

| User intent | Use a resource collection |
|---|---|
| "Give me resources / links to learn X" | Yes — this is the primary case |
| A reading list, tool list, or curriculum | Yes |
| A study path grouped by topic or medium | Yes — one **Category** per group |
| A single link inline in a sentence | No — just write a normal markdown link |
| Structured non-link data (steps, timeline) | No — use the matching block |

## The four line shapes the parser reads

Order matters. Emit them in this sequence:

1. **Title (optional)** — a line beginning with `### `:
   `### Machine Learning Starter Kit`
   Everything after `### ` becomes the collection title. If omitted, the title
   defaults to "Resource Collection".

2. **Description (optional)** — the FIRST plain line (no `#`, no `**`, no `- `)
   after the title. It is consumed as the collection's one-line description.
   Only the first such line is used; put it right under the title.

3. **Category header** — a line that both starts and ends with `**`:
   `**Documentation**`
   Opens a new category. Every resource line after it belongs to that category
   until the next `**Header**`.

4. **Resource line** — a bullet starting with `- ` whose FIRST token is a
   markdown link `[Title](url)`:
   `- [Title](https://url) - Description (duration) [type] {difficulty} *rating* #tag`
   Only `[Title](url)` is required; everything after it is optional metadata,
   in any order:
   - `- Description` — free text after a dash, before any `(`/`[`/`{`/`*`.
   - `(duration)` — MUST contain a time unit word (`hour`, `hr`, `min`,
     `minute`, `sec`, `second`), e.g. `(2 hours)`, `(45 min)`.
   - `[type]` — one of: `documentation`, `tool`, `video`, `article`, `course`,
     `book`, `tutorial`, `other`. Common aliases map automatically
     (`docs`→documentation, `vid`→video, `guide`/`tut`→tutorial, `app`/`software`→tool,
     `blog`/`post`→article, `class`/`lesson`→course). Unknown → `other`.
   - `{difficulty}` — one of `beginner`, `intermediate`, `advanced` (aliases:
     `basic`/`intro`/`easy`→beginner, `medium`/`mid`→intermediate,
     `hard`/`expert`/`pro`→advanced).
   - `*rating*` — a single number 1–5, e.g. `*4*` or `*4.5*`. Out-of-range is ignored.
   - `#tag` — one or more hashtags, e.g. `#free #official`.

## Syntax rules that prevent render failures

These are the real breakage modes in the parser — follow them exactly:

1. **A resource line MUST start with `- [Title](url)`.** A bullet whose first
   token is NOT a markdown link is silently dropped. Wrong: `- Rust Book: https://…`
   Right: `- [Rust Book](https://…) - The official guide`.

2. **Every resource needs a category header above it.** A `- [..](..)` line with
   NO preceding `**Category**` is dropped — UNLESS the whole collection has zero
   category headers, in which case all loose items fall into one default
   "Resources" category. So either give every item a `**Category**`, or give NONE
   of them one. Never mix categorized and un-categorized items — the un-categorized
   ones vanish.

3. **Empty categories disappear.** A `**Category**` with no valid resource lines
   under it is discarded. Don't emit a header you won't fill.

4. **The first plain line is eaten as the description.** If you want a paragraph
   of intro text, know that only its first line survives — and it becomes the
   collection subtitle, not body text. Put real content into resources, not prose.

5. **Duration needs a time-unit word inside the parens.** `(2 hours)` works;
   `(120)` or `(long)` is ignored. Parens without a unit word are dropped, not
   shown as duration.

6. **Keep the URL inside `(...)` with no spaces breaking it.** `[T](https://a b)`
   truncates at the first `)`; use a clean URL.

7. **Description falls back to the title.** If you give a link no ` - description`,
   the card shows the title as its description — harmless, but add a description
   for a better card.

## Sizing

Aim for 2–6 categories and 3–10 resources each. The block is searchable and
scrollable, so a large well-grouped collection is fine; a flat list of 40 loose
links is not — group them.

## Editing etiquette

When revising, return ONE complete `<resources>` block with the full updated
content. Keep the `<resources>` tag (do not switch to JSON or a code fence).
Preserve the `### Title` and category names the user is anchored on unless the
edit is specifically to rename them. Re-emit every resource you intend to keep —
the block is replaced wholesale, so an omitted line is a deleted line.

## Minimal correct example

```
<resources>
### TypeScript Learning Path
Everything you need to go from JavaScript to confident TypeScript.

**Official Docs**
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - The canonical reference [documentation] {beginner} *5*
- [Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/overview.html) - What changed by version [documentation] {intermediate} *4*

**Practice**
- [Type Challenges](https://github.com/type-challenges/type-challenges) - Solve real type puzzles [tool] {advanced} *5* #free
- [TS Playground](https://www.typescriptlang.org/play) - Experiment in the browser [tool] {beginner} *5*
</resources>
```
$BODY$,
  'FolderOpen',
  '["web"]'::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  true, true, true, 0,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  'public'::platform.visibility
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'render-block-resources' AND user_id IS NULL
);

-- Refresh body/metadata on re-apply (global row only).
UPDATE skill.definition SET
  label = 'Resource Collection',
  description = 'How and when to emit a <resources> render block: the XML tag, the category + link-list structure it parses, the syntax rules that prevent items from being dropped, sizing guidance, and editing etiquette.',
  skill_type = 'render_block'::public.skl_skill_type,
  icon_name = 'FolderOpen',
  platform_targets = '["web"]'::jsonb,
  version = '1.0.0',
  category_id = '49c845cb-9314-485c-88ed-a7ace4f286ca',
  is_active = true, is_system = true, is_public = true,
  visibility = 'public'::platform.visibility,
  body = $BODY$# Resource Collection

You can present a curated, interactive collection of links by emitting a
`<resources>` block. It renders as a searchable, categorized card grid with
per-item type/difficulty/duration/rating badges, favorite + completed toggles,
and a live progress meter. It persists as an editable artifact the user can
expand full-screen, filter, and share. Prefer it whenever you hand the user a
set of links — docs, tools, videos, courses — instead of a plain bullet list.

## How to emit a resource collection

Wrap light markdown in a single `<resources>` … `</resources>` tag:

```
<resources>
### Getting Started with Rust
A curated path from zero to writing real programs.

**Documentation**
- [The Rust Book](https://doc.rust-lang.org/book/) - The official guide {beginner} *5*
- [Std Library Reference](https://doc.rust-lang.org/std/) - API docs {intermediate} *4*

**Video Courses**
- [Rust in 100 Minutes](https://youtu.be/example) - Fast visual intro (100 min) [video] {beginner} *5*
</resources>
```

- One collection per tag. Open `<resources>` at the start of a line, close with
  `</resources>` on its own line.
- Inside the tag is light markdown, NOT JSON. The parser reads four line shapes
  (below) and ignores everything else.

## When to use it

| User intent | Use a resource collection |
|---|---|
| "Give me resources / links to learn X" | Yes — this is the primary case |
| A reading list, tool list, or curriculum | Yes |
| A study path grouped by topic or medium | Yes — one **Category** per group |
| A single link inline in a sentence | No — just write a normal markdown link |
| Structured non-link data (steps, timeline) | No — use the matching block |

## The four line shapes the parser reads

Order matters. Emit them in this sequence:

1. **Title (optional)** — a line beginning with `### `:
   `### Machine Learning Starter Kit`
   Everything after `### ` becomes the collection title. If omitted, the title
   defaults to "Resource Collection".

2. **Description (optional)** — the FIRST plain line (no `#`, no `**`, no `- `)
   after the title. It is consumed as the collection's one-line description.
   Only the first such line is used; put it right under the title.

3. **Category header** — a line that both starts and ends with `**`:
   `**Documentation**`
   Opens a new category. Every resource line after it belongs to that category
   until the next `**Header**`.

4. **Resource line** — a bullet starting with `- ` whose FIRST token is a
   markdown link `[Title](url)`:
   `- [Title](https://url) - Description (duration) [type] {difficulty} *rating* #tag`
   Only `[Title](url)` is required; everything after it is optional metadata,
   in any order:
   - `- Description` — free text after a dash, before any `(`/`[`/`{`/`*`.
   - `(duration)` — MUST contain a time unit word (`hour`, `hr`, `min`,
     `minute`, `sec`, `second`), e.g. `(2 hours)`, `(45 min)`.
   - `[type]` — one of: `documentation`, `tool`, `video`, `article`, `course`,
     `book`, `tutorial`, `other`. Common aliases map automatically
     (`docs`→documentation, `vid`→video, `guide`/`tut`→tutorial, `app`/`software`→tool,
     `blog`/`post`→article, `class`/`lesson`→course). Unknown → `other`.
   - `{difficulty}` — one of `beginner`, `intermediate`, `advanced` (aliases:
     `basic`/`intro`/`easy`→beginner, `medium`/`mid`→intermediate,
     `hard`/`expert`/`pro`→advanced).
   - `*rating*` — a single number 1–5, e.g. `*4*` or `*4.5*`. Out-of-range is ignored.
   - `#tag` — one or more hashtags, e.g. `#free #official`.

## Syntax rules that prevent render failures

These are the real breakage modes in the parser — follow them exactly:

1. **A resource line MUST start with `- [Title](url)`.** A bullet whose first
   token is NOT a markdown link is silently dropped. Wrong: `- Rust Book: https://…`
   Right: `- [Rust Book](https://…) - The official guide`.

2. **Every resource needs a category header above it.** A `- [..](..)` line with
   NO preceding `**Category**` is dropped — UNLESS the whole collection has zero
   category headers, in which case all loose items fall into one default
   "Resources" category. So either give every item a `**Category**`, or give NONE
   of them one. Never mix categorized and un-categorized items — the un-categorized
   ones vanish.

3. **Empty categories disappear.** A `**Category**` with no valid resource lines
   under it is discarded. Don't emit a header you won't fill.

4. **The first plain line is eaten as the description.** If you want a paragraph
   of intro text, know that only its first line survives — and it becomes the
   collection subtitle, not body text. Put real content into resources, not prose.

5. **Duration needs a time-unit word inside the parens.** `(2 hours)` works;
   `(120)` or `(long)` is ignored. Parens without a unit word are dropped, not
   shown as duration.

6. **Keep the URL inside `(...)` with no spaces breaking it.** `[T](https://a b)`
   truncates at the first `)`; use a clean URL.

7. **Description falls back to the title.** If you give a link no ` - description`,
   the card shows the title as its description — harmless, but add a description
   for a better card.

## Sizing

Aim for 2–6 categories and 3–10 resources each. The block is searchable and
scrollable, so a large well-grouped collection is fine; a flat list of 40 loose
links is not — group them.

## Editing etiquette

When revising, return ONE complete `<resources>` block with the full updated
content. Keep the `<resources>` tag (do not switch to JSON or a code fence).
Preserve the `### Title` and category names the user is anchored on unless the
edit is specifically to rename them. Re-emit every resource you intend to keep —
the block is replaced wholesale, so an omitted line is a deleted line.

## Minimal correct example

```
<resources>
### TypeScript Learning Path
Everything you need to go from JavaScript to confident TypeScript.

**Official Docs**
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - The canonical reference [documentation] {beginner} *5*
- [Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/overview.html) - What changed by version [documentation] {intermediate} *4*

**Practice**
- [Type Challenges](https://github.com/type-challenges/type-challenges) - Solve real type puzzles [tool] {advanced} *5* #free
- [TS Playground](https://www.typescriptlang.org/play) - Experiment in the browser [tool] {beginner} *5*
</resources>
```
$BODY$
WHERE skill_id = 'render-block-resources'
  AND user_id IS NULL
  AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582';

-- ============================================================================
-- CONTENT BLOCK: public.content_blocks
-- ============================================================================
-- A legacy v2 'resource-collection' block already exists (category 01c14d75);
-- use a fresh 'resource-collection-block' id so ON CONFLICT does not clobber it.

INSERT INTO public.content_blocks (
  block_id, label, description, template, icon_name,
  category_id, organization_id, metadata, version, is_active, sort_order
) VALUES (
  'resource-collection-block',
  'Resource Collection',
  'Emit a searchable, categorized <resources> block of links (docs, tools, videos, courses) with type, difficulty, duration, and rating badges.',
  $CB$When giving the user a set of links, emit a <resources> block instead of a plain list:

<resources>
### Collection Title
One-line description.

**Category Name**
- [Resource Title](https://url) - Short description (45 min) [video] {beginner} *5*
</resources>

Rules:
- Each item MUST start with a markdown link: - [Title](url). A non-link bullet is dropped.
- Put every item under a **Category** header (or give NONE a category — never mix).
- Optional metadata after the link, any order: (duration with a time word) [type] {difficulty} *rating 1-5* #tag.
- type = documentation | tool | video | article | course | book | tutorial | other.
- Return ONE complete block when editing; omitted lines are deleted.$CB$,
  'FolderOpen',
  '6913d9fc-b8c0-4107-af40-27d55c177694',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  '{}'::jsonb,
  1, true, 0
)
ON CONFLICT (block_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  template = EXCLUDED.template,
  icon_name = EXCLUDED.icon_name,
  category_id = EXCLUDED.category_id,
  organization_id = EXCLUDED.organization_id,
  metadata = EXCLUDED.metadata,
  version = EXCLUDED.version,
  is_active = EXCLUDED.is_active,
  updated_at = now();

COMMIT;
