---
status: blocked
updated: 2026-08-29
repos: [matrx-frontend]
scope: tail
feature: Artifacts + Canvas
vision: [/Users/armanisadeghi/code/common-docs/systems/workspace/artifacts-canvas/VISION.md]
---

# Canvas canonical-open sweep

**What this is:** Make every surface that shows an artifact open it the SAME way — by pointer to
its `canvas_items` row — instead of each one pushing its own private copy into the canvas slice.
**Scope:** Tail
**Feature:** Artifacts + Canvas
**Vision:** [VISION.md](/Users/armanisadeghi/code/common-docs/systems/workspace/artifacts-canvas/VISION.md)

## Vision — Arman's words

> "The key is for the canvas to be system wide and always essentially available from any route."

> "Canvas items/artifacts should always open directly into the canvas from ALL surfaces, other
> than the ones that are specifically for the purpose of rendering these directly. Once open, the
> user can have an option to go to the dedicated page. Of course, some routes will override this
> but that would only be if they're a surface that has a unique relationship with a specific
> canvas item."

> "…for us to have a simple sort of canonical, reusable system where any place where we have them,
> you click and they all do the same thing and they work."

## Resources

- Feature docs: [features/canvas/FEATURE.md](../../features/canvas/FEATURE.md) ·
  [features/artifacts/FEATURE.md](../../features/artifacts/FEATURE.md)
- Dev server: `pnpm preview:start` (port 3001, ONE machine-wide). Login: `/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/artifacts`
- Review queue: `b8b0091f-0cbf-49f4-bc83-cefe28224ef4` (`submitted`).

## EXEMPT — do not touch, these are correct

| File | Why |
|---|---|
| `features/cloud-browser/hooks/useOpenCloudBrowserCanvas.ts` | `cloud_browser` — in `NON_PERSISTABLE_CANVAS_TYPES` |
| `features/code-editor/components/ContextAwareCodeEditorCompact.tsx` | `code_preview` / `code_edit_error` — non-persistable |
| `features/code-editor/components/ContextAwareCodeEditorModal.tsx` | same |
| `features/tool-call-visualization/components/ArtifactResultBar.tsx` | `working_document` — non-persistable |
| `components/mermaid/workbench/NewDiagramMenu.tsx` | creates a NEW blank diagram; nothing exists to point at |
| `features/canvas/core/CanvasButton.tsx` | generic pass-through primitive; its caller decides |
| `features/code-editor/components/AICodeEditorModalV2.tsx` | only calls `close()`, never opens |

## Needs a human ruling — STOP, do not convert

`iframe` and `html` live previews. They are persistable by type but their payload is a live preview,
so whether they are artifacts is a product call, not a refactor. Leave them and report them:
`features/code-editor/components/code-block/CodeBlock.tsx` L144 ·
`features/code-editor/components/code-block/MultiFileCodeEditor.tsx` L325 ·
`features/code-editor/multi-file-core/useCodeEdiorBasics.ts` L268 ·
`features/html-pages/components/HtmlInlinePreview.tsx` L161 ·
`features/agent-apps/components/AgentAppPublicRendererImpl.tsx` L558 ·
`features/agent-apps/components/shells/AgentAppFullyCustomShell.tsx` L180

## Done

- The page-by-page quality tail is repaired and freshly certified: block icon actions and menu rows
  have accessible names and exact 44px mobile targets while retaining compact desktop sizing;
  progress and troubleshooting use their own container width in both direct pages and the narrow
  Canvas pane; presentation, resources, recipe, decision-tree, timeline, and math interactions are
  contained and console-clean. Math Back restores the exact prior state and All Lessons reaches the
  real lesson route.
- Fresh isolated in-app Browser passes exercised every converted renderer's own Canvas control
  twice and proved one pane remained. Quiz, comparison, presentation, research, resources,
  progress, troubleshooting, recipe, decision-tree, diagram, timeline, and math all rendered and
  remained contained on desktop and mobile; deterministic saved fixtures now cover the formerly
  missing progress, troubleshooting, and math types. Math's own control was exercised in the
  canonical Shape preview, while its saved pointer dedupe was exercised from the library card;
  its dedicated route correctly omits the opener because it is already a direct-render surface.
- The saved diagram detail route now supplies the canonical workspace renderer a bounded viewport,
  and viewport fitting uses the mounted React Flow bounds helper. Fresh certification rendered all
  five nodes and edges, exercised zoom and mini-map, and reported zero runtime, sizing, or bounds
  warnings.
- All 10 typed blocks and both generic wrappers open materialized artifacts by pointer while
  retaining the snapshot fallback — see `features/canvas/FEATURE.md`.
- Independent `/artifacts` tests passed renderer interactions, full-page routes, list-card dedupe,
  responsive containment, and zero console errors for quiz, comparison, presentation, diagram,
  and timeline.
- View mode + canonical opener for mermaid — see `components/mermaid/view/ViewModePane.tsx`, `MermaidBlock.tsx`.
- `useOpenCanvasItem` primitive + both list surfaces converted — see `features/canvas/hooks/useOpenCanvasItem.ts`.
- Pane "Open full page" + `/artifacts/[id]` resolving either identity — see `CanvasPane.tsx`, `artifactSelectors.ts`.

## Decisions needed

**Situation.** Six call sites open a live `iframe`/`html` preview (a code editor's output, an agent
app's rendered page) into the canvas. Their content is generated and re-renderable, so the type
system treats them as persistable, but nobody has said whether a live preview should become a saved
artifact with its own id and share link.
**Decide.** Are `iframe`/`html` live previews artifacts (convert them, they get ids and share links)
or ephemeral views (add them to `NON_PERSISTABLE_CANVAS_TYPES` and stop offering Save on them)?
