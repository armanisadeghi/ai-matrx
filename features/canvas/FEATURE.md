# FEATURE.md — `canvas`

**Status:** `live` (global side-sheet pane, single + split layouts, 30+ artifact types, library persistence, share-by-token)
**Tier:** `1`
**Last updated:** `2026-08-11` — surface section verified against live code and a live agent run this date.

> **The one thing to understand: the Canvas is a HOST, not an editor.**
> It renders ARTIFACTS through a type-keyed switch. It has no nodes, no node
> selection, and no text elements of its own. Authored content lives inside
> each artifact renderer — and, where it is agent-writable, on that
> artifact's OWN surface.

---

## Purpose

The Canvas is the unified live workspace: a right-side pane that slides in
over whatever route the user is on and renders one artifact per pane — a
mermaid diagram, a table, a code block, a quiz, an HTML view, a working
document. It is opened from a chat message, from a code block, or from the
chat header's Canvas button (⌘\).

Deeper topic docs live in `docs/` (persistence, sharing, header chrome,
troubleshooting) and `ARTIFACT-MODEL-GUIDELINES.md`. This file covers the
shell, the state model, and the surface integration.

---

## Shape of the thing

| Layer | Where |
|---|---|
| Front door (always mounted, owns ⌘\ + availability signalling) | `core/CanvasSideSheet.tsx` |
| Heavy shell — slide-in, width resize, optional vertical split, **surface emitter** | `core/CanvasSideSheetImpl.tsx` |
| Per-pane header chrome + body | `core/CanvasPane.tsx` |
| The type-keyed renderer switch | `core/CanvasBody.tsx` |
| Unified artifact renderers (chart, table, quiz, mermaid, …) | `artifact-types/renderers/*` |
| State | `redux/canvasSlice.ts` |
| Library persistence (`canvas_items`) | `services/canvasItemsService.ts`, `hooks/useCanvasItems.ts` |

**State model** (`canvasSlice`): a session holds `items[]`, each
`{ id, content: { type, data, metadata }, timestamp, savedItemId, isSynced }`.
`id` is an EPHEMERAL session id used to switch panes; `savedItemId` (or
`metadata.canvasItemId`) is the durable `canvas_items` UUID and is absent
until the item is saved. `currentItemId` drives the primary pane and
`secondaryItemId`, when set, turns on the stacked split layout.

**Materialized artifacts store a POINTER.** `openArtifactInCanvas` puts
`data: { artifactId }` in the item — the artifact body lives in `canvas_items`,
not in Redux. Legacy `openCanvas` items carry a full payload. Anything reading
`content.data` must handle both.

The slice is **not persisted** — a full page reload empties the canvas.

---

## Surface integration — `matrx-user/canvas`

**Manifest:** `features/surfaces/manifests/canvas.manifest.ts`
**Emitter:** `SurfaceRuntimeProvider` in `core/CanvasSideSheetImpl.tsx`
**Scope builder:** `lib/canvas-scope.ts`

The provider mounts after the `!currentItem` guard, so it covers the single
AND split layouts and every route the pane overlays. `getScope` reads the
canvas slice **off the store at Run time** rather than closing over rendered
state — the user is one ⌘\ away from switching items between mount and
launch — and the single non-Redux input (`isMobile`, which decides whether
the split is actually rendered) rides a ref advanced on every render.

Values describe the PANE and the open item: identity (`current_canvas_id`,
`current_canvas_type`, `current_canvas_title`, `current_canvas_is_saved`,
`canvas_json`) and session (`open_items`, `item_count`, `is_split`,
`secondary_canvas_id`, `render_mode`). Nothing reaches inside a renderer.

**No `writeTargets`, by design.** The pane owns no authored text. Writing
"into the canvas" generically would mean reaching through the host into
whichever artifact renderer happens to be mounted — a parallel write path
around surfaces that already ship their own targets (`mermaid-editor`,
`html-page`, `working-document`/`scratchpad`). The full judgment is recorded
in the `features/surfaces/FEATURE.md` Change Log entry for 2026-08-11.

**Nesting:** this provider is an ANCESTOR of whatever it renders, and
`getSurfaceRuntime` picks the DEEPEST registration — so when the open item is
a working document, `WorkingDocumentEditor`'s own provider still wins and its
shipped write targets stay reachable. A host surface cannot shadow the
artifact surface inside it.

**Verifying it:** `/canvas` is NOT a route (only `/canvas/discover` and
`/canvas/shared/[token]` exist), and on a MAPPED route the route surface wins
in `SurfaceAgentsPanelImpl` — on `/chat/[id]` that means `matrx-user/chat`
wins and the canvas scope is dropped entirely, not merely relabelled. Verify
on a route with no route→surface mapping (`/artifacts`), reached by
CLIENT-SIDE navigation with the pane open, since a reload empties the slice.

---

## Change Log

- **2026-08-11 — First `SurfaceRuntimeProvider` for `matrx-user/canvas`; manifest re-authored against the live pane; `selectCanvasRenderMode` fallback fixed.** The manifest previously declared diagram-node vocabulary (`selected_node_id`, `selected_nodes`, `current_text_block`) for an editor this codebase does not contain, and documented `render_mode` with an edit/preview enum it never had. Those values are gone; the real ones the pane owns are declared and now actually emitted, with `canvas_json` documented as only the `{ artifactId }` pointer for materialized artifacts. `selectCanvasRenderMode` fell back to `"panel"` — never a `CanvasRenderMode` — and now falls back to the slice's own `"auto"` and is typed. Deliberately NO write targets: the canvas is a host, and its artifacts' own surfaces are strictly closer to the content. Live-verified with a Badass Agent run on `/artifacts` with the pane open; `check:surface-drift` green.
