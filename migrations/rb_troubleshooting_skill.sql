-- rb_troubleshooting_skill.sql
-- Render-block SKILL + content block for the `<troubleshooting>` XML-tag render block.
--
-- Trigger: the XML tag <troubleshooting>…</troubleshooting>
--   (registered in content-splitter-v2.ts XML_TAG_BLOCKS as `troubleshooting`).
-- Renderer: components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx
--   (via the unified artifact renderer features/canvas/artifact-types/renderers/
--    TroubleshootingArtifact.tsx → resolveMarkdownPayload → parseTroubleshootingMarkdown).
-- Parser:   components/mardown-display/blocks/troubleshooting/parseTroubleshootingMarkdown.ts
--   Renders live, persists as an editable artifact, and can be imported into Tasks.
--
-- Idempotent, schema-qualified, wrapped in a transaction. Safe to re-apply.
-- Do NOT apply directly — the orchestrator applies all render-block skill migrations centrally.
--
-- COEXISTENCE: a legacy content block `block_id='troubleshooting-guide'` already exists
-- in a DIFFERENT category (dimension 'shortcut', category d8f21117-…). We do NOT touch it.
-- This migration adds a NEW block `troubleshooting-block` in the shared Render Blocks
-- content-block category (6913d9fc-…), so nothing is clobbered.

BEGIN;

-- ============================================================================
-- 1) SKILL  →  skill.definition  (skill_id = 'troubleshooting-guides')
-- ============================================================================

INSERT INTO skill.definition (
  skill_id, label, description, skill_type, body, icon_name,
  platform_targets, semver, category_id,
  is_active, is_system, visibility, organization_id
)
SELECT
  'troubleshooting-guides',
  'Troubleshooting Guides',
  'How and when to emit <troubleshooting> render blocks: the exact tag + inner markdown structure (symptom, causes, solutions, steps), syntax rules that prevent render failures, sizing guidance, and editing etiquette.',
  'render_block'::public.skl_skill_type,
  $BODY$# Troubleshooting Guides

You can render a live, interactive troubleshooting guide by wrapping structured
markdown in a `<troubleshooting>` tag. It renders progressively while you stream and
persists as an editable artifact the user can expand, search by symptom or severity,
copy commands from, mark steps complete on, and import into their Tasks. Reach for it
whenever the user is diagnosing a problem, debugging an error, or asking "why isn't X
working / how do I fix it" — an interactive guide beats a wall of prose.

## When to use it

- The user reports a symptom, error message, or broken behavior and wants to fix it.
- You are giving diagnostic steps that branch (several possible causes → several fixes).
- A runbook: an operator needs to walk fixes in order, checking each off and copying
  the exact commands.

If you are only listing plain steps with no diagnosis, use a normal ordered list. Use
`<troubleshooting>` when the shape is genuinely *symptom → causes → solutions → steps*.

## How to emit a guide

Wrap the whole guide in one `<troubleshooting>` tag. Inside it is a specific markdown
dialect — headings and bolded section markers the parser reads literally:

```
<troubleshooting>
### API Connection Issues
Common problems and fixes for API connectivity.

**Symptom:** Timeout errors when calling the API

**Possible Causes:**
1. Network connectivity issues
2. Server overload
3. Invalid or expired credentials

**Solutions:**
1. **Check the network path**: Confirm the endpoint is reachable
   - **Test with curl**: Hit the health endpoint directly (easy) (2 min)
     ```
     curl -X GET https://api.example.com/health
     ```
   - **Check DNS resolution**: Confirm the domain resolves (easy) (1 min)
     ```
     dig api.example.com
     ```
2. **Verify credentials**: Ensure the API key is valid and unexpired
   - **Inspect the key**: Confirm it is active in the dashboard [API Keys](https://example.com/keys) (medium)

**Related Issues:**
- Slow response times
- Authentication failures
</troubleshooting>
```

## The exact inner structure

The body is parsed **line by line** against these markers. Order and the bold `**…**`
markers matter — they are how the parser knows what each line is.

1. **Guide title** — one `### Heading` line at the very top becomes the guide title.
2. **Guide description** — the first plain text line after the title (before any
   `**Symptom:**`) becomes the guide's description. Optional.
3. **An issue** — begins with a line starting exactly `**Symptom:**`. Everything after
   the marker on that line is the symptom. Every new `**Symptom:**` starts a new issue,
   so one guide can hold many issues.
4. **`**Possible Causes:**`** — a section header on its own line. The following numbered
   (`1.`) or bulleted (`-`) lines each become one cause.
5. **`**Solutions:**`** — a section header on its own line. Then:
   - Each solution is a numbered line of the form
     `N. **Solution Title**: optional description`.
   - Each step under a solution is an indented bullet `- **Step Title**: description`.
   - A step may carry, inline in its text: a link `[label](url)`, a difficulty in
     parentheses `(easy)` / `(medium)` / `(hard)`, and a time estimate `(5 min)` /
     `(1 hour)`. These are extracted out of the visible text automatically.
   - A fenced code block (```` ``` ````) indented under a step becomes a copyable
     command for that step. Multiple fences = multiple commands.
6. **`**Related Issues:**`** — a section header on its own line, then `-` bullets, each
   a related-issue chip.

Severity (low / medium / high / critical) and the per-solution priority / success-rate
badges are optional presentation details the renderer infers or omits — you do not need
to hand-author them.

## Syntax rules that prevent render failures

These are the real breakage classes from the parser — follow them exactly:

1. **The `### title` is a triple-hash H3, at the top, once.** A `#` or `##` line is NOT
   read as the title. Wrong: `## API Issues`. Right: `### API Issues`.
2. **Every issue MUST start with `**Symptom:**` at the start of the line.** No symptom
   marker → no issue is created and your causes/solutions are silently dropped. The
   marker is case- and spacing-sensitive: `**Symptom:**` (bold, colon, space after).
3. **Causes and related items only parse UNDER their section header.** A numbered/bullet
   line before `**Possible Causes:**` (or before `**Solutions:**` / `**Related
   Issues:**`) is ignored. Always emit the `**…:**` header line first, then the list.
4. **A solution MUST be `N. **Title**: …` — the bold title is required.** A numbered
   line without `**bold**` is not recognized as a solution (it may be swallowed as a
   step of the previous one). Wrong: `1. Check the network`. Right:
   `1. **Check the network**: …`.
5. **A step MUST live under a solution.** Indented `- **Step**: …` bullets before the
   first `1. **Solution**:` line have no solution to attach to and are dropped. Emit at
   least one solution before its steps.
6. **Command fences go INSIDE a step, indented under the step bullet**, opened with a
   plain triple-backtick line. A fence not under a step is not captured as a command.
7. **Put a difficulty / time hint in parentheses inside the step text**, e.g.
   `(easy) (2 min)`. Freeform time phrases outside parentheses are not detected.
8. **Links use standard markdown `[label](url)`** inside a cause/step line; the URL is
   pulled out and the label is shown.
9. **Do not nest another `<troubleshooting>` tag inside this one**, and do not wrap the
   tag in an `<artifact>` — the `<troubleshooting>` tag IS the artifact.

## Sizing and layout guidance

- Keep a guide to a handful of issues (roughly 1–8). If the domain is huge, split into
  several focused `<troubleshooting>` guides with a sentence between them.
- 2–5 solutions per issue and 2–6 steps per solution reads best. Beyond that, the guide
  becomes a manual — break the issue apart.
- Order solutions most-likely / cheapest first: the user works top-down and checks off
  steps as they go.
- Keep symptoms and step titles short and scannable — the detail belongs in the step
  description and commands.

## Editing an existing guide

When asked to modify a guide (yours or one provided as context):

- Return ONE complete `<troubleshooting>` block containing the FULL updated guide —
  never a fragment, a diff, or prose mixed with partial markup.
- Keep the `<troubleshooting>` tag type. Do not convert it to a plain list or an
  `<artifact>` unless explicitly asked.
- Preserve the existing `### title` and the issues/solutions you were not asked to
  change, in their original order — the platform versions artifacts and small diffs keep
  history readable.
- Keep the section markers (`**Symptom:**`, `**Possible Causes:**`, `**Solutions:**`,
  `**Related Issues:**`) exactly — reformatting them silently breaks parsing.

## Minimal correct example

```
<troubleshooting>
### Docker Build Fails

**Symptom:** `docker build` exits with "no space left on device"

**Possible Causes:**
1. Dangling images and build cache filling the disk
2. Docker's data root on a small volume

**Solutions:**
1. **Reclaim Docker disk space**: Prune unused layers and caches
   - **Prune the system**: Remove stopped containers, unused images, and cache (easy) (2 min)
     ```
     docker system prune -a --volumes
     ```
   - **Check remaining space**: Confirm the disk recovered (easy) (1 min)
     ```
     df -h /var/lib/docker
     ```

**Related Issues:**
- Slow image builds
- Out-of-memory during build
</troubleshooting>
```
$BODY$,
  'Wrench',
  '["web"]'::jsonb,
  '1.0.0',
  '49c845cb-9314-485c-88ed-a7ace4f286ca',
  true, true, 'public'::platform.visibility,
  '39c38960-d30c-4840-b0c1-c9960de95582'
WHERE NOT EXISTS (
  SELECT 1 FROM skill.definition
  WHERE skill_id = 'troubleshooting-guides' AND created_by IS NULL
);

-- ============================================================================
-- 2) CONTENT BLOCK  →  public.content_blocks  (block_id = 'troubleshooting-block')
--    NEW id — coexists with the legacy 'troubleshooting-guide' block (untouched).
-- ============================================================================

INSERT INTO public.content_blocks (
  block_id, label, description, template, icon_name,
  category_id, organization_id, version, is_active, sort_order, metadata
)
VALUES (
  'troubleshooting-block',
  'Troubleshooting Guide',
  'Interactive symptom → causes → solutions → steps guide (searchable, checkable, command-copy, importable to Tasks). Emitted with a <troubleshooting> tag.',
  $CB$Emit an interactive troubleshooting guide by wrapping this exact markdown in a <troubleshooting> tag:

<troubleshooting>
### Guide Title

**Symptom:** Short description of the problem

**Possible Causes:**
1. First likely cause
2. Second likely cause

**Solutions:**
1. **Solution title**: One-line summary
   - **Step title**: What to do (easy) (2 min)
     ```
     command to run
     ```
</troubleshooting>

Rules:
- One `### title` (H3) at the top; the first plain line after it is the description.
- Every issue starts with `**Symptom:**` on its own line — repeat it for more issues.
- List causes/steps only AFTER their `**Possible Causes:**` / `**Solutions:**` header.
- A solution must be `N. **Title**: …`; steps are indented `- **Title**: …` under it.
- Put commands in a ``` fence indented under a step; (easy|medium|hard) + (5 min) are optional inline hints.$CB$,
  'Wrench',
  '6913d9fc-b8c0-4107-af40-27d55c177694',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  1,
  true,
  0,
  '{}'::jsonb
)
ON CONFLICT (block_id) DO UPDATE SET
  label           = EXCLUDED.label,
  description     = EXCLUDED.description,
  template        = EXCLUDED.template,
  icon_name       = EXCLUDED.icon_name,
  category_id     = EXCLUDED.category_id,
  organization_id = EXCLUDED.organization_id,
  version         = EXCLUDED.version,
  is_active       = EXCLUDED.is_active,
  sort_order      = EXCLUDED.sort_order,
  metadata        = EXCLUDED.metadata;

COMMIT;
