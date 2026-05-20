# FEATURE.md — `artifacts` + `canvas`

**Status:** `active` — primary output surface for agent responses; rapidly evolving
**Tier:** `1`
**Last updated:** `2026-05-19`

> Combined doc: **Artifacts** (wire format + block renderer) and **Canvas** (DB / library that persists + versions them). These two cannot be understood separately.

---

## Purpose

- **Artifacts**: self-contained structured outputs emitted by models using syntax like `<artifact type="..." id="..." />`, streamed via `content_block` NDJSON events, rendered by a type-keyed component registry. **Bidirectionally interactive** — the model produces structured output, the UI renders it as a real component, the user's interactions feed back into the next turn.
- **Canvas**: persistent library for interactive renderable blocks (artifacts, dashboards, code editors, flashcards, diagrams). Canvas auto-persists artifacts with versioning and surfaces them for discovery, sharing, and re-use.

One sentence: **artifacts are the wire format; canvas is the database.**

---

## Entry points

**Routes**
- `app/(public)/canvas/` — public canvas surface (discovery, view)
- Canvas panel embedded in authenticated routes alongside Chat / Runner

**Feature code — `features/artifacts/`**
- `core/` — artifact detection + dispatch from stream events
- `custom-components/` — type-specific renderers
- `discovery/` — browse/search surface
- `hooks/` — consumer hooks
- `leaderboard/` — top artifacts
- `redux/` — slice (artifact state, in-stream partials)
- `services/` — persistence + fetch
- `shared/` — cross-type primitives
- `social/` — sharing, embedding, reactions
- `utils/` — helpers
- `canvas-block-meta.ts` — type metadata registry
- `ARTIFACT-MODEL-GUIDELINES.md` — the model-facing spec
- `docs/` — deeper references

**Feature code — `features/canvas/`**
- `core/` — the global right-side canvas surface
  - `CanvasSideSheet` / `CanvasSideSheetInner` — slide-in panel mounted once at the layout root (`(a)` via `DeferredIslands`, `(public)` directly). Owns width-resize, the ⌘\ shortcut, and the optional vertical split.
  - `CanvasPane` — single pane with its own modern header (glass tap buttons). Knows about its `paneRole` (`"single" | "top" | "bottom"`) and adapts close / split / swap / promote semantics accordingly.
  - `CanvasBody` — type-keyed renderer switch. The one place to add a new block renderer.
  - `CanvasReopenChip` — floating bottom-right pill that surfaces only when canvas items exist but the surface is closed.
  - `CanvasRenderer` / `CanvasHeader` — legacy in-page renderer kept for `PromptRunnerModal`, `AdaptiveLayout`, `SharedCanvasView`, `ConversationShell`. Same body output, older header chrome.
- `builder/` — canvas builder UI
- `runner/` — live-rendered canvas
- `home/` — canvas dashboard
- `demo/`, `test/`, `common/`, `hooks/`, `utils/`, `styles/`, `constants/`

**Global mount points**
- `app/(a)/layout.tsx` → `<DeferredIslands />` (idle-loads `CanvasSideSheetInner` + `CanvasReopenChip`).
- `app/(public)/layout.tsx` → mounts `<CanvasSideSheet />` + `<CanvasReopenChip />` directly.
- Both render with `z-index: 10000` so the canvas sits above modals, drawers, and window panels.

---

## Data model

**Artifact on the wire** — emitted mid-stream by the model:

```
<artifact type="<type>" id="<uuid>"> ... content ... </artifact>
```

Streamed as `content_block` NDJSON events (see [`features/agents/docs/STREAMING_SYSTEM.md`](../agents/docs/STREAMING_SYSTEM.md)). Partial content arrives incrementally.

**Canvas row** — persisted artifact:
- `id` (uuid)
- `type` — maps to renderer via `canvas-block-meta.ts`
- `metadata` — type-specific (title, summary, schema version)
- `content` — the structured payload
- `version` — monotonic; each update increments
- Scope columns per [`../scopes/FEATURE.md`](../scopes/FEATURE.md)
- Social fields (share flag, reaction counts)

**Type registry** — `canvas-block-meta.ts` maps `type` → React component + metadata. Adding a new artifact type means adding an entry here plus the custom component under `features/artifacts/custom-components/`.

---

## Key flows

### Flow 1 — Agent emits an artifact mid-stream

1. Model writes `<artifact type="task_list" id="..."> ... </artifact>` to its output.
2. Server emits `content_block` events with partial content as tokens arrive.
3. Client's stream processor routes to the artifacts slice, keyed by `blockId`.
4. UI renders the `task_list` component in real time — it must handle partial state.
5. On `content_block.completion`, artifact is finalized. Canvas auto-persists a new row.

### Flow 2 — Bidirectional interactivity

1. User checks a task off in a rendered `task_list` artifact.
2. The user interaction mutates artifact state locally.
3. State change gets bundled into the next turn's `user_input` (see `features/agents/redux/execution-system/assembleRequest`).
4. Model sees the updated state, responds in context.

### Flow 3 — Sync to real app state

1. Agent produces a task list artifact meant to become actual tasks.
2. An explicit action ("Convert to tasks") invokes the tasks service → rows inserted into `features/tasks/`.
3. The artifact is now linked to real tasks via task IDs stored in the artifact metadata.

### Flow 4 — Canvas persistence + versioning

1. Every artifact emitted by an agent creates a canvas row on completion.
2. If the same `id` is emitted again (edit / regeneration), a new version row is written; pointer advances.
3. Users can browse prior versions.

### Flow 5 — Social canvas

1. Owner marks a canvas public / shares via `features/sharing/`.
2. Discovery surface lists it. Leaderboard ranks by reactions / views.
3. Public canvas URL renders with minimal bundle, no Redux auth.

---

## The type registry pattern

Adding a new artifact type:
1. Define the schema (types file under `features/artifacts/shared/` or `custom-components/<type>/`).
2. Build the renderer — **must handle partial state during streaming**.
3. Register in `canvas-block-meta.ts` with type key, display metadata, feature flags.
4. Emit from the model using `<artifact type="your_type" id="..." />`.

---

## Split mode

The canvas surface can show two items at once, stacked vertically with a draggable handle. Reducer state lives on `canvasSlice`:

- `currentItemId` — top pane (or only pane in single mode).
- `secondaryItemId` — bottom pane. `null` means single-pane.
- `splitRatio` — top pane's share of vertical space, 0–100, persisted.

Actions:
- `splitCanvasWith(itemId?)` — enter split mode. Falls back to the most-recently-used non-current item when no id is given, so a generic "Split" button always does something sensible.
- `unsplitCanvas()` — collapse to single pane, keeping the top item.
- `swapCanvasPanes()` — flip top ↔ bottom.
- `setCanvasSplitRatio(n)` — persists the handle position.

Rules:
- Split mode is desktop-only. On mobile the surface is fullscreen single-pane regardless of state.
- Each pane owns its own view-mode (preview / source) and share dialog; sync state lives on the canvas item, so syncing in one pane reflects everywhere.
- Closing the bottom pane = `unsplitCanvas`. Closing the top pane in split mode promotes the bottom to single. Closing in single mode = `closeCanvas` (state preserved, reopenable via the chip or ⌘\).

## Global summon UX

- **⌘\ / Ctrl+\\** — toggle canvas open/closed. Ignored while focus is in a text field. Bound inside `CanvasSideSheetInner` so every authenticated and public route gets it.
- **`CanvasReopenChip`** — bottom-right floating pill rendered when `items.length > 0 && !isOpen`. Shows the most-recent item's title and a count badge when there are multiple. Click reopens the canvas with whichever item was most recently active.

## Invariants & gotchas

- **Renderers MUST handle partial state.** Artifacts stream; you'll be handed half-written content. Never assume completeness mid-stream.
- **One type → one renderer.** The same artifact type must look identical across Chat, Runner, Shortcut result, Agent App surface. No per-surface forks.
- **Canvas is the DB; artifacts are the wire format.** Don't conflate. Do not persist wire-format artifact tags directly — persist the structured payload.
- **Bidirectional interaction feeds back on NEXT turn**, never mutates the model in place. State changes are additive to `user_input`.
- **App-state sync is explicit.** Artifacts are not automatically backed by real app tables. Explicit conversions (task list → tasks) are one-way and user-initiated.
- **Version rows are never overwritten.** Each update = new row. Previous versions remain browseable.
- **Scope on canvas rows follows the project multi-scope convention.** See [`../scopes/FEATURE.md`](../scopes/FEATURE.md).
- **Related but distinct:** Tool call visualization ([`../tool-call-visualization/FEATURE.md`](../tool-call-visualization/FEATURE.md)) is overlay UI around tool calls; artifacts are model-authored structured content. They share rendering infrastructure but aren't the same system.

---

## Related features

- **Depends on:** `features/agents/` (streaming source), `features/agents/docs/STREAMING_SYSTEM.md`, `features/sharing/`
- **Depended on by:** `features/conversation/`, `features/agent-apps/`, `features/tasks/` (app-state sync example), the tool-call-visualization consolidation
- **Cross-links:** [`ARTIFACT-MODEL-GUIDELINES.md`](./ARTIFACT-MODEL-GUIDELINES.md), [`TODO-artifact-frontend-integration.md`](./TODO-artifact-frontend-integration.md), [`TODO-canvas-artifact-integration.md`](./TODO-canvas-artifact-integration.md)

---

## Change log

- `2026-05-19` — composer: new modern canvas shell (`CanvasSideSheetInner` + `CanvasPane` + `CanvasBody`). Vertical split via `react-resizable-panels` with persisted ratio. Floating `CanvasReopenChip` and global ⌘\ shortcut. Glass tap buttons throughout the header, matching the new chat input + sidebar language. Legacy `CanvasRenderer` / `CanvasHeader` retained for in-page surfaces.
- `2026-04-22` — claude: initial combined FEATURE.md for artifacts + canvas.

---

> **Keep-docs-live:** new artifact types MUST land with a registry entry + a note here if they introduce new patterns. Streaming contract changes must cross-update `features/agents/docs/STREAMING_SYSTEM.md` and this doc.
