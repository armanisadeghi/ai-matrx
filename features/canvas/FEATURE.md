# FEATURE.md — `canvas` (local mechanics)

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/workspace/artifacts-canvas/STATE.md` — read it before touching this feature in ANY repo.

The product truth, architecture narrative, wire contract, data model, decisions and open work live
in that node's doc kit (`STATE.md`, `ARTIFACT-WIRE-CONTRACT.md`, `TWO-WAY-BINDING.md`,
`CANVAS-DATA-MODEL.md`, `DECISIONS.md`, `HANDOFF.md`, `VISION.md`). This file is the file map plus
the rules an agent editing THIS directory must obey.

> **The one thing to understand: the Canvas is a HOST, not an editor.** It renders ARTIFACTS
> through a type-keyed switch. It has no nodes, no node selection, and no text elements of its own.

## Shape of the thing

| Layer                                                                          | Where                                                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Front door (always mounted, owns ⌘\ + availability signalling)                 | `core/CanvasSideSheet.tsx`                                                                       |
| Heavy shell — slide-in, width resize, optional vertical split, surface emitter | `core/CanvasSideSheetImpl.tsx`                                                                   |
| Per-pane header chrome + body                                                  | `core/CanvasPane.tsx`                                                                            |
| The type-keyed renderer switch (+ `titleToString`, `getDefaultTitle`)          | `core/CanvasBody.tsx`                                                                            |
| Unified artifact renderers (chart, table, quiz, mermaid, …)                    | `artifact-types/renderers/*`                                                                     |
| Type registry — the single source of truth                                     | `artifact-types/artifact-type-registry.ts`                                                       |
| Materialization primitive + planner + unbind                                   | `materialization/`                                                                               |
| Markdown export                                                                | `export/exportArtifactMarkdown.ts`                                                               |
| State                                                                          | `redux/canvasSlice.ts`                                                                           |
| Library persistence (`canvas_items`)                                           | `services/canvasItemsService.ts`, `services/canvasArtifactService.ts`, `hooks/useCanvasItems.ts` |
| Public/social surface                                                          | `social/`, `discovery/`, `leaderboard/`, `shared/resolveSharedCanvas.ts`                         |
| Legacy in-page renderer (3 importers, queued for collapse)                     | `core/CanvasRenderer.tsx`                                                                        |
| Visual maps — a DIFFERENT registry node built on this stack                    | `maps/FEATURE.md`                                                                                |

## Rules for this directory

- **The owner of a canvas write is `auth.uid()`, never a value the client sends.** The write RPCs
  still take `p_user_id`, but `canvas._require_actor()` validates it (`28000` with no session,
  `42501` on mismatch). **Never hand-write a second actor resolver in this family, and never
  reintroduce inserting `p_user_id` directly.**
- **Renderers MUST handle partial state.** Artifacts stream; you will be handed half-written
  content.
- **One type → one renderer**, identical across Chat, Runner, Shortcut result and Agent App. No
  per-surface forks. Adding a type = registry entry + `CanvasContentType` + discovery map +
  `renderers/XArtifact.tsx` + the RENDERERS map (+ `SPECIAL_CODE_LANGUAGES` for fence types).
- **Canvas is the DB; artifacts are the wire format.** Never persist wire-format `<artifact>` tags
  as content — persist the structured payload.
- **Version rows are never overwritten.** Each edit is a new row via `cx_canvas_save_user_version`.
- **Materialize against REAL source ids only** (`isRealSourceId`); a partial persistence failure
  **aborts the whole source rewrite**; adapter and discovery writes are **non-blocking**.
- **The rewrite may NEVER change a message's tool_call blocks** — `cx_message_set_content` rejects
  it (`tool_call_graph_change_forbidden`). A rejection means the commit path mis-partitioned
  iterations; fix the partition, not the guard.
- Chat rewrites go through **`cx_message_set_content`** (status-preserving, archives to
  `content_history`), **never `cx_message_edit`** (marks the row `'edited'`).
- **Read the node's `TWO-WAY-BINDING.md` before touching artifact EDIT or UNBIND on any surface.**
  `ArtifactTypeDef.userEditable` is the ONE edit switch — flag a type only when its editor actually
  exists and saves versions.
- The slice is **not persisted** — a full page reload empties the canvas. Materialized items store
  a POINTER (`data: { artifactId }`); legacy `openCanvas` items carry a full payload, so anything
  reading `content.data` must handle both.
- Use `updateCanvasContent` (not `openCanvas`) to change an item already on the canvas — `openCanvas`
  creates a duplicate. `closeCanvas()` keeps items in memory; `clearCanvas()` destroys them.
- Pass `titleToString(content.metadata?.title)` — never the raw `metadata.title` — to anything that
  needs a plain string; `CanvasContent.metadata.title` is deliberately `string | ReactNode`.
- **No `writeTargets` on the `matrx-user/canvas` surface, by design** — the pane owns no authored
  text, and its artifacts' own surfaces are strictly closer to the content.
- `search_vector` and `trending_score` on `shared_canvas_items` are trigger-maintained; never write
  them from app code.
- **Verifying the canvas surface:** `/canvas` is not a route, and on a MAPPED route the route
  surface wins — verify on `/artifacts` (no route→surface mapping), reached by CLIENT-SIDE
  navigation with the pane open, since a reload empties the slice.

**Keep-docs-live:** a change to the wire format, the identity keys, the type registry, or the write
path updates the node's `STATE.md` in the same session.

## Change log

- `2026-08-25` — The Working document canvas inherits the responsive `DocumentsWorkspace`: its document list is a full-width mobile state and selecting a document returns to the full-width editor, while desktop keeps the side-by-side rail.
