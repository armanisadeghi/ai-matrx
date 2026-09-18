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
| THE ONE presentation — overlay slide-in + width resize, identical everywhere   | `core/CanvasSideSheetImpl.tsx`                                                                   |
| The content it presents — card, vertical split, surface emitter                | `core/CanvasSurface.tsx`                                                                         |
| Per-pane header chrome + body                                                  | `core/CanvasPane.tsx`                                                                            |
| The type-keyed renderer switch (+ `titleToString`, `getDefaultTitle`)          | `core/CanvasBody.tsx`                                                                            |
| Unified artifact renderers (chart, table, quiz, mermaid, …)                    | `artifact-types/renderers/*`                                                                     |
| Type registry — the single source of truth                                     | `artifact-types/artifact-type-registry.ts`                                                       |
| Materialization primitive + planner + unbind                                   | `materialization/`                                                                               |
| Tool result → canvas offer wire (registry + pure rules + headless opener)      | `tool-results/`                                                                                  |
| The switcher-visibility rule, and the remembered reveal decision                | `core/canvasSwitcher.ts`, `revealMemory.ts`                                                      |
| Markdown export                                                                | `export/exportArtifactMarkdown.ts`                                                               |
| State                                                                          | `redux/canvasSlice.ts`                                                                           |
| Library persistence (`canvas_items`)                                           | `services/canvasItemsService.ts`, `services/canvasArtifactService.ts`, `hooks/useCanvasItems.ts` |
| Public/social surface                                                          | `social/`, `discovery/`, `leaderboard/`, `shared/resolveSharedCanvas.ts`                         |
| Legacy in-page renderer (3 importers, queued for collapse)                     | `core/CanvasRenderer.tsx`                                                                        |
| Visual maps — a DIFFERENT registry node built on this stack                    | `maps/FEATURE.md`                                                                                |

## Rules for this directory

- 🚨 **THERE IS ONE PRESENTATION AND NO ROUTE OWNS ONE OF ITS OWN.** The
  canvas is the globally mounted `CanvasSideSheet` — an overlay drawn at the
  right edge, at z-10000, from y = 0 — and every route gets exactly that one:
  documents, artifacts, the browser, the sandbox, chat. A route NEVER mounts,
  wraps, docks or otherwise presents the canvas; it only opens things INTO it
  through the headless openers. If the canvas genuinely lacks something one
  route needs, EXTEND `CanvasSideSheetImpl`/`CanvasSurface` for every route —
  never fork a presentation for one. Owner, 2026-09-16, rejecting exactly such
  a fork (`CanvasDock`, a docked column the chat route wrapped its body in,
  which lived 2026-09-14 → 2026-09-17): *"The canvas system set up for the
  sandboxes completely breaks the core systems for how these canvases work. It
  adds an unnecessary layer, causes a shift in the top header buttons and
  creates a mess that clearly shows it is not properly built to be identical to
  the way the canvas actually works. FOLLOW established patterns."*
  Guards: `features/canvas/__tests__/one-canvas-presentation.test.ts` (static —
  no dock module, no dock state, no route mounting a presentation) and
  `features/shell/layout-gate/canvas-one-presentation.spec.ts` (real-engine
  rects — the canvas pane header lands at the same place on chat as on a
  document route, and opening the canvas moves no shell header button).
- **AN OPEN-IN-CANVAS REQUEST NEVER SILENTLY DOES NOTHING.** Every place a
  request to show something in the canvas can be dropped — no type, no data,
  an unknown type, an artifact that would not persist, a route with no canvas
  surface — ends in `reportCanvasOpenDrop` (`openRequest.ts`), which names what
  was asked for and what to do instead. A bare `return` there is the defect:
  live on 2026-09-14 an agent announced it had opened a document artifact, the
  canvas kept showing what it was showing, and nothing anywhere said otherwise.
  `useCanvas().open` returns a boolean for the same reason. Availability is
  checked with `useCanvasOpenGuard` BEFORE dispatching, because the slice
  happily accepts an open for a route that mounts nothing.
- **Availability has ONE source:** `selectCanvasIsAvailable` reads the flag the
  global front door raises on mount. A second source meant a second
  presentation, and that is the layer above.

- **Never fork the canvas body.** Card, vertical split and pane chrome live
  once in `core/CanvasSurface.tsx`; `CanvasSideSheetImpl` owns only placement,
  width and the Radix Sheet.
- **react-resizable-panels v4: a bare number is PIXELS.** Percentages must
  carry the unit (`defaultSize={\`${ratio}%\`}`). Invoke the
  `react-resizable-panels-v4` skill before touching any group here.

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
  bars above the content. These immersive viewers also mark the global side canvas unavailable,
  so nested renderers never advertise a second Canvas action that cannot have a persisted source.

**Keep-docs-live:** a change to the wire format, the identity keys, the type registry, or the write
path updates the node's `STATE.md` in the same session.

## Change log

- `2026-09-17` — **THE CANVAS HAS ONE PRESENTATION AGAIN; THE CHAT ROUTE'S
  PARALLEL LAYER IS GONE.** Owner rejection (review row 34bfd1e8, 2026-09-16,
  verbatim): *"The canvas system set up for the sandboxes completely breaks the
  core systems for how these canvases work. It adds an unnecessary layer,
  causes a shift in the top header buttons and creates a mess that clearly
  shows it is not properly built to be identical to the way the canvas actually
  works. FOLLOW established patterns."*
  Deleted: `core/CanvasDock.tsx`, `core/CanvasDockBody.tsx`,
  `core/__tests__/CanvasDock.test.tsx`, the slice's `dockHosts` / `dockRatio` /
  `registerCanvasDock` / `unregisterCanvasDock` / `setCanvasDockRatio` /
  `selectCanvasIsDocked` / `selectCanvasDockRatio`, the `|| dockHosts > 0` arm
  of `selectCanvasIsAvailable`, the front door's `isDocked` bail, the
  `CanvasSurfaceCard` `presentation` prop, and the dock's
  `paddingTop: var(--shell-header-h)` offset. `ChatRoomClient` now draws a
  plain body and mounts NO canvas presentation, exactly like every other route;
  the canvas reaches it through the one global `CanvasSideSheet`.
  What was CONTENT, not presentation, is untouched: the `sandbox` and
  `udt_document` content types, `tool-results/`, `revealMemory.ts`,
  `liveSourceReachability.ts`, and the ≥2 switcher rule (`core/canvasSwitcher.ts`)
  — that rule already belonged to the canonical canvas, so ours was dropped in
  favour of it.
  Measured difference the dock caused, reproduced in Chromium at 1280x720: the
  canvas pane header sat at `y = 44, width = 494.39` on chat against
  `y = 0, width = 768` on a document route (390x844: `y = 44, width = 156`
  against `y = 0, width = 390`).
  Guards, both proven RED before green:
  `features/canvas/__tests__/one-canvas-presentation.test.ts` (six static cases
  over every tracked source) and
  `features/shell/layout-gate/canvas-one-presentation.spec.ts`
  (`MATRX_LAYOUT_GATE_MUTATION=dock` rebuilds the rejected shape and the
  same-place case fails with those exact numbers).
  KEPT DELIBERATELY: the `styles/shell.css` rule
  `:root[data-admin-attention] .shell-main:has(> .h-full.overflow-hidden)::after
  { content: none; }`. It was added alongside the dock but is not chat-specific
  and not a canvas presentation — it stops ANY full-height route body gaining
  72px–14rem of slack scroll and sliding its composer under the floating shell
  header. Its own gate (`features/shell/layout-gate/shell-scroll-runway.spec.ts`)
  now models the canonical world and measures the composer instead of a docked
  column.

- `2026-09-17` — **Share and score refusals reach the person.** `useCanvasShare` rendered the raw transport sentence ("Select an organization before sending this request.") beside a Share button that could only fail again; `useCanvasScore` recorded nothing and said nothing. Both now speak the refusal with its remedy (`lib/organizations/organizationRefusalToast.ts`), and a score that fails for any other reason is spoken too rather than leaving the leaderboard silently unchanged.

- `2026-09-17` — **`canvasArtifactService.upsertDiscoveryIndex` can no longer write a NULL organization.** `organizationId` was `let organizationId: string | null = null` — a shape that reads as "maybe NULL", and a NULL on `chat.artifact` means `public._stamp_org_default` files the row in the writer's personal workspace. It is now a non-nullable `string`: a chat row takes its conversation's organization (a conversation without one is refused and logged, not written), and a non-chat row takes the SELECTED organization via `ensureOrgId`, which throws `OrganizationContextError` when there is none. Guard: `pnpm check:organization-context`.

- `2026-09-17` — **A canvas save that refuses for want of an organization SAYS SO; it is never a silent `false`.** Four services caught the new `OrganizationContextError` and returned a falsy value with only a `console.error` — a dead click: the quiz never persisted, the viewer state never saved, the artifact never reached the discovery index, and nothing on screen said why. `quiz-adapter.ts` and `canvasItemStateService.ts` now re-throw that ONE error class, and `useArtifactState.flush` — the boundary that owns the save — toasts the remedy; `canvasArtifactService.upsertDiscoveryIndex` re-throws it too, which both materialization callers already collect into the `errors` they return. `useCanvasItems.save` and `maps/service.createMap` replaced their generic "Failed to save" with the same remedy sentence, so `NewMapDialog` shows it verbatim. Every other error path is byte-for-byte unchanged. `canvas.canvas_item_state` and `education.quiz_sessions` were already carrying the selected organization; the defect here was purely the swallowed refusal. Law: `../../common-docs/policies/context-is-carried-never-rebuilt.md`.

- `2026-09-15` — **A LIVE PANE IS ALWAYS REACHABLE.** An independent reviewer
  reloaded a bound chat that also held an agent-created document, clicked
  Canvas, and got ONLY the document: `[data-canvas-switcher]` absent at one
  item, and no control anywhere that reached the running Sandbox again
  (production `528560bbc8`; row 1a4fbff1). Root cause: the canvas slice is
  deliberately not persisted while the reveal memory IS, so after a reload
  `alreadyAutoOpened` is true against an empty canvas — and
  `decideSandboxCanvasAction` answered `"none"`, which meant the item was not
  even OFFERED. The document took the single restored slot.
  **The rule now lives once**, in `liveSourceReachability.ts`: a
  NON_PERSISTABLE pane whose source is still live (`sandbox`, `cloud_browser`)
  is ALWAYS at least offered, and a pane whose source does not exist is never
  offered at all. Both the sandbox opener and the cloud-browser opener end
  their decision in `keepLiveSourceReachable`; the browser pane is now offered
  for the whole life of a run instead of only on a handoff. Put-away memory and
  never-hijack are untouched — this forbids only the answer that makes a live
  pane unreachable. The canvas history no longer offers **Remove** on a live
  pane (`isLiveSourcePaneType`): its surface would put it straight back, and a
  control that loses its own fight is the dead affordance law 4 forbids.
  Guard: `features/canvas/__tests__/live-pane-reachability.test.tsx` (11 tests;
  three mutations proven RED — no reachability floor, no source floor, and a
  live pane offered Remove), plus the two stale `"none"` expectations in
  `sandbox-canvas.test.tsx` corrected to `"offer"`.

- `2026-09-14` — **Mobile presents one pane even when Redux remembers a
  desktop split.** `CanvasPane` now follows the rendered presentation: with
  two or more items a phone keeps the history switcher reachable and hides the
  impossible Split canvas control; desktop retains its split-only header
  behavior. `CanvasNavigation` icon controls now name previous, history,
  next, and item removal actions for assistive technology. Guard:
  `core/__tests__/CanvasPane.mobile-split.test.tsx`.

- `2026-09-15` — **THE DOOR LAW: every record the UI names opens.** An
  independent reviewer created a document in a chat; the `document` tool
  succeeded, the row landed in `workbench.udt_documents`, the agent replied
  *"Created and opened as a document artifact"* — and nothing opened, no card
  appeared, and no drop notice fired, because **a tool result had no path to
  the canvas at all**. Three things closed it, all as a CLASS:
  (1) `udt_document` is now a `CanvasContentType` beside `sandbox` and
  `cloud_browser` — a pointer `{ documentId }` whose body mounts the canonical
  `DocumentEditor` (`features/data-tables/components/DocumentCanvasBody.tsx`),
  NON_PERSISTABLE because the editor owns its own snapshot history, but the
  first non-persistable type that still offers `Source`: a document's markdown
  IS what a person means by source, read back from its Univer snapshot by the
  one reader `features/data-tables/univer-doc-to-markdown.ts`.
  (2) `tool-results/toolResultCanvasRegistry.ts` is THE one place that answers
  "did this result create something the canvas can show" — keyed by tool name
  AND by result kind, so a future record-creating tool inherits the whole
  behaviour by adding one reader. `ToolResultCanvasOpener` (mounted once in
  `ChatRoomClient`) offers every such record into the switcher and opens only
  the newest, only into an EMPTY canvas, only with
  `coding.toolResultCanvasAutoOpen` on — the rules are the pure
  `decideToolResultCanvasAction`. A canvas showing something else is never
  hijacked.
  (3) The switcher rule moved into `core/canvasSwitcher.ts` and is a decision,
  not an accident: **two items or more, exactly like Claude.ai's artifact
  switcher** — one item has nothing to switch to and a `1/1` control that goes
  nowhere is a dead affordance. The control carries `data-canvas-switcher` and
  `shrink-0` so a narrow docked column can never squeeze it off screen.
  The sandbox's reveal memory generalized into `revealMemory.ts` (one
  implementation, namespaced) so "a pane the user put away stays away" can
  never drift between panes. Guard:
  `features/canvas/__tests__/document-canvas-door.test.tsx` (24 tests; EIGHT
  mutations proven RED — the nested `create` shape, the never-hijack guard, the
  two-item switcher rule, the `CanvasBody` case, the `Source` allowance, the
  snapshot reader, the per-record reading of "other content", and the
  reachability of an already-revealed record).
  **Two defects the live check caught that the guards had not**, both fixed and
  re-verified on production (commit `de5f3c8032`, 1280x720, admin account):
  a second document TOOK the pane from the first — "other content" had been
  computed once against every offer of the conversation instead of per record,
  so a canvas already showing the first document read as empty; and after a
  reload an already-revealed document was in NO switcher at all — the canvas
  slice is deliberately not persisted while the reveal memory is, so "already
  revealed → nothing to do" stranded the record. `canvasHoldsOtherContent` and
  `alreadyAutoOpened → "offer"` are those two fixes, each with its own guard.
  Evidence: `common-docs/operations/for-arman/2026-09-15/document-canvas-door/`.

- `2026-09-14` — **the docked canvas' own chrome can never scroll off the top,
  and `Source` shows the item's real source.** The pane header and the
  Preview/Source switcher measured `y = -18.5` on production: not the column's
  offset (that lands at 44) but the SHELL SCROLL OWNER — `.shell-main` gains a
  `::after` runway while a fixed notice is on screen, which on a full-height
  clipping route body (the chat room) is pure slack, and one wheel tick carried
  the whole surface under the floating header. Fixed in `styles/shell.css`; the
  real-browser gate is `pnpm test:shell-layout`
  (`features/shell/layout-gate/shell-scroll-runway.spec.ts`, 1280x720 +
  390x844, red at `top: -260` without the rule). `Source` no longer prints the
  redux envelope: `core/canvasSource.ts` resolves the item's own source
  (document markdown, artifact code, a structured artifact's markdown export,
  a pointer through its row) and types with no source of their own — every live
  pane, plus image/iframe — do not offer the switcher at all. The raw envelope
  stays admin-only in `CanvasArtifactDebugPanel`.

- `2026-09-14` — **an open-in-canvas request can no longer silently do nothing.**
  New `openRequest.ts` (`reportCanvasOpenDrop` + copy) and
  `hooks/useCanvasOpenGuard.ts`; every drop point in the open path announces
  itself with a remedy instead of returning. Guard:
  `features/canvas/__tests__/open-in-canvas-never-silent.test.tsx`.

- `2026-09-14` — **the canvas DOCKS instead of covering** (`CanvasDock`,
  `CanvasDockBody`, `dockHosts`/`dockRatio`, a `--shell-header-h` offset, the
  chat route wrapping its body in the dock). **REVERTED IN FULL on 2026-09-17
  — see the entry at the top of this log.** What survives from it: the body
  split into `core/CanvasSurface.tsx`, and the vertical split's
  `defaultSize={splitRatio}` fixed from **pixels** to percent under v4's unit
  rules.

- `2026-09-13` — **the bound SANDBOX is a canvas content type** (`sandbox`, NON_PERSISTABLE): Terminal / Files / Activity for a
  conversation's box, rendered by `features/agents/components/chat/sandbox-insight/SandboxCanvasBody`, opened through `useOpenSandboxCanvas`.
  It replaced a bespoke permanently-open chat side panel — the chat's right-hand region is SHARED (browser, documents, artifacts), and a
  content type inherits the canvas's collapse, resize, split, switcher and z-order instead of competing with them. New reducer
  **`offerCanvasItem`**: adds an item to the canvas (and so to the switcher) WITHOUT setting `isOpen` and without stealing `currentItemId`
  from content the user is reading — the primitive for "available, not on screen". It sets `currentItemId` only when nothing is current,
  because the shell mounts nothing until something is; any content type that wants to announce itself without hijacking uses it.

- `2026-08-30` — Immersive shared-canvas viewers now suppress the global side-canvas availability
  signal on both `/canvas/shared/[token]` and `/s/[token]`, removing nested dead-end Canvas actions.

- `2026-08-27` — Fresh mobile certification raised canonical block icon actions to the 44px touch
  floor with tooltip-derived accessible names, repaired progress/troubleshooting action reflow, and
  brought presentation, recipe, decision-tree, timeline-menu, and math controls to the same mobile
  floor while preserving their compact desktop sizing; math Back now rebuilds from the target state
  and All Lessons uses one valid link-button control.
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
