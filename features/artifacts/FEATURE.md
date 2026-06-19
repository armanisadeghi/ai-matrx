# FEATURE.md — `artifacts` + `canvas`

**Status:** `active` — primary output surface for agent responses; rapidly evolving
**Tier:** `1`
**Last updated:** `2026-06-19`

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

### Flow 2 — Interactive state persistence (per viewer)

1. User interacts with a rendered artifact (answers a quiz, studies a flashcard deck, checks a progress item).
2. **Custom-table types** (flashcards → `user_flashcard_*`, quiz → `quiz_sessions`, tasks → `ctx_tasks`) persist through their feature's adapter; **generic types** persist to `canvas_item_state(canvas_id, user_id, state)` via `useArtifactState` + `GENERIC_ADAPTER`. Keyed per viewer.
3. On reload the artifact rehydrates that state (loaded by `artifact_id`), so progress survives.
4. The model surfaces this via context on later turns (study scores, etc.) — NOT bundled into `user_input`.

> Adapter interface + registry: `features/canvas/artifact-types/persistence/`. See the **Materialization (LIVE)** section below for the full pipeline.

### Flow 3 — Data-touching artifacts: tracked proposal → Convert (tasks)

Data-touching types (tasks) are **never auto-created** (vision R7). The materialized artifact is a *tracked proposal*.

1. A `tasks` artifact renders the proposed checklist + an explicit **"Convert to tasks"** action (`TasksArtifact.tsx`).
2. Convert creates real `ctx_tasks` via the canonical **`ctx_task_associations`** bridge (`entity_type='artifact'`, `entity_id=<canvas item id>`) — the same path `TaskPreviewWindow`/`TaskChipRow` use everywhere. No parallel linkage model.
3. After Convert the artifact flips to a **live mirror** (`TaskChipRow`) of the real tasks; their status round-trips through the normal task surfaces. "Proposed vs linked" is derived from `canvas_items.external_system`.

### Flow 4 — Canvas persistence + versioning

1. Every artifact emitted by an agent creates a canvas row on completion.
2. If the same `id` is emitted again (edit / regeneration), a new version row is written; pointer advances.
3. Users can browse prior versions.

### Flow 5 — Social canvas

1. Owner marks a canvas public / shares via `features/sharing/`.
2. Discovery surface lists it. Leaderboard ranks by reactions / views.
3. Public canvas URL renders with minimal bundle, no Redux auth.

---

## Materialization (render block → persistent artifact) — LIVE

The conversion that makes an artifact durable + model-referenceable. Lives in `features/canvas/materialization/`.

1. **Trigger** — at stream-end commit (`process-stream.ts`, per committed assistant turn) AND an owner-gated reconcile-on-load pass (`loadConversation` → `reconcileArtifacts.ts`) for historical / unfinished messages.
2. **Persist** — each materializable block → a `canvas_items` row via `cx_canvas_upsert`, idempotent on the `(source_message_id, artifact_index)` natural key.
3. **Rewrite to the canonical R1 text form** — the raw block in `cx_message.content` is replaced by **plain text**: `<artifact type="X" id="<uuid>" version="N" title="T">body</artifact>` (`artifactWire.ts#wrapArtifactText`), persisted via **`cx_message_set_content`** (SECURITY DEFINER, owner-checked, **status-preserving**, archives the raw original into `content_history`). NOT `cx_message_edit` (marks status `'edited'`). There is **no `artifact_ref` content block** — one stored form is simultaneously what the UI renders, the durable archive, and what the model reads natively (aidream passes text through, so model-visibility is free — see [vision R1/R4](docs/ARTIFACT_VISION_AND_DESIGN.md)).
4. **R3 recognition + render by id** — `isMaterializedArtifactId(id)` (UUID test, `artifact-types/artifactId.ts`): a `<artifact>` with a real canvas UUID → render the live row by id (`useCanvasItem` → `ArtifactRefBlock` → `ArtifactBlock`), ignoring the inline body; a non-UUID/absent id (the model's `artifact_1`, or mid-stream) → render inline + stay a materialization candidate. **Idempotent** — a fully-materialized message yields no new artifacts, so re-running never rewrites or duplicates.

Pure planner: `planMaterialization.ts`. Orchestrator: `materializeMessageArtifacts.ts`. Type registry (single source of truth): `artifact-types/artifact-type-registry.ts`.

**Invariants:**
- **Idempotent + reversible.** The unique key prevents duplicate rows; `content_history` keeps the raw original. Reconcile-on-load retries anything the live commit didn't finish — nothing vanishes, nothing duplicates.
- **Owner-only.** A viewer never mints `canvas_items` for someone else's conversation.
- **Materialize against REAL message ids only** (never client-temp/optimistic ids).
- A partial persistence failure **aborts the whole message rewrite** — never rewrite a block to a dangling ref; reconcile retries.

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

- `2026-06-19` — claude: **Vision build R1–R8 (Waves 0–4).** Rewrite converged from the foreign `artifact_ref` content block to the canonical **R1 text form** `<artifact type id version title>body</artifact>` (`artifactWire.ts`) — one stored form the UI renders by id (R3 recognition via `isMaterializedArtifactId`), the model reads natively (fixes model-blindness with zero server work), and archives durably; all `artifact_ref` plumbing deleted, 19 live messages migrated. **Tasks** are now tracked proposals (vision R7) — auto-create removed, explicit **Convert** via `ctx_task_associations`. **Interaction state** round-trips to `canvas_item_state` (recipe/presentation/comparison wired to `useArtifactState`, joining progress/decision-tree/troubleshooting). **Server (aidream):** `conversation_artifacts` injected as read-only context each turn (`artifact_context.py`, R8) — the model sees the latest copy + status + the user's interaction state. **HTML publish** made server-idempotent. Source of truth: [`docs/ARTIFACT_VISION_AND_DESIGN.md`](docs/ARTIFACT_VISION_AND_DESIGN.md). Deploy-pending: aidream prod, mymatrx publish live-verify.
- `2026-06-14` — claude: **Mermaid structural editing widened 5 → 9 types** + **viewport sizing overhaul**. Added round-trip-safe adapters for **journey, quadrant, state (flat stateDiagram-v2), and ER** (outline + code editing; visual tap-to-edit stays flowchart-only); each guarantees lossless round-trip or downgrades to code-only. New `MermaidViewport` does **axis-aware fit with a readability floor** (bounded frame; tall diagrams fill width + scroll down, wide mind maps fill height + scroll across; never auto-shrinks below 50%). Plus review fixes: Code-mode unmount draft-loss, CodeMirror dark theme, fidelity-gate serialize-error transparency, svg-id-map loud version-drift degrade, and an en/em-dash arrow sanitizer normalizer. 40 adapter + sanitizer tests green. See [`docs/handoffs/MERMAID_RENDER_BLOCK_HANDOFF.md`](../../docs/handoffs/MERMAID_RENDER_BLOCK_HANDOFF.md).
- `2026-06-12` — claude: **Mermaid diagram artifact type** — new first-class `mermaid` block (from ` ```mermaid `/` ```mmd ` fences, server + client detection) materializes to `canvas_items` (`type: "mermaid"`, `content.metadata.diagramType/title`). Renders live during streaming (last-good-render + forgiving sanitizer in `components/mermaid/`), opens into `MermaidWorkbench` (canvas) with three views of one diagram — Diagram (tap-to-edit), Outline (structured rows), Code (CodeMirror) — gated by a per-adapter round-trip fidelity check (flowchart/mindmap/sequence/pie/timeline). User edits save as new versions via `cx_canvas_save_user_version` (session-versioning); chat refs resolve `"latest"` and live-refresh on `matrx:canvas-item-updated`. Agent editing via the `matrx-user/mermaid-editor` surface + "Edit with AI" rail (clone of cleanup's `useAiPostProcess`). Skill `mermaid-diagrams` + content block seeded ([`migrations/mermaid_render_block_platform.sql`](../../migrations/mermaid_render_block_platform.sql)). Other-platform renderers deferred — see [KNOWN_DEFECTS.md](../../KNOWN_DEFECTS.md) D5.
- `2026-06-18` — claude: **Artifact unification (Waves A–F) — ONE system.** Single source-of-truth type registry (`features/canvas/artifact-types/artifact-type-registry.ts`) replaces the 4 duplicate type→canvasType maps. **ONE renderer per type** (`artifact-types/renderers/*Artifact.tsx`) shared by all surfaces — BlockRenderer, CanvasBody, ArtifactBlock, AND the public renderer delegate via Renderer-gated early-branches; all per-type legacy switch cases deleted. **Persistence**: `canvas_item_state` (per-viewer, generic) + custom adapters (flashcards→`user_flashcard_*`, quiz→`quiz_sessions`, tasks→`ctx_tasks`); materialize calls `adapter.onMaterialize` → creates+links the domain record (`canvas_items.external_system/_id`) — verified live (flashcards → real set). **Discovery**: materialize writes a `cx_artifact` index row (`canvas_item_id`) so artifacts appear in `/artifacts` and render by id. `tasks` is now a materializable type; flashcards canvas mode = study mode (persists reviews). Demolition adversarially verified (P0/P1 none). The old aspirational Flow 2 ("bundled into user_input") was never how it worked — see corrected Flow 2.
- `2026-06-10` — claude: **materialization pipeline LIVE + verified** — render blocks auto-persist to `canvas_items` (commit-path + owner-gated reconcile-on-load) and the message is rewritten to a typed `cx_artifact_ref` rendered by id (no regeneration). New `cx_message_set_content` RPC (status-preserving, archives raw); fixed `cx_message_status_check` to allow `'edited'` (was silently breaking every `cx_message_edit`). Wave 0 hardening: stored-XSS on public canvas (`SandboxedHtml`), html-pages GET IDOR, crypto share tokens, corrupt-save guard (`isPersistableCanvasType`), stream-commit never-drop.
- `2026-05-19` — composer: new modern canvas shell (`CanvasSideSheetInner` + `CanvasPane` + `CanvasBody`). Vertical split via `react-resizable-panels` with persisted ratio. Floating `CanvasReopenChip` and global ⌘\ shortcut. Glass tap buttons throughout the header, matching the new chat input + sidebar language. Legacy `CanvasRenderer` / `CanvasHeader` retained for in-page surfaces.
- `2026-04-22` — claude: initial combined FEATURE.md for artifacts + canvas.

---

> **Keep-docs-live:** new artifact types MUST land with a registry entry + a note here if they introduce new patterns. Streaming contract changes must cross-update `features/agents/docs/STREAMING_SYSTEM.md` and this doc.
