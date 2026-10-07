# FEATURE.md — `canvas` (local mechanics)

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/publish/artifacts/STATE.md` — read it before touching this feature in ANY repo.

The product truth, architecture narrative, wire contract, data model, decisions and open work live
in that node's doc kit (`STATE.md`, `ARTIFACT-WIRE-CONTRACT.md`, `TWO-WAY-BINDING.md`,
`CANVAS-DATA-MODEL.md`, `DECISIONS.md`, `HANDOFF.md`, `VISION.md`). This file is the file map plus
the rules an agent editing THIS directory must obey.

> **The one thing to understand: the Canvas is a HOST, not an editor.** It is the
> `@ai-matrx/canvas` column (`aidream/apps/shared/canvas/FEATURE.md`): one docked right-hand column with panes
> and tabs. This directory is the app's binding to it plus the ARTIFACT kinds it shows through a
> type-keyed switch. No nodes, no node selection, no text elements of its own.

## Shape of the thing

| Layer                                                                          | Where                                                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| THE canvas — column, panes, tabs, identity, memory (npm package)             | `aidream/apps/shared/canvas/` (`@ai-matrx/canvas`, consumed from npm)                             |
| App binding: Redux key `canvasHost`, open-drop reporting                       | `host/CanvasHostProvider.tsx`                                                                    |
| Placement: fixed right column, `--shell-canvas-w`, surface emitter             | `host/ShellCanvasColumn.tsx`, `host/canvas-host.css`, `host/canvasSurfaceScope.ts`               |
| Every content type as a kind (icon, restore, keep-alive, header action, menu)  | `host/artifactKinds.tsx`                                                                         |
| Every tool as a kind (Quick Chat/Notes/Tasks/Data/Scribe, Scratchpad, Documents, Agent context, Note knowledge, Messages, Notifications) — one list; each kind beside its feature | `host/toolKinds.tsx`, `host/conversation/`, opener core `host/toolCanvas.ts` |
| "About this thing" kinds, each beside its feature: `record-peek`, `ai-visibility-answer`, `kg-source-preview`, `user-journey` (acquisition row), `directive-shape` (verb:noun), `topical-map-topic` (map\|slug, the `drawer` knob frame), `kg-suggestions` (the inbox), `comment-thread` (a record's threads, `entity:id`) | `host/featureCanvasKinds.ts` |
| A page's own live panel as a tab (`page-panel`): the page keeps the tree, the tab is a portal slot; every data table's row detail (`MatrxDataTableHost` port), admin create/edit forms | `host/pagePanel.tsx` (`<CanvasPagePanel>`) |
| Artifact item data + identity keys                                             | `host/artifactItem.ts`                                                                           |
| THE way app code opens content                                                 | `host/useArtifactCanvas.ts` (+ `hooks/useCanvas.ts`, `useOpenArtifactInCanvas`, `useOpenCanvasItem`) |
| Artifact tab body (CanvasBody / source, share sheet, debug panel)              | `host/ArtifactCanvasView.tsx`, `host/artifactPanels.ts`                                          |
| Content types, persistable set, title helpers                                  | `canvasContent.ts`                                                                               |
| The type-keyed renderer switch                                                 | `core/CanvasBody.tsx`                                                                            |
| Unified artifact renderers (chart, table, quiz, mermaid, …)                    | `artifact-types/renderers/*`                                                                     |
| Type registry — the single source of truth                                     | `artifact-types/artifact-type-registry.ts`                                                       |
| Materialization primitive + planner + unbind                                   | `materialization/`                                                                               |
| Tool result → canvas offer wire (registry + pure rules + headless opener)      | `tool-results/`                                                                                  |
| The remembered reveal decision                                                 | `revealMemory.ts`                                                                                |
| Markdown export                                                                | `export/exportArtifactMarkdown.ts`                                                               |
| Library persistence (`canvas_items`)                                           | `services/canvasItemsService.ts`, `services/canvasArtifactService.ts`, `hooks/useCanvasItems.ts` |
| Public/social surface                                                          | `social/`, `discovery/`, `leaderboard/`, `shared/resolveSharedCanvas.ts`                         |
| Visual maps — a DIFFERENT registry node built on this stack                    | `maps/FEATURE.md`                                                                                |

## Rules for this directory

- 🚨 **THERE IS ONE CANVAS AND NO ROUTE OWNS ONE OF ITS OWN.** The canvas is
  the `@ai-matrx/canvas` column, placed by `host/ShellCanvasColumn.tsx`: fixed to
  the right edge, full height, owning its own strip of the window's top. The
  shell root and the public/link layouts give up `--shell-canvas-w`, so the
  header and the page END at the canvas edge — it never covers them and never
  fights a page for space. Owner, 2026-10-01: *"the top of the page gets taken
  over by the canvas when it's open… then the canvas doesn't have to fight for
  space"*, modelled on the Claude Code / Codex panes. It is mounted exactly in
  `features/shell/components/AppShell.tsx`, `app/(public)/layout.tsx` and
  `app/(link)/layout.tsx`. A route NEVER mounts, wraps, docks or forks a
  canvas; it opens things INTO it. If the canvas lacks something, extend the
  PACKAGE for every host. (The 2026-09-16 ruling against a per-route
  `CanvasDock` still stands: that was a route-owned fork, which this is not.)
  Guard: `__tests__/one-canvas-column.test.ts`.
- 🚨 **THE RIGHT-HAND REGION IS THE CANVAS — there is no second floating right panel.** Detail
  about a thing opens a tab keyed by that thing (a kind beside its feature, registered in
  `host/featureCanvasKinds.ts` or `host/toolKinds.tsx`). A panel whose content is the page's own
  live state (a table's row detail, a create form) renders `<CanvasPagePanel>`: same props as the
  old side panel, the tab closes with the page. Something that is part of the page's own workspace
  is an in-page resizable pane instead. Guard: `__tests__/side-panels-are-canvas-tabs.test.tsx`.
- **A new kind of content is a KIND, never a new panel.** Register it with
  `registerCanvasKind(defineCanvasKind({...}))` (package registry); artifact
  content types are already registered in `host/artifactKinds.tsx`, and adding
  a `CanvasContentType` without its entry there is a type error.
- **Identity: the same thing never opens twice.** An artifact tab's key is the
  saved artifact id, else the producing task, else the producing message, else
  a hash of the content (`host/artifactItem.ts`). Re-opening focuses the
  existing tab. Choose a key that names the THING.
- **Canvas data is plain JSON.** The controller refuses functions and Dates
  and announces it. Live editor callbacks ride by id (`liveCallbacks.ts`).
- **AN OPEN-IN-CANVAS REQUEST NEVER SILENTLY DOES NOTHING.** Every place a
  request to show something in the canvas can be dropped — no type, no data,
  an unknown type, an artifact that would not persist, a route with no canvas
  surface — ends in `reportCanvasOpenDrop` (`openRequest.ts`), which names what
  was asked for and what to do instead. A bare `return` there is the defect:
  live on 2026-09-14 an agent announced it had opened a document artifact, the
  canvas kept showing what it was showing, and nothing anywhere said otherwise.
  `useCanvas().open` returns a boolean for the same reason.
- **Availability has ONE source:** the canvas provider's presence
  (`useCanvasOpenGuard` → `useOptionalCanvas`); `CanvasUnavailableBoundary`
  marks a subtree that must not open into it.

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
- **A surface-owned conversation is never materialized.** A launch with `surfaceOwnsOutput: true`
  (`launchAgentExecution` / `runHeadlessAgentJson`) stamps `surfaceOwnsOutput` on the conversation
  record before the stream commits; `persistSurfaceOwnsOutput` saves it as
  `chat.conversation.metadata.surface_owns_output` and `loadConversation` restores it and skips
  reconcile. The materializer reads it only through `selectConversationSurfaceOwnsOutput`.
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
- The canvas **remembers** its panes, tabs and width per browser (package localStorage port); kinds
  marked `restore: false` (live sessions) are left out. Materialized items store
  a POINTER (`data: { artifactId }`); `CanvasBody` resolves that pointer through `useCanvasItem`
  before invoking the canonical renderer. Legacy `openCanvas` items carry a full payload, so
  anything reading `content.data` must handle both.
- **THE OPEN ARTIFACT IS PART OF THE PAGE'S ADDRESS.** Because the slice is not
  persisted, a surface that has no other source for what was open LOSES it on
  reload. Chat does not notice — it re-derives its artifacts from persisted
  tool-call rows. A LIST route has no such source, so the address carries it:
  `/artifacts?open=<canvas_items.id>`, mirrored by
  `hooks/useCanvasArtifactUrlState.ts`. Any list surface that opens saved canvas
  items mounts that hook and inherits reload, Back, Forward and a shareable
  link — never a second persistence layer, never `localStorage`. Restoring goes
  through the SAME `useOpenCanvasItem` opener a click uses, and only once the
  canvas provider is present. The two
  directions are reconciled BY VALUE against one agreed-on id, never by
  remembering which URLs we wrote — that bookkeeping swallows Forward to an
  artifact that was open before. Guard:
  `features/canvas/__tests__/canvas-artifact-url-state.test.tsx`.
- Change the active artifact tab in place with `useArtifactCanvas().updateActive` (or the controller's
  `update`). Putting the canvas away keeps its tabs; `clear` closes them.
- Pass `titleToString(content.metadata?.title)` — never the raw `metadata.title` — to anything that
  needs a plain string; `CanvasContent.metadata.title` is deliberately `string | ReactNode`.
- **No `writeTargets` on the `matrx-user/canvas` surface, by design** — the pane owns no authored
  text, and its artifacts' own surfaces are strictly closer to the content.
- **Views go through `canvas.record_canvas_view(p_canvas_id, p_organization_id, p_session_id, p_referrer)` only**,
  signed-in viewers only, in the organization the viewer has SELECTED (`getActiveOrgId`; a passive
  page view never prompts, so no selection = no view). At most one row per (canvas, viewer) per hour;
  `trigger_canvas_view_count` moves `view_count`. Guests record nothing — guest share-token access is
  recorded by the canonical share-link resolver, and an anonymous definer insert would let anyone
  inflate a public canvas's count by rotating session ids.
- **Scores go through `canvas.submit_canvas_score(...)` only.** An attempt ledger: every submit is a
  new row owned by the caller (leaderboard name from their own profile, never a parameter), in the
  organization they name; returns `{score, rank, is_high_score, beats_own_best, attempt_number}`
  computed where every score is visible. `canvas_views`/`canvas_scores` refuse every client write
  (SECURITY-SWEEP 2026-09-21). Live proof: `scripts/canvas-score-view/live-proof.mjs`.
- **Likes go through `canvas.set_canvas_like(p_canvas_id, p_liked, p_organization_id)` only.**
  `canvas.canvas_likes` refuses every client write (SECURITY-SWEEP 2026-09-21: its `user_id` is
  unpinned by the generated policies). The door makes the like the caller's own, requires a canvas
  the caller can see, stamps the organization the caller names, archives on unlike and revives
  the same row on re-like, and returns `like_count`. Live proof: `scripts/canvas-like/live-proof.mjs`.
- `search_vector` and `trending_score` on `shared_canvas_items` are trigger-maintained; never write
  them from app code.
- **Verifying the canvas surface:** `/canvas` is not a route, and on a MAPPED route the route
  surface wins — verify on `/artifacts` (no route→surface mapping). Since 2026-09-18 a reload
  there is fine: `?open=<id>` restores the pane. On any OTHER route, still reach it by
  the open tab (the canvas remembers it across a reload).
- **A public shared canvas owns the viewport.** Both `/canvas/shared/[token]` and the canonical
  `/s/[token]` lens suppress the generic public header/footer through
  `data-public-immersive-surface`, render the same identity/action header, and keep
  renderer-specific choices in floating controls — never stack route, artifact, and workbench
  bars above the content. These immersive viewers also mark the global side canvas unavailable,
  so nested renderers never advertise a second Canvas action that cannot have a persisted source.

**Keep-docs-live:** a change to the wire format, the identity keys, the type registry, or the write
path updates the node's `STATE.md` in the same session.

## Change log


- `2026-10-03` — claude: **A version chain is one person's.** `canvas_items.parent_canvas_id` had no owner check, so anyone could insert their own row into another person's chain. Every chain read keeps only the chain root owner's rows: `services/versionChainOwner.ts` (`chainOwnerRowsOnly`) inside `canvasArtifactService.readVersionHistory` — the one door for the history UI, unbind, the mermaid workbench, write handlers and context sync. DB guard prepared and proven on the clone only: `migrations/canvas_version_chain_same_owner.sql` (composite FK `(user_id, parent_canvas_id) → (user_id, id)` + owner-filtered `cx_canvas_get_version_history` / `cx_canvas_get_conversation_latest`). Test: `services/__tests__/canvasArtifactService.test.ts`.
- `2026-10-03` — claude: **The agent edits ANY open item, named by its reference.** With a non-item tab focused (Agent context, Surface values) `canvas_item_content` read "No item is open" and refused every edit — the handler read only the focused pane's active tab. `host/canvasWriteHandlers.ts` `openItem(canvas, address)` now finds the open tab showing the addressed record (`SurfaceWriteContext.item`); with no address it uses the focused item, else the only open record, and refuses several-and-none-named with every reference. The manifest teaches `item`. Test: `__tests__/canvas-items-are-references.test.ts` (4 red on the old handler).
- `2026-10-03` — claude: **An open item is a reference the agent reads and edits.** Owner report: with a published HTML page open the agent said it had "no read path … no write/edit target" — the canvas sent the tab's session id and title as the item. `lib/canvas-item-reference.ts` resolves the record an item SHOWS (an `iframe` on `/p/<id>` → `html_page`, from `metadata.htmlPageId` — now stored by all four `openCanvas({type:"iframe"})` sites — or parsed from the URL; a saved artifact → `canvas_item`); `lib/canvas-scope.ts` sends `current_canvas_item` / `secondary_canvas_item` / `open_items[].item` as labeled `resource_ref`s and no tab ids. `host/canvasWriteHandlers.ts` serves the manifest's `canvas_item_content` target (`ShellCanvasColumn` `getWriteHandlers`): reads the live record (`readCurrent`), saves through `HTMLPageService.updatePage` / `canvasArtifactService.saveUserVersion`, then reloads the iframe or points the tab at the new version. `core/canvasSource.ts`: an iframe showing a published page offers `Source` (`canvasContentHasSource`, `htmlPageIdOf`); `CanvasSourceView` reads the page. Server half: aidream `conversation_context/canvas_sources.py`. Test: `__tests__/canvas-items-are-references.test.ts`.
- `2026-10-03` — claude: **The canvas shrinks first, against the page.** `CanvasHostProvider` passes `regionWidth` = window minus the page's left edge (`.shell-main`: rail + docked chat), and @ai-matrx/canvas 0.7.3 keeps 600px for the page (was 420 of the whole window: a 900px canvas left the page 56px at 1440 with chat open).
- `2026-10-03` — claude: **Every record-scoped tab names its subject.** Two chats' Documents tabs both read "This chat's documents", and a document's and a chat's history tabs both read "Document history". Now: "Documents · <chat>" (the launcher entry and the tab body), "Document history · <document, else chat>", "Agent context · <chat>", "Edit history · <agent>", "Knowledge assets · <document>", "Resources · <room>", and the data-tables "Document history · <name>" / "Workbook history · <name>". `useToolToggle` gains `followTitle` so the editor that owns a History button keeps the open tab in step with a rename; `useCanvasTabTitle` writes nothing for an empty title, so a tab whose subject is not loaded keeps its last name instead of dropping to the bare word. The tab's `title` attribute is the full name (tooltip). Guard: `features/documents/__tests__/history-tabs-name-their-subject.test.tsx` (red on the static titles).
- `2026-10-03` — claude: **A block in a canvas pane leaves Expand to the pane.** Chart, timeline (any `BlockHeaderWrapper` block) and slides bodies drew their own full-screen button, and the timeline and slides also an "Open Canvas" button, beside the pane's own Expand. Each now hides them when `useCanvasPresentation()` is non-null (an open full screen keeps its exit button); outside the canvas nothing changes. Guard: `components/mardown-display/blocks/__tests__/canvas-adaptive-render.test.tsx` § expand (red on the old ChartBlock); `canvas-narrow-layouts.test.tsx` runs again (its canvas mock now spreads the real module — it failed to load on `defineCanvasKind`).
- `2026-10-03` — claude: **A pie chart reads in a narrow pane and in dark mode.** Mermaid's `dark` theme derived slice colours from its primary colour (near-black on a dark pane) and `default` gave pale yellows; the right-hand legend fell off a 360px pane or a phone because the drawing is wider than the frame at the readable-zoom floor. `components/mermaid/runtime.ts` now gives pie slices the validated categorical chart palette (light and dark steps, surface-coloured 2px slice gaps) for the two auto themes only, and `MermaidRenderer` measures its frame and asks for `pieLegend: "bottom"` under 520px (part of `renderOptionsKey`, so it is never a stale cache hit). Verified live: 375px phone, legend under the pie inside the frame; desktop, legend right; dark and light palettes applied. Guard: `components/mermaid/runtime.test.ts` (red without the runtime change).
- `2026-10-03` — **A history tab names its subject.** The note-history and working-document-history kinds were both titled "Version history", so two open tabs read the same. Titles are now "Note history · <note title>" and "Document history · <document title>" (the bare word while untitled), set at open and kept in step by the tab body through `useCanvasTabTitle` + `subjectTitle` (`host/toolCanvas.ts`) — a rename or a tab restored from before follows the live name. Guard: `features/notes/__tests__/note-history-opens-in-the-canvas.test.tsx` (rename case red without the body hook).
- `2026-10-03` — claude: **A message's "Open in canvas" is a toggle.** The artifact block's opener (`ArtifactBlock`) had no pressed state and a second press re-opened nothing; it now reads the tab it opens as through `useArtifactContentToggle` (`host/useArtifactCanvas.ts` — the same kind + key `artifactOpenInput` gives that content), shows `aria-pressed` while the tab is in front and closes it on the next press (`toggleKind`). Verified live: press → "Tree 1" tab in front, pressed; press again → tab closed, unpressed.
- `2026-10-03` — **"This chat's documents" is a contextual launcher entry, not a global kind.** `ChatConversationSurface` (every mounted chat: `/chat/*`, the board's chat item) calls `useCanvasLauncherEntry({ kind: conversation-documents, key: conversationId })`, so the entry shows first in the empty-pane / "+" launcher only while a chat is on screen and opens that chat's ONE Documents tab; `DocumentsCanvasView` turns the conversation's working document on when it mounts (a brand-new chat reserves it). Deleted: `host/conversation/chatDocumentsKind.tsx`, `ChatDocumentsCanvasView.tsx` and the off-route "Open a chat to see its documents" message. Guard: `__tests__/one-tab-per-document.test.tsx` (red without the hook call).
- `2026-10-02` — **Saved items is virtualized and reads summaries; the reload safety net runs off the critical path.** Measured on the clone (admin@admin.com, 741 items): the list read `select *` (2.88 MB, every artifact body, to read `type`), mounted every card (34,107 DOM nodes, one 640 ms long task to open, ~110 ms re-render per keystroke of a rename/search), and 0.5's stable bodies keep a shown tab resident. Now `canvasItemsService.list` returns `CanvasItemSummary` (no `content`; 376 KB) through `readAllRows` (total order `last_accessed_at, id`), `SavedCanvasItemsGrid` virtualizes rows with `@tanstack/react-virtual` (columns from the pane's content width, `savedGridColumns`: 1 / 2 at 28rem / 3 at 54rem) so ~8–21 cards and menus mount whatever the count, and a search keystroke's older read can no longer overwrite a newer one. `reconcileSourceBlocks` never scans in the load thunk's task and yields every `RECONCILE_SLICE_MS` (8 ms): 835 messages went from 30–56 ms in the caller's task to 0 ms, longest block ≤ 13 ms (Node, real clone conversations). Guards: `core/__tests__/SavedCanvasItems.bounded.test.tsx` (700 cards on the old grid), `materialization/__tests__/reconcileOffCriticalPath.test.ts` (both red on the old scan). `platform.shown_to_context` (the list-scope read in front of the organization list) took 1.47 s on the clone, so `useCanvasItems.load` now also reads the person's own items (`list(filters, "mine")`, no context call) and paints them first; the full list replaces them when it lands (`isCompleting` shows a one-line pending state). Guard: `hooks/__tests__/useCanvasItems.firstPaint.test.tsx`. Cause of the 1.47 s: the RPC loops every organization membership (~50) calling `shown_to_default` and `iam.teammate_user_ids` per org; database left as is.
- `2026-10-02` — **The reload safety net uses the commit's own detector.** `reconcileArtifacts.ts` decided which records to reconcile with a marker-string list (fences, tags, JSON keys), so a block the content-ir splitter detects WITHOUT a marker — a bare `├──` tree, a bare GFM table — never reached `canvas_items` when the tab closed before the end-of-stream commit (conversation a0355e5d). `holdsMaterializableContent` now asks `planMaterialization` (new block OR an `<artifact id>` to verify); the marker list is deleted. Census: it was the only marker pre-filter in front of materialization. Guard: `materialization/__tests__/reconcileMarkerlessBlocks.test.ts` (red on the old filter). Same day, outside this directory: `MermaidViewport` adopts the diagram fit rule (whole when ≥ `DIAGRAM_READABLE_ZOOM`, else width at that floor from the top-left), guard `components/mermaid/__tests__/viewport-fits-like-the-diagram.test.tsx`.
- `2026-10-02` — **A sent message's context receipt is a canvas tab.** The receipt pill on a sent user message (`MessageContextReceipt`, "8 sent · 1 off") toggles kind `message-context-receipt` (`host/conversation/messageContextReceiptKind.tsx`, ONE tab per message keyed by its id, `restore: false`), `aria-pressed` while in front; body = the package's `MessageContextReceiptView` (the receipt table; a value opens its delivered text in place). The cramped popover is gone. Judgment: the mandate impact hover card (`features/mandates/admin/impact-cells.tsx`, "what changed" for one row) and the impact Legend stay popovers — a quick answer with no full view; the full view is already the mandate's own panel. Guard: `features/canvas/__tests__/message-context-receipt-opens-in-the-canvas.test.tsx`.
- `2026-10-02` — **A working document's version history is a canvas tab.** The document header's History button (`WorkingDocumentViewControls`) toggles kind `working-document-history` (`host/conversation/workingDocumentHistoryKind.tsx`) through the chat canvas port's `useTab` — ONE tab per conversation, pressed (`aria-pressed`) while in front, `restore: true` (versions are rows). Body = the chat package's `WorkingDocumentVersionHistory`, now a plain body that reads the document through the shared `useWorkingDocument`; Restore commits through the normal path, returns to the editor and closes the tab. Deleted: its `MatrxDynamicPanelHost` / mobile `Drawer` wrapper, the panel's mount, and `historyOpen` / `setWorkingDocHistoryOpen` in the view store. Guard: `features/canvas/__tests__/working-document-history-opens-in-the-canvas.test.tsx`.
- `2026-10-02` — **Graph evidence, YouTube previews, a plan's payload and war-room resources open in the canvas.** A knowledge-graph entity's evidence (`KgGraphCanvas` → `CanvasPagePanel` key `kg-graph-entity`, titled by the entity; the in-body name/close and the `w-80` side column are gone) and a discovered video (`YouTubeVideoPreviewPanel`, key `youtube-video-preview`, Open full page in the pane header; the fixed `aria-modal` overlay is gone) are page panels. "See what the AI sees" toggles kind `content-plan-payload` (`features/marketing/content-plan/canvas/agentPayloadKind.ts`, keyed `<site>:<node|plan>`, restorable; body = `AgentPayloadView`, the Sheet removed; button `aria-pressed`). A thread's paperclip toggles and the room's "Room resources…" opens kind `war-room-resources` (`features/war-room/canvas/warRoomResourcesKind.ts`, `thread:<id>` / `room:<id>`); `ThreadResourcesSheet` / `RoomResourcesSheet` deleted. Guard: `features/canvas/__tests__/detail-sheets-open-in-the-canvas.test.tsx`.
- `2026-10-02` — **The context chip has a real pressed state.** `@ai-matrx/agents` 0.43.4 gives `ContextRulesChip` a `pressed` prop (`aria-pressed` + the package's own pressed face); `ConversationContextChip` passes `pressed={tab.isVisible}` instead of a colour-only `className`. Guards: the package's `context-react.test.tsx` ("pressed: the face is a toggle"), `the-context-chip-toggles-its-canvas-tab.test.tsx`.
- `2026-10-02` — **A sent message's context value opens in the canvas.** A context chip on a user message (`ContextPolicyChip`) and a row of the "N sent" list (`ContextPolicyItemsPopover`) toggle kind `context-value` (`host/conversation/contextValueKind.tsx`) through the chat canvas port's `useTab` — ONE tab per conversation, `selected` = key + hash of the frozen snapshot (`contextValueTab.ts`), pressed (`aria-pressed`) while that value is in front; pressing it again closes. Body = the chat package's `ContextPolicyDetail` (was `ContextPolicyDetailSheet`; its `MatrxDynamicPanelHost` is gone, the key · type line is a body row). Unhosted: the port's default refuses aloud. Guard: `features/canvas/__tests__/context-value-opens-in-the-canvas.test.tsx`.
- `2026-10-03` — **A record's Notes & comments is a canvas tab.** `comment-thread` (keyed `entity:id`, focus = root/reply id) replaces the fixed right dock of `RecordAnnotations`; the guard `__tests__/side-panels-are-canvas-tabs.test.tsx` now scans every component for a fixed full-height right panel (three pre-rule ones named, shrink-only).
- `2026-10-02` — **Study and Rulebook side panels are the page's canvas tab.** The AI Tutor (`AskTutorButton` / `AskTutorPanel`, key `education-tutor`, button `aria-pressed` and toggles), a mind map's node detail (`MindMapView`, key `mind-map-node`, titled by the node), the map's Sources (`MindMapDetail`, key `mind-map-sources:<id>`, confidence badge in the pane header, button `aria-pressed`), a Rulebook's Conductor (`masterwork-conductor:<id>`) and Interview (`masterwork-interview:<id>`, agent credit + Full page in the pane header) all render through `CanvasPagePanel` — their props are page state. Every `MatrxDynamicPanelHost` there is gone. Guard: `features/education/tutor/__tests__/study-side-panels-open-in-the-canvas.test.tsx`.
- `2026-10-02` — **A task's resources-of-one-kind list opens in the canvas.** `ContainerResourceSheet` (the task editor's associated-resources cards) is a `<CanvasPagePanel panelKey="container-resources:<column>:<id>">` — ONE tab per container that follows the kind picked; picking the same kind again brings it forward (`openRequest`). Body unchanged (search + `EntityRef` rows). The docked `MatrxDynamicPanelHost` is gone. Guard: `features/organizations/__tests__/container-resources-open-in-the-canvas.test.tsx`.
- `2026-10-02` — **Live processing progress is a canvas tab.** `ProcessingProgressSheet` (Knowledge hub, Sources) draws its jobs in the page's ONE `page-panel` tab (`CanvasPagePanel`, key `processing-progress`) — the jobs and stop/dismiss callbacks are the page's live state; Stop all / Clear finished sit in the pane header; closing the tab calls the page's `onOpenChange(false)`. Its `MatrxDynamicPanelHost` is gone. Guard: `features/rag/__tests__/processing-progress-opens-in-the-canvas.test.tsx`.
- `2026-10-02` — **A cloud image's details open the canonical file detail.** `/images/my-cloud`'s per-tile Info button opens `useOpenDetail("file")` — the Detail primitive's docked presentation is the `record-peek` canvas tab — instead of the read-only `CloudFileMetadataSheet` (deleted). It honours the person's detail-presentation setting. Guard: `components/image/cloud/CloudImagesTab.test.tsx`.
- `2026-10-02` — **A file's editor is a canvas tab.** A preview's Edit action (`FilePreview` → `openCloudFileEditor`) opens or focuses kind `cloud-file-editor` (`features/files/canvas/cloudFileEditorKind.ts`, keyed by the file id, `restore: true`), body = the existing `CloudFileInlineEditor` (save = a new version; flush on unmount, so closing the tab keeps typed text). The docked Sheet copy `CloudFileEditor` and its event host `CloudFileEditorHost` / `requestEdit` are deleted. Guard: `features/files/__tests__/the-file-editor-opens-in-the-canvas.test.tsx`.
- `2026-10-02` — **A wide diagram stays readable; mermaid re-fits with its pane.** In a portrait pane a diagram's width fit never drops below `DIAGRAM_READABLE_ZOOM` (0.72 — 14px node titles stay ≥10px; two live concept maps fitted at 0.2–0.3 in a 360px pane); wider than the pane at that zoom it starts at the root (top-left of the layout's first rank, `firstRankBounds`) and wheel/trackpad scroll pans both ways; a graph that fits whole at a readable zoom stays fitted whole (`canvas-adaptive.ts`). `MermaidViewport` re-fits on width OR height change when it fills its pane, unless the person zoomed or panned since the last fit (`shouldRefitOnResize`), and `fit()` sizes the new SVG at once — a flowchart redrawn TB→LR on Expand at an unchanged scale kept the browser's 300x150 box. The workbench view column is `min-w-0`, so a wide drawing scrolls inside the pane instead of widening it past its edge. Guards: `blocks/__tests__/canvas-adaptive.test.ts`, `components/mermaid/__tests__/viewport-refits-when-the-pane-resizes.test.tsx`.
- `2026-10-02` — **An AI model's full editor opens in the canvas.** The audit tables' and Provider Sync's "Open full model editor" (`ModelDetailSheet`, four pages) is a `<CanvasPagePanel panelKey="ai-model-detail">` — ONE tab that follows the row picked, titled by the model; the same row again brings it forward (`OpenDetailButton`). Body = the existing `AiModelDetailPanel` with `inCanvas` (its header X is absent; the pane header closes). The docked `MatrxDynamicPanelHost` is gone. Guard: `features/ai-models/audit/__tests__/model-detail-opens-in-the-canvas.test.tsx`.
- `2026-10-02` — **A note's version history is a canvas tab.** Every Versions control — the /notes header (both forms), `NoteRecordTools` (note workspace / Board tile), `NoteViewControls` (notes window, a context-item note) and the note chip's "Version history" menu item — opens kind `note-history` (`features/notes/canvas/noteHistoryKind.tsx`, registered in `featureCanvasKinds.ts`), ONE tab per note keyed by its id, through `useNoteHistoryTab(noteId)` (pressed while in front); body = the existing `NoteVersionHistoryPanel` (restore refetches the note; its own "Full view" link opens the diff page); the panel stacks its compare columns in a narrow pane. Deleted: `NoteVersionHistory` (docked panel / drawer), `NoteHistoryPane` (window secondary pane), the per-instance `historyOpen` flag with `setInstanceHistoryOpen` / `selectInstanceHistoryOpen`; the notes agent context reads `history_pane_open` from the canvas. Guard: `features/notes/__tests__/note-history-opens-in-the-canvas.test.tsx`.
- `2026-10-02` — **An attachment chip opens its item in the canvas.** Every chip host — a sent message's `MessageAttachmentStrip`, the composer's `SmartAgentResourceChips`, a conversation's `AttachedDocumentChips` — toggles kind `context-items` (`host/conversation/contextItemsKind.tsx`, `restore: false`; one tab per host, keyed `<conversationId>:<list hash>` / `composer:<id>` / `documents:<id>`) through the chat canvas port's `useTab`. Tab data = the host's items as JSON + `selected`; body = the package's `ContextItemViewer`, which pages ‹ 2/3 › in place and names the tab after the shown record. Chips are `aria-pressed` while their item is in front; pressing again closes. The port's `ChatCanvasTabOpen.data` now takes JSON values and `replaceData`. The docked `ContextItemDrawer` + `useContextItemDrawer` are deleted. Guard: `features/canvas/__tests__/context-items-open-in-the-canvas.test.tsx`.
- `2026-10-02` — **An agent's edit history is a canvas tab.** The builder's message editors' "View history" (`SystemMessage`, `MessageItem` context menus) opens kind `agent-edit-history` (`host/agent/agentEditHistoryKind.tsx`, registered in `featureCanvasKinds.ts`), ONE tab per agent keyed by its id, `restore: false` (the undo stack is in memory); a repeat focuses it. Body = the chat package's `AgentEditHistory` (was `UndoHistoryOverlay`; its `MatrxDynamicPanelHost` wrapper is gone, so the package drops one `@host` import). The `undoHistory` overlay is removed everywhere: catalogue entry, OverlayController lazy import + selectors + render block, opener `features/overlays/openers/undoHistory.tsx`, window-registry entry, and the admin Tools-grid tile (it opened with no agent). Guard: `features/canvas/__tests__/edit-history-opens-in-the-canvas.test.tsx`.
- `2026-10-02` — **An agent app's HTML preview is a canvas tab.** The options menu's "HTML preview" (and its WordPress / filtered variants) in both agent-app shells (`AgentAppFullyCustomShell`, `AgentAppPublicRendererImpl`) opens the html as a canvas `html` tab through `useOpenAppHtmlPreview` (`features/agent-apps/hooks/useOpenAppResponseInCanvas.ts`) — full-bleed via `HtmlArtifact` `fill`, keyed by content so a repeat focuses it. Their full-screen `HtmlPreviewModal` mounts are gone (the modal stays for the admin content-editor display). Guard: `features/agent-apps/hooks/useOpenAppResponseInCanvas.test.tsx`.
- `2026-10-02` — **PDF Studio's Knowledge Assets is the same canvas tab.** The studio header's "Knowledge assets" action toggles kind `knowledge-assets` for the active document; its docked `MatrxDynamicPanelHost` is gone — every opener of the builder now uses the canvas. Guard: `features/rag/__tests__/knowledge-assets-open-in-the-canvas.test.tsx` (now reads `PdfStudioShell.tsx` too).
- `2026-10-02` — **The system-context console's preview is a canvas tab.** "Preview agent context" (`/administration/system-context`) toggles kind `system-context-preview` (`features/admin/system-context/canvas/`, one tab), body = `SystemContextPreview` (was the modal `PreviewDialog`, renamed and stripped of its dialog chrome and prose). Guard: `features/admin/system-context/__tests__/preview-opens-in-the-canvas.test.tsx`.
- `2026-10-02` — **An agent's unsaved changes are a canvas tab.** The save status's eye (`AgentSaveStatus`) toggles kind `agent-unsaved-changes` (`host/agent/agentUnsavedChangesKind.tsx`, keyed by the agent id, `restore: false` — in-memory edits do not survive a reload; body = the package's `UnsavedChangesDiff`) through the chat canvas port's `useTab`; pressed while in front. The docked panel is gone. Guard: `features/canvas/__tests__/unsaved-changes-open-in-the-canvas.test.tsx`.
- `2026-10-02` — **Canvas renderers take the shape of their pane.** One rule module, `components/mardown-display/blocks/canvas-adaptive.ts`, reads `useCanvasPresentation()` (null outside the canvas → unchanged): a diagram in a portrait pane fits its WIDTH, starts at the top and wheel-scrolls down; a timeline runs left to right in a wide pane; a text tree wraps downward in portrait; decision-tree Yes/No sit side by side when wide (first two levels); a chart grows taller with the legend below and bars turn sideways in portrait; slides scale to fit a fixed 960x540 stage (`ScaledSlide`) with thumbnails below (portrait) or beside (wide); a JSON diff is unified when narrow, split when wide; a map carries its places list beside it or behind a toggle; a mermaid flowchart that declares NO direction draws TB/LR by pane (the stored source is never rewritten). A person's toggle and an author's explicit choice always win. Guards: `blocks/__tests__/canvas-adaptive.test.ts`, `canvas-adaptive-render.test.tsx`.
- `2026-10-02` — **A conversation's agent lists are a canvas tab.** The composer rail's Tasks pill and `TaskPanelChip` toggle kind `conversation-lists` (`host/conversation/conversationListsKind.tsx`, keyed by the conversation id; body = the package's `TaskPanel`, now a plain body that hydrates + follows realtime while mounted) through the chat canvas port's `useTab` (`useConversationListsTab`). The docked `MatrxDynamicPanelHost` is gone. Guard: `features/canvas/__tests__/agent-lists-open-in-the-canvas.test.tsx`.
- `2026-10-02` — **Knowledge Assets is a canvas tab.** Source Studio's and the library preview's "Knowledge Assets" action toggles kind `knowledge-assets` (`features/rag/canvas/knowledgeAssetsKind.ts`), keyed by the document id, body = the existing `KnowledgeAssetPanel`; `?assets` / `initialAssetsOpen` open it once the document is read. Both docked panels are gone. PDF Studio still docks it (its shell is mid-edit by the motion sweep) — next. Guard: `features/rag/__tests__/knowledge-assets-open-in-the-canvas.test.tsx`.
- `2026-10-02` — **Snapshot history is a canvas tab.** The document and workbook editors' History button toggles kind `document-history` / `workbook-history` (`lib/univer/historyKinds.ts`), keyed by the document / workbook id, body = the existing `DocumentHistoryViewer` / `WorkbookHistoryViewer`; pressed while in front. Their docked `MatrxDynamicPanelHost` panels are gone. Guard: `features/documents/__tests__/snapshot-history-opens-in-the-canvas.test.tsx`.
- `2026-10-02` — **The composer's context chip opens in the canvas.** The value chip at the right of the composer row (`ConversationContextChip`) and the rail's per-value pills toggle kind `conversation-context` (`host/conversation/conversationContextKind.tsx`), ONE tab per conversation keyed by its id, body = the chat package's `ContextRulesPanel` (now a plain body — its `MatrxDynamicPanelHost` wrapper is gone). The chip no longer opens its popover when a canvas is on screen; it shows pressed while the tab is in front; a value pill opens the tab ON that value (`selected` in the tab data; the body writes the person's selection back with `canvas.update`), the same pill closes it. The package reaches it through a new canvas-port member `useTab({kind,key})` → `{isAvailable,isVisible,selected,toggle}` (`chatCanvasPort.ts` `toggleChatCanvasTab`; unhosted default refuses aloud as verb "toggle tab"); availability follows `subscribePresentation`, and a screen with no canvas keeps the chip's popover. Guards: `features/canvas/__tests__/the-context-chip-opens-in-the-canvas.test.tsx`, `../aidream/apps/shared/chat/src/agents/components/inputs/smart-input/__tests__/the-context-chip-toggles-its-canvas-tab.test.tsx`, `chat-host-canvas-unhosted-refuses.test.tsx`.
- `2026-10-02` — **Nine artifact renderers fit a tall, narrow pane.** One answer for every block — `useCanvasFit()` (`components/mardown-display/blocks/canvas-fit.ts`) over `useCanvasPresentation()`: `outside` (no canvas — every layout unchanged) · `narrow` (<480px) · `tight` (<768px, not full screen) · `wide` (roomy or full screen). Narrow: table = the phone-stack card list applied by class (`CANVAS_STACK_CARDS` in `tables/table-viewer.ts`, since the viewport media query cannot see a pane), comparison = one item per card + a Sort select, stats = one column, recipe = stats two per row with ingredients above the steps, research = every md:/lg: split reads the pane (`@container`), structured info / tasks = compact wrapping toolbars, quiz = options one per row with tighter controls, flashcards = wrapping header, card spans the pane. Tight: table pins its first column, stats two across. Full screen is wide again. Neither flashcards nor quiz ever opens a full-screen viewer by itself. Guard: `components/mardown-display/blocks/__tests__/canvas-narrow-layouts.test.tsx` (each real block outside vs in a 360px pane).
- `2026-10-02` — **A diagram flows with its pane (first adopter of the 0.5.3 presentation signal).** `InteractiveDiagramBlock` reads `useCanvasPresentation()` + `preferredFlowDirection()`: in a portrait or narrow pane a directional (dagre) diagram lays out top to bottom, in a wide one left to right; the data's `layout.direction` keeps only its sense (BT/RL), and pedigree / org charts keep theirs. When the pane flips (split, unsplit, Expand/Restore) an arrangement that is still ours re-lays out and re-fits; any Arrange-map pick or Reset by the person wins from then on, and an authored map (`onDiagramChange`) is never re-flowed. Outside the canvas (`null` presentation) nothing changes. Mermaid is untouched: its direction is in the author's source (`flowchart TD`/`LR`), and a bare header is Mermaid's own TB default, not a choice we make. Rule: `components/mardown-display/blocks/diagram/presentation-direction.ts`; guard: its `__tests__/presentation-direction.test.ts`.
- `2026-10-02` — **@ai-matrx/canvas 0.5.0: the canvas never dismounts.** Every open tab's body renders once in the package's stable body layer and is placed over its pane — a tab switch hides it, a split / move / width drag / expand re-places it, putting the canvas away keeps it (a half-typed Quick Chat draft survives all of them). `keepAlive` is gone from every kind (a no-op now). Every pane header has "+" New tab; a lone tab keeps its close; a tab opened from the launcher has Back. Tabs are dense (12.5px, overlaid close). The column slides on the shell sidebar's motion (600ms `cubic-bezier(0.4, 0, 0.2, 1)`) and `host/canvas-host.css` moves `.shell-root`'s `right` (and the public/link layouts' `margin-right`) on the same `--mxc-motion-duration` / `--mxc-motion-ease`, off while the edge is dragged and under reduced motion; expanded, the docked inset stays and the app hides when the slide ends. Notifications open below via the kind's `preferredTarget: "split-down"` (`ToolToggleInput.target` and `opensInSplit` deleted); split-down is 70/30. Guard: the package's `stable-bodies.test.tsx`.
- `2026-10-02` — **Messages and Notifications are canvas kinds; the chat page's Canvas button is gone.** The header Messages button toggles kind `messages` (`features/messaging/canvas/`, list ↔ thread inside the tab; the side sheet, its island and `messagingUi` slice are deleted). The bell toggles kind `notifications` (`features/notifications/canvas/`), opening it `split-down` below the tab in front (since 0.5.0: the kind's `preferredTarget`). The launcher offers "This chat's documents" (see the 2026-10-03 line). The phone ⋮ sheet's Canvas row always shows (`data-phone-sheet-replaces` removed); its Messages/Notifications rows open the same kinds. Guards: `one-tab-per-document.test.tsx`, `features/notifications/__tests__/the-bell-opens-notifications-in-the-canvas.test.tsx`, `HeaderPhoneOverflow.test.tsx`.

- `2026-10-02` — Quick Access launchers are toolbar icons: `@ai-matrx/canvas` 0.3.0 `toggleKind` (via `toggleToolInCanvas` / `useToolToggle` / `useQuickToolToggle`) opens when absent, brings forward when behind, closes when in front (Quick Chat and Scribe put the canvas away instead); rows show `aria-pressed`. `useOpenQuickNotes/Data/Scribe/Scratchpad` removed; refusal still announced when no column is presented.
- `2026-10-02` — **@ai-matrx/canvas 0.2.0: one canvas chrome.** Panes are cards with the design-system panel header (a title for one tab, the tab strip for several, "…", Expand, Close); token values now come from the package's `tokens.css`, which follows this app's theme, so `host/canvas-host.css` keeps only placement and `--mxc-mobile-z`. Web keeps the web layout rules (640px default, centre min 420, 50/50 splits); pop-out stays unwired here (no entry, refused aloud). design-system 0.53.0 drops its copy of the chrome (nothing here imported it).
- `2026-10-02` — **`?attachDoc=` with no organization holds and asks.** The link the Documents tab opens for (`linkConversationDocumentThunk`, and the workspace's attach) resolves its organization through the chat org gate with `interactive: true`: the conversation's org, else the active one, else the person picks from their memberships; "not now" keeps the link for the session with no failure line. Guard: `../aidream/apps/shared/chat/src/agents/redux/execution-system/instance-working-document/__tests__/a-link-with-no-organization-is-held.test.ts`.
- `2026-10-02` — **The document toolbar fits the pane, not the screen.** `WorkingDocumentPanel`'s header and source row are size containers (`@container/wdhead`, `/wdsrc`): controls never shrink, the view-mode word drops below 20rem, the action toolkit folds into its one ⋯ below 30rem, the status word gives way to the name below 26rem (never "View only"). Verified in a 360px pane and on a 375px phone, both themes. Guard: `../aidream/apps/shared/chat/src/agents/components/working-document/__tests__/the-document-toolbar-fits-a-narrow-pane.test.tsx`.
- `2026-10-02` — **One tab per document.** A conversation's documents are ONE kind, `conversation-documents` keyed by the conversation id (body: `DocumentsWorkspace`); the scratchpad is ONE kind, `global-scratchpad` keyed `default` (body: `ScratchpadQuickPanel` on the active scratchpad, data `{ gateConversationId }` when a chat opened it). The artifact content types `working_document` / `scratchpad` (keyed `wd:<scope>:<kind>`) are deleted — they rendered the same bodies, so the header Canvas button and `?attachDoc=` gave two tabs of one thing. Kind ids + tab ids live in the chat package (`../aidream/apps/shared/chat/src/host/canvas-tabs.ts`); every package door (Canvas button, rail Doc/Scratch pills, `ArtifactResultBar`, `useWorkingDocument().openInCanvas`) opens through the windows port (`openWorkingDocumentPanel`, new `openScratchpadPanel`). Guard: `__tests__/one-tab-per-document.test.tsx`.
- `2026-10-02` — **Narrow panes take turns.** Quick Notes (`NotesView`) and a conversation's Documents (`DocumentsWorkspace`) measure their own width: below 520px the list and the document take turns at full width instead of squeezing the document to a sliver. The live door to the `conversation-documents` tab is the chat's `?attachDoc=<id>` deep link (a working document's in-app destination); the composer `ContextDocsMenu` that also called it is imported but rendered nowhere.

- `2026-10-02` — **A re-clicked row brings its tab forward.** `<CanvasPagePanel openRequest>` (design-system 0.52.0 `TableSidePanelProps.openRequest`) focuses the tab on every change, so clicking the row already shown while its tab is in the background works. Guard: `__tests__/side-panels-are-canvas-tabs.test.tsx` (real `MatrxDataTable`, red without it).

- `2026-10-02` — **One right-hand region.** The floating `SidePanelSurface` is deleted. Every data
  table's row detail and the admin relationships forms (new rule, new entity type, new shareable
  resource, link policy) are `page-panel` tabs (`host/pagePanel.tsx`); a person's acquisition
  journey is `user-journey`, a directive's item shape `directive-shape`, a topic under the `drawer`
  knob `topical-map-topic`, and the suggestion inbox (`kgSuggestionsDrawer` overlay, deleted)
  `kg-suggestions`. Guard: `__tests__/side-panels-are-canvas-tabs.test.tsx` (proven red per opener).

- `2026-10-02` — **The quick tools are canvas tabs.** Quick Chat, Quick Notes, Quick Tasks, the
  Scratchpad, Quick Data, Quick Scribe, a conversation's Documents, "what the agent receives" and a
  note's knowledge base each became one kind (`host/toolKinds.tsx`), opened through
  `openToolInCanvas` (`host/toolCanvas.ts`); their ten side-panel overlays are deleted. The chat
  package's `quickChat` / `contextPreviewPanel` window ids are canvas-hosted in `ChatHostAdapter`.
  Guard: `__tests__/quick-tools-open-as-canvas-tabs.test.tsx`.

- `2026-10-01` — **The canvas is the `@ai-matrx/canvas` column.** The overlay side sheet
  (`CanvasSideSheet*`, `CanvasSurface`, `CanvasPane`, `CanvasNavigation`, `CanvasHomeSheet`,
  `ResizableCanvas`, `CanvasRenderer`, `CanvasHeader`, `canvasSwitcher`) and `redux/canvasSlice.ts`
  are deleted. The canvas is a full-height right column the header ends at, with split panes, tabs,
  full screen, memory and identity keys; every content type is a kind (`host/artifactKinds.tsx`),
  saved items are a launcher kind, live editor callbacks ride by id. Guards: `one-canvas-column.test.ts`,
  `aidream/apps/shared/canvas/src/__tests__/core.test.ts`.

- `2026-09-29` — **Surface-owned conversations survive a reload.** The module-level `materialization/surfaceOwnedConversations.ts` Set (lost on every reload, never consulted by the on-load reconcile) is deleted; ownership is the launch option `surfaceOwnsOutput`, carried on the conversation record in the execution-system Redux state, persisted in the row's metadata, restored by `loadConversation`, and read by `materializeMessageArtifacts` (now given `getState`) via `selectConversationSurfaceOwnsOutput`. Tests: `education/convert/__tests__/segment-runs-never-materialize.test.ts` (red on a scratch copy of the old claim path), `materialization/__tests__/materializeMessageArtifacts.test.ts`.
- `2026-09-28` — **Submitting a score and recording a view work again.** `hooks/canvas/useCanvasScore.ts` and `hooks/canvas/useSharedCanvas.ts` wrote `canvas.canvas_scores` / `canvas.canvas_views` directly, closed by the same 2026-09-21 sweep; they now call the new `canvas.submit_canvas_score` / `canvas.record_canvas_view` doors (migration `canvas_score_and_view_doors.sql`). Rank and high score now come from the door (the browser could only count its own scores).
- `2026-09-28` — **Liking a canvas works again.** `hooks/canvas/useCanvasLike.ts` wrote `canvas.canvas_likes` directly, which the 2026-09-21 security sweep had closed (its census missed `hooks/`); it now calls the new `canvas.set_canvas_like` door (migration `canvas_set_canvas_like_door.sql`).
- `2026-09-27` — **Chat beside a canvas** landed as `workspace/` (`ChatCanvasWorkspace`): the ONE layout where a canvas takes the page and the chat docks at 440px or floats — read [`workspace/FEATURE.md`](./workspace/FEATURE.md). The global side sheet stands down (⌘\\) on canvas-chrome pages.
- `2026-09-25` — **Canvas controls stay clickable when the sheet opens.**
  The profile menu lives in the bottom-left `ShellUserBlock`; the retired
  top-right elevated menu overlapped the canvas Put Away button. The canvas
  and floating panels no longer claim it, and both shells no longer mount it.
  `canvas-user-menu-above-sheet.spec.ts` guards the former claim and mount paths.

- `2026-09-19` — **The avatar menu stays clickable while the canvas is open.**
  Superseded by the 2026-09-25 removal above: the profile menu now lives in
  the bottom-left shell block. The elevated menu described below no longer exists.
  The canvas sheet is z-10000 over the top-right corner. The pane-header
  dropdown opened (visible) but hung into the pane body and lost hit-testing,
  and every menu item hardcoded `htmlFor="shell-user-menu"` so a click toggled
  the hidden header checkbox instead of the canvas copy. The class is the one
  `MatrxDynamicPanel` already solved: while the canvas is open it claims the
  glass-layer `ElevatedShellUserMenuRoot`, stacked at z-10001 (above the
  sheet), and menu items close whichever checkbox the open menu owns
  (`menuCheckboxId` context). Guards:
  `features/shell/layout-gate/canvas-user-menu-above-sheet.spec.ts`
  (`MATRX_LAYOUT_GATE_MUTATION=under-canvas` forces z-110 and
  `elementFromPoint` hits the sheet) and
  `header-right-menu/menuCheckboxId.test.ts` (a hardcoded
  `htmlFor="shell-user-menu"` on an item file goes RED).

- `2026-09-18` — **`/artifacts` NO LONGER DROPS ITS OPEN CANVAS ITEM ON RELOAD —
  the open artifact is part of the page's address.** The recorded open item:
  the canvas slice is deliberately not persisted, chat re-derives its artifacts
  from persisted tool-call rows, and `/artifacts` had no source at all — so a
  reload lost what the person was reading, Back did nothing, and the page could
  not be linked. **Decision (loop owner, 2026-09-18):** the open artifact is
  part of the address, not session state. **Champion: Claude.ai's artifacts
  gallery**, where the selected artifact lives in the URL and reload,
  Back/Forward and a shared link all restore it.
  Built as a platform primitive, not an `/artifacts` feature:
  `hooks/useCanvasArtifactUrlState.ts` mirrors the open artifact into
  `?open=<canvas_items.id>` and back, through the repo's canonical
  `@ai-matrx/kit/url-state` primitive (`useUrlSearchParams` + `commitUrlParams`) — the same
  primitive `EnumsContainer` uses for `?selected` and the data-integrity panel
  for its selected row. No new persistence layer, no `localStorage`. Opening,
  switching and closing each PUSH one history entry; adopting an artifact that
  was already open when the route is entered client-side REPLACES, because
  nobody pressed anything. `CmsArtifactList` mounts the hook; the restore uses
  the same `useOpenCanvasItem` opener a click uses.
  Two things the shape forced, both guarded: the restore WAITS for
  `selectCanvasIsAvailable` (the front door is idle-deferred through
  `features/shell/islands/DeferredIslands.tsx`, so an immediate restore is
  refused with a false "canvas is not available here"), and the two directions
  are reconciled BY VALUE against one agreed-on id — the tempting "ignore any
  URL we wrote ourselves" bookkeeping swallows Forward to an artifact that was
  open before, moving the address while the canvas stays behind.
  Guard: `features/canvas/__tests__/canvas-artifact-url-state.test.tsx`
  (7 tests; SIX mutations proven RED — no URL→canvas restore, no
  canvas→URL write, a close that ignores `isOpen`, the write-bookkeeping loop
  breaker, no availability wait, and the availability wait guarding only the
  first pass).
  **The defect the live check caught, same day, on the first release
  (`743cc0a73d`):** the availability wait guarded only the FIRST reconcile, and
  committed the agreed id BEFORE calling the opener. On production the reload
  landed on the list with the toast *"The canvas isn't available on this
  screen"* — a HYDRATING page renders `useSyncExternalStore`'s SERVER query
  snapshot (empty) for its first commit, so the real address arrives one pass
  later, which that wait did not cover, and committing the id burned the
  request so nothing asked again. All five jsdom guards had passed, because
  jsdom mounts with the query string already readable. The wait now guards
  EVERY pass and leaves `agreedRef` alone until the open is actually attempted;
  the seventh case reproduces the hydration shape and is red against the
  shipped code.

- `2026-09-18` — **THE HEADER'S CANVAS SLOT IS RESERVED BY AVAILABILITY, NOT BY
  ITEM COUNT.** The 2026-09-17 fix held the slot only between OPEN and CLOSED;
  `CanvasShellHeaderToggle` still returned `null` while `itemCount === 0`, so
  the FIRST canvas item both created the 44px box and pushed every button left
  of it sideways — and folding the canvas away never gave the space back. An
  independent live review of review row 34bfd1e8 re-found it on production and
  measured it on one chat, one click (Records 1043.39 → 999.39, Canvas 1132 →
  1088, Conversation actions 1164 → 1120, Agents for this page 1192 → 1148;
  same on the documents page). Now: `isAvailable` alone decides whether the
  slot exists; `itemCount`/`isOpen` decide only what is inside it — an inert,
  aria-hidden, buttonless `CanvasHeaderSlotSpacer` sized with the same
  `var(--matrx-tap-target-size, 2.75rem)` the tap target itself uses, or the
  real control. Guards: `__tests__/canvas-header-slot-reserved.test.tsx`
  (rendered DOM; mutation = restore `!isAvailable || itemCount === 0` → RED)
  and a fourth case + `MATRX_LAYOUT_GATE_MUTATION=first-item` in
  `features/shell/layout-gate/canvas-one-presentation.spec.ts` (real layout).

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
  AND THE SHIFT ITSELF, found by the live check the same day: with the parallel
  layer gone, `CanvasShellHeaderToggle` still UNMOUNTED while the canvas was
  open, so every shell-header button to its left moved 44px sideways on every
  open and close — measured on production-equivalent build at 1280x720,
  Records at `x = 887.59` closed against `x = 931.59` open, on the chat route
  AND on `/artifacts`. The canvas pane's header owns the Put Away control while
  the shell header keeps its fixed Canvas button slot in every state. The
  profile menu lives bottom-left and needs no top-right stand-in. Re-measured
  after: every one of the nine header button rects and
  the header box itself are byte-identical open vs closed, on both routes, and
  the canvas surface is `sheet` at `[512, 0, 768, 720]` on both.
  Guard: the layout gate's case 2, with `MATRX_LAYOUT_GATE_MUTATION=unmount-slot`
  proven RED on both routes and both viewports.

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
  `DocumentEditor` (`features/documents/components/DocumentCanvasBody.tsx`),
  NON_PERSISTABLE because the editor owns its own snapshot history, but the
  first non-persistable type that still offers `Source`: a document's markdown
  IS what a person means by source, read back from its Univer snapshot by the
  one reader `features/documents/univer-doc-to-markdown.ts`.
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
  Evidence: for-Arman hand-over 2026-09-15 · document-canvas-door/ (deleted in d0e885c98).

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
  conversation's box, rendered by `../aidream/apps/shared/chat/src/agents/components/chat/sandbox-insight/SandboxCanvasBody`, opened through `useOpenSandboxCanvas`.
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
