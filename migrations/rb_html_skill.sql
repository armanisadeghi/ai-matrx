-- rb_html_skill.sql
-- Render-block skill + content block for the ```html fence (a full webpage DELIVERABLE).
--
-- Trigger: a ```html code fence. Promoted to a first-class block in
--   components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts
--   (SPECIAL_CODE_LANGUAGES includes "html") and mirrored in aidream block_detector.py.
-- Renderer: features/html-pages/components/HtmlInlinePreview.tsx (via BlockComponentRegistry
--   "HtmlInlinePreview"). Once the block finishes streaming, a COMPLETE HTML document
--   (or a single recognized media embed) is materialized by HTMLPageService.createPage
--   into a persistent published page (a cross-origin URL) and shown in a sandboxed iframe.
--   analyzeHtmlForPreview (features/html-pages/utils/html-preview-utils.ts) is the gate:
--   fragments / loose markup intentionally stay a plain code block (this is the #1 failure).
--
-- Sandbox reality the skill body is built around:
--   * The page is served from a DIFFERENT origin and rendered in an iframe whose sandbox is
--     allow-scripts allow-same-origin allow-popups allow-forms allow-presentation.
--   * The page must be SELF-CONTAINED: no assumption that any external host is reachable and
--     no reliance on parent-page context, cookies, or aimatrx storage. External CDN scripts,
--     fonts, and images MAY be blocked; inline everything and degrade gracefully.
--
-- Coexistence: no legacy `html` skill.definition row and no legacy html/webpage content_blocks
--   row exist (verified live 2026-07-05). This migration is additive.
--
-- Idempotent + schema-qualified. Do NOT apply here — the orchestrator applies all rb_* centrally.

BEGIN;

-- ============================================================================
-- 1. SKILL  →  skill.definition (skill_id = 'html-webpage')
-- ============================================================================
-- Composite unique is (skill_id,user_id,organization_id,project_id); the system/global row
-- has user_id/project_id/task_id NULL and organization_id = the global org. Insert only if
-- the global row is absent, then UPDATE to refresh the body on re-apply (no ON CONFLICT).

INSERT INTO skill.definition (
    skill_id, label, description, skill_type, body, icon_name,
    disable_auto_invocation, platform_targets, semver, category_id,
    is_active, is_system, sort_order,
    organization_id, visibility
)
SELECT
    'html-webpage',
    'HTML Webpage',
    'How and when to emit a ```html render block: a self-contained webpage deliverable that materializes into a persistent, sandboxed live preview. Covers the completeness rule that prevents fragments from rendering, sandbox/self-containment constraints, sizing, and editing etiquette.',
    'render_block'::public.skl_skill_type,
    $BODY$# HTML Webpage

You can deliver a full, live webpage by emitting a ```html code fence. When the block
finishes streaming, a COMPLETE HTML document is materialized into a persistent, shareable
page and rendered inline as a live sandboxed preview (with a header, a Code/Preview toggle,
Expand, and Open in canvas). It is a real deliverable — not a throwaway snippet — so reach
for it when the user wants an actual webpage, a self-contained interactive widget, a
styled report/landing/dashboard they can view and keep, or a single embedded video.

## How to emit a webpage

Write a standard html code fence containing ONE complete document:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quarterly Report</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; color: #111; }
    h1 { color: #2563eb; }
  </style>
</head>
<body>
  <h1>Quarterly Report</h1>
  <p>All content lives inside this one document.</p>
</body>
</html>
```

The fence itself IS the deliverable — do not wrap it in `<artifact>` tags or any other
wrapper. The document's first `<h1>`/`<h2>` (or `<title>`) becomes the page title.

## When to use it

| User intent | Emit |
|---|---|
| "Make me a webpage / landing page / report I can view" | A complete ```html document |
| A self-contained interactive widget (calculator, form, small game, animation) | A complete ```html document with inline `<script>` |
| A styled dashboard / infographic / printable one-pager | A complete ```html document |
| "Embed this YouTube/Vimeo video" | A single media `<iframe>` (see Media embeds) |

Prefer a diagram (```mermaid), a chart (```chart), or a structured block for data that has
a purpose-built renderer. Use ```html when the answer genuinely is *a webpage*.

## The completeness rule — the #1 render failure

The block ONLY materializes into a live page if it is a COMPLETE, standalone document:
it must contain `<!DOCTYPE html>` AND a matching `<html>…</html>` AND `<head>…</head>`
AND `<body>…</body>`. Anything less — a loose `<div>`, a bare snippet, a partial page —
stays a plain code block and never becomes a live preview.

- WRONG (fragment → renders as dead code, no page):
  ```html
  <div class="card"><h2>Hello</h2><p>Hi</p></div>
  ```
- RIGHT (complete document → live page):
  ```html
  <!DOCTYPE html>
  <html lang="en"><head><meta charset="UTF-8"><title>Hello</title></head>
  <body><div class="card"><h2>Hello</h2><p>Hi</p></div></body></html>
  ```

Never emit a partial page and never split one page across two fences. One fence = one
complete document. If you only have body markup, wrap it in the full skeleton yourself.

## Self-contained + sandbox constraints (do not skip)

The page is served from a SEPARATE origin and rendered inside a sandboxed iframe. It has no
access to the parent app, its cookies, its login, or its storage. Build for isolation:

- **Inline everything.** Put CSS in a `<style>` tag and JS in a `<script>` tag in the same
  document. Do NOT rely on external stylesheets, module imports, or a build step.
- **Assume no external host is reachable.** External CDN scripts, web fonts, and remote
  images MAY be blocked or slow. Prefer inline SVG, system fonts (`font-family: system-ui,
  sans-serif`), and data-URI or inline assets. If you must reference a remote resource,
  degrade gracefully — the page must still be readable and functional if it fails to load.
- **No external network calls for core content.** Do not `fetch()` an API and expect it to
  work; there are no app credentials and cross-origin requests may be blocked. Everything
  the page needs to display should be embedded in the document.
- **Scripts run, but sandboxed.** Inline `<script>` executes (the preview allows scripts),
  so interactive widgets work — but they cannot reach the parent page or any authenticated
  Matrx API. Keep all state and logic inside the page.
- **No parent navigation / no top redirects.** Don't try to navigate or postMessage the
  host app. Links open in a new tab; keep the experience inside the page.

## Media embeds (the one fragment that IS allowed)

A SINGLE recognized media embed also auto-previews, even without the full document — one
`<iframe>` to YouTube / Vimeo / Loom / Spotify / SoundCloud / TikTok / Dailymotion, or a
lone `<video>`. It renders seamlessly (snug to the video's aspect ratio, no card chrome):

```html
<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ"
  title="Video" frameborder="0" allowfullscreen></iframe>
```

Keep `width`/`height` on the iframe so the aspect ratio is correct. Exactly one iframe (and
no competing `<video>`), or exactly one `<video>` — mixing them drops back to a code block.

## Sizing / limits

- Keep it to one focused page. The inline preview is height-bounded (a generous default,
  taller when Expanded, full height in canvas) with an intentional bottom fade — front-load
  the important content near the top.
- Favor responsive layout (`meta viewport`, relative units, flexbox/grid) so it reads well
  in the bounded frame and in canvas.
- Don't paste enormous inlined binaries; keep the document reasonable so it streams and
  materializes quickly.

## Editing etiquette

When the user asks to change the page, return ONE complete updated ```html document — the
whole thing, still `<!DOCTYPE html>` through `</html>`. Keep it a single html fence; don't
switch to a fragment or a different block type, and don't split it. Re-emitting identical
content is a no-op (the preview dedupes), so a genuine edit means genuinely changed markup.

## Minimal complete example

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tip Calculator</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 22rem; margin: 3rem auto;
           padding: 1.5rem; border-radius: 12px; box-shadow: 0 1px 8px rgba(0,0,0,.12); }
    label, output { display: block; margin: .5rem 0; }
    input { width: 100%; padding: .4rem; font-size: 16px; }
    output { font-size: 1.4rem; font-weight: 600; color: #2563eb; }
  </style>
</head>
<body>
  <h1>Tip Calculator</h1>
  <label>Bill amount
    <input id="bill" type="number" value="50" min="0" step="0.01">
  </label>
  <label>Tip %
    <input id="tip" type="number" value="18" min="0" step="1">
  </label>
  <output id="total">Total: $59.00</output>
  <script>
    const bill = document.getElementById('bill');
    const tip = document.getElementById('tip');
    const total = document.getElementById('total');
    function update() {
      const t = (Number(bill.value) || 0) * (1 + (Number(tip.value) || 0) / 100);
      total.textContent = 'Total: $' + t.toFixed(2);
    }
    bill.addEventListener('input', update);
    tip.addEventListener('input', update);
  </script>
</body>
</html>
```
$BODY$,
    'Globe',
    false,
    '["web"]'::jsonb,
    '1.0.0',
    '49c845cb-9314-485c-88ed-a7ace4f286ca',
    true,
    true,
    10,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'public'::platform.visibility
WHERE NOT EXISTS (
    SELECT 1 FROM skill.definition
    WHERE skill_id = 'html-webpage' AND created_by IS NULL
);

-- ============================================================================
-- 2. CONTENT BLOCK  →  public.content_blocks (block_id = 'html-webpage')
-- ============================================================================
-- No legacy html/webpage content block exists, so we use the clean id 'html-webpage'.

INSERT INTO public.content_blocks (
    block_id, label, description, icon_name, template,
    category_id, organization_id, metadata, version, is_active, sort_order
) VALUES
(
    'html-webpage',
    'HTML Webpage',
    'Emit a complete, self-contained webpage that materializes into a persistent live preview.',
    'Globe',
    $CB$When the user wants an actual webpage, a self-contained interactive widget, or a styled report they can view and keep, emit ONE complete ```html document:

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Page</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem}</style></head>
<body><h1>Page</h1><p>All content lives in this one document.</p></body>
</html>
```

Rules:
- MUST be a complete document (`<!DOCTYPE html>` + `<html>`/`<head>`/`<body>`) or it renders as dead code, not a page.
- Self-contained: inline all CSS/JS; assume NO external CDN, font, or image host is reachable.
- Sandboxed: scripts run but can't reach the app, its login, or any API — keep all logic in the page.
- One page per fence; don't wrap it in `<artifact>` tags.
- To edit, return the whole updated document, still a single ```html fence.$CB$,
    '6913d9fc-b8c0-4107-af40-27d55c177694',
    '39c38960-d30c-4840-b0c1-c9960de95582',
    '{}'::jsonb,
    1,
    true,
    10
),
(
    'html-video-embed',
    'Video Embed',
    'Embed a single YouTube/Vimeo/Loom video that previews seamlessly inline.',
    'Video',
    $CB$When the user wants a video embedded inline, emit a single media iframe in an ```html fence — it previews seamlessly, snug to the video's aspect ratio:

```html
<iframe width="560" height="315" src="https://www.youtube.com/embed/VIDEO_ID" title="Video" frameborder="0" allowfullscreen></iframe>
```

Rules:
- Exactly ONE iframe to a known host (YouTube/Vimeo/Loom/Spotify/SoundCloud/TikTok), or exactly one `<video>` — mixing them drops to a code block.
- Keep `width`/`height` so the aspect ratio is right.
- Use the provider's embed URL (e.g. youtube.com/embed/ID), not the watch URL.
- No extra markup around it — a single embed is the one fragment that auto-previews.$CB$,
    '6913d9fc-b8c0-4107-af40-27d55c177694',
    '39c38960-d30c-4840-b0c1-c9960de95582',
    '{}'::jsonb,
    1,
    true,
    20
)
ON CONFLICT (block_id) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    icon_name = EXCLUDED.icon_name,
    template = EXCLUDED.template,
    category_id = EXCLUDED.category_id,
    organization_id = EXCLUDED.organization_id,
    metadata = EXCLUDED.metadata,
    version = EXCLUDED.version,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

COMMIT;
