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
- **Materialize chat from persisted `cx_message.content`, never stream reservation content.**
  Reservation bookkeeping is not source-content authority; reading the row first prevents a
  later iteration's artifacts from being attributed to an earlier message. The existence-sensitive
  lookup uses `maybeSingle()`; a rolled-back/not-yet-visible row defers silently to the durable
  on-load reconciler, while a real read failure remains loud.
- Chat rewrites go through **`cx_message_set_content`** (status-preserving, archives to
  `content_history`), **never `cx_message_edit`** (marks the row `'edited'`).
- **Read the node's `TWO-WAY-BINDING.md` before touching artifact EDIT or UNBIND on any surface.**
  `ArtifactTypeDef.userEditable` is the ONE edit switch — flag a type only when its editor actually
  exists and saves versions.
- The slice is **not persisted** — a full page reload empties the canvas. Materialized items store
  a POINTER (`data: { artifactId }`); `CanvasBody` resolves that pointer through `useCanvasItem`
  before invoking the canonical renderer. Legacy `openCanvas` items carry a full payload, so
  anything reading `content.data` must handle both.
- Use `updateCanvasContent` (not `openCanvas`) to change an item already on the canvas — `openCanvas`
  creates a duplicate. `closeCanvas()` keeps items in memory; `clearCanvas()` destroys them.
- Pass `titleToString(content.metadata?.title)` — never the raw `metadata.title` — to anything that
  needs a plain string; `CanvasContent.metadata.title` is deliberately `string | ReactNode`.
- **No `writeTargets` on the `matrx-user/canvas` surface, by design** — the pane owns no authored
  text, and its artifacts' own surfaces are strictly closer to the content.
- **`canvas_views` direct inserts require an authenticated actor and explicit organization.**
  Guest share-token access is recorded by the canonical share-link resolver; knowing the shared
  canvas organization never authorizes an anonymous entity insert.
- `search_vector` and `trending_score` on `shared_canvas_items` are trigger-maintained; never write
  them from app code.
- **Verifying the canvas surface:** `/canvas` is not a route, and on a MAPPED route the route
  surface wins — verify on `/artifacts` (no route→surface mapping), reached by CLIENT-SIDE
  navigation with the pane open, since a reload empties the slice.
- **A public shared canvas owns the viewport.** Both `/canvas/shared/[token]` and the canonical
  `/s/[token]` lens suppress the generic public header/footer through
  `data-public-immersive-surface`, render the same identity/action header, and keep
  renderer-specific choices in floating controls — never stack route, artifact, and workbench
  bars above the content.

**Keep-docs-live:** a change to the wire format, the identity keys, the type registry, or the write
path updates the node's `STATE.md` in the same session.

## Change log

- `2026-08-27` — Fresh mobile certification raised canonical block icon actions to the 44px touch
  floor with tooltip-derived accessible names, repaired progress/troubleshooting action reflow, and
  brought presentation, recipe, decision-tree, timeline-menu, and math controls to the same mobile
  floor while preserving their compact desktop sizing.
- `2026-08-27` — Diagram viewport fitting now uses the mounted React Flow instance's bounds helper,
  preserving subflow-aware measurements without static-helper console warnings.
- `2026-08-27` — Quiz, comparison, presentation, research, resources, progress,
  troubleshooting, recipe, decision-tree, diagram, and both generic block wrappers now open
  materialized artifacts through `useOpenArtifactInCanvas`; inline blocks without a persisted id
  retain their snapshot fallback; the timeline and math-problem renderers preserve that persisted
  identity when they enter the generic wrappers.
- `2026-08-27` — Missing canonical chat-message rows now defer artifact materialization through
  `maybeSingle()` to the durable on-load reconciler without generating a false system error.
- `2026-08-27` — Canonical `/s/[token]` shared-canvas links now reuse the immersive canvas viewer;
  other share lenses keep the normal public shell.
- `2026-08-27` — Shared canvases became immersive one-header viewers; public Mermaid snapshots
  now use read-only floating view/style/export controls and a mobile view menu.
- `2026-08-27` — Saved-item and artifact-library opens now share `useOpenCanvasItem`, which validates
  the persisted type and opens a `{ artifactId }` pointer; materialized panes expose an explicit
  full-page door, and `/artifacts/[id]` resolves either artifact identity.
- `2026-08-27` — Public shared-canvas guests no longer attempt actor-owned `canvas_views` inserts;
  authenticated view rows still require both actor and explicit organization.
- `2026-08-27` — Canvas preview now hydrates materialized `{ artifactId }` pointers from the
  canonical `canvas_items` row before rendering, with visible loading and retryable failure states.
- `2026-08-27` — Public snapshot writes now resolve materialized `{ artifactId }` pointers to the
  canonical `canvas_items` payload before publishing, while renderers share the same validated
  pointer reader and fail loudly when content cannot be resolved.
- `2026-08-27` — Chat materialization now reads canonical persisted message content before any
  canvas write, preserving the row-owned tool graph across iteration-reservation races.
- `2026-08-25` — The Working document canvas inherits the responsive `DocumentsWorkspace`: its document list is a full-width mobile state and selecting a document returns to the full-width editor, while desktop keeps the side-by-side rail.
