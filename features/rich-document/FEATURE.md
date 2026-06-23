# FEATURE.md — `rich-document`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-05-20`

> **Skill**: [`.claude/skills/rich-document-actions/SKILL.md`](../../.claude/skills/rich-document-actions/SKILL.md) — the how-to for using RichDocument on a page, adding an action, adding a content source, and wiring a remote surface. Read the skill for tasks; read this FEATURE.md for deep reference.

---

## Purpose

`RichDocument` is the canonical wrapper that pairs the content engine (which renders markdown plus interactive flashcards, diagrams, live data feeds, AI-integrated task lists, code blocks, tool-call traces, classification analyzers, plan viewers, and more) with a configurable, pluggable action surface (copy, save to notes / task / scratch, export to HTML, email, print, fork, delete, edit, TTS, fullscreen, debug, custom overlays). It exists so every consumer of the engine — chat, Notes, prompts, artifacts, scraper results, socket presets, flashcards — surfaces the same depth of interaction with one component swap.

**Read this file before changing anything in `features/rich-document/`.** Future agents misread the engine's name ("MarkdownStream", "BasicMarkdownContent") and assume it's a thin react-markdown wrapper. It is not. It is a multi-thousand-line content runtime that renders fully interactive AI-driven primitives. This wrapper exists precisely to surface that capability uniformly.

---

## Entry points

**Components**
- `features/rich-document/RichDocument.tsx` — the wrapper. Use everywhere markdown content needs rich interactions. Marked `"use client"` because the underlying engine is `dynamic({ ssr: false })`.
- `features/rich-document/RichDocumentActionSurface.tsx` — the remote-surface consumer. Renders the action set registered by a `RichDocument` with `actionsVariant="remote"`. Place this anywhere in the tree — header, sidebar, modal footer — and connect by `surfaceId`.
- `features/rich-document/RichDocumentActionProvider.tsx` — **headless** sibling of `RichDocument`: registers the full action toolkit for a `surfaceId` WITHOUT rendering the content engine. Renders `null`; feed it `content` + `source`, render the toolbar via a `RichDocumentActionSurface`. For surfaces that draw their OWN content (the working document, custom editors) and want the toolbar available in **every** view mode — not just the one mode that happens to mount a `RichDocument`.

**Hooks**
- `features/rich-document/runtime/useActionSurfaceProvider.ts` — the shared registration brain: builds the live action context, resolves the action list, and runs the provider/bridge registration effects. Consumed by **both** `RichDocument` and the headless `RichDocumentActionProvider`, so there is one implementation, not two that drift.

**Services**
- `features/rich-document/actions/sources/*.ts` — per-source adapters. Today: `instanceKeyPrefix` only. Phase 1 wires `edit`, `delete`, `reRun`.

**Redux slice(s)**
- `features/rich-document/redux/actionSurfacesSlice.ts` — `richDocumentActionSurfaces` slice. Shape: `{ bySurfaceId: Record<string, RichDocumentSurfaceRegistration[]> }`. **No functions, no React elements, no live content** — all of those are held by the registering component in refs and looked up by id at render/invocation time. The slice is a pure router.

**Action registry**
- `features/rich-document/actions/registry.ts` — module-scope `Map<string, RichDocumentAction>`. Populated by handler modules at import time (Phase 1).

---

## Data model

This feature owns no database tables. It composes content originating elsewhere (`messages`, `notes`, `prompt_executions`, `artifacts`, `scraper_runs`).

**Key types** (`features/rich-document/types.ts`)
- `ContentSource` — discriminated union over `chat-message | note | prompt-result | artifact | scraper-result | working-document | raw`. The discriminator drives which adapter handles edit/delete, which actions are visible, and how overlay `instanceId`s are derived. `working-document` carries `{ conversationId, kind, documentId? }` — the per-conversation collaborative doc/scratchpad; its adapter persists edits through `persistWorkingDocumentContentThunk`, and `documentId` (the `cx_working_documents` backing) lets save-to-task link a parent.
- `RichDocumentAction` — `{ id, label, icon, category, supportedSources, visible?, disabled?, run, renderSlot?, order?, requiresAuth? }`. Handler-side type.
- `RichDocumentActionContext` — runtime context passed to every `run` / `visible` / `disabled`. Carries live `content`, `source`, `dispatch`, auth flags, callbacks, `instanceKey(prefix)`, and a discriminated `extensions` field for source-specific baggage (the chat-message variant holds `streamRequestId`, `contentHistoryCount`, `groupMessageIds`, etc.).
- `RichDocumentActionSpec` — the pure-metadata snapshot stored in Redux for remote surfaces. **Contains no functions.** `iconName` is a string; the renderer maps it back to a `LucideIcon`.
- `RichDocumentSurfaceRegistration` — `{ providerId, computedActionSpecs, sourceType }`. One entry per active RichDocument bound to a remote surface. Registration order is encoded by the provider stack's array order.

---

## Key flows

### 1. Inline action bar on a chat assistant message

**Trigger** — `AgentAssistantMessage.tsx` mounts a `<RichDocument actionsVariant="bar" source={{type:"chat-message", messageId, conversationId}}/>` under an assistant turn after `isStreamActive` flips false.

**Path** *(target architecture; current chat surface still uses `AssistantActionBar` pending Phase 4)*
1. `RichDocument` resolves the action registry → list of `RichDocumentAction` for source type `chat-message`.
2. Variant renderer (`variants/ActionBar.tsx`, Phase 2) splits primary (inline buttons: thumbs, copy, speaker, edit, ⋯) vs overflow (full menu).
3. User clicks an action → variant looks up the handler by id from `registry.ts`, calls `run(buildContext(...))`.
4. Handler dispatches the appropriate thunk / opens the appropriate overlay / calls the appropriate service.

**State changes / side effects** — usually a Redux dispatch (overlay open, message edit, fork, delete) or an API call (NotesAPI, CodeFilesAPI, taskAssociations). No new state owned by this feature.

**Exit condition** — handler completes, overlay closes, toast fires.

### 2. Remote action surface — Notes detail header

**Trigger** — `app/(authenticated)/notes/[id]/page.tsx` renders a header containing `<RichDocumentActionSurface surfaceId="notes-detail-toolbar" variant="bar"/>` and a body containing `<RichDocument source={{type:"note", noteId}} actionsVariant="remote" actionsSurfaceId="notes-detail-toolbar"/>`.

**Path**
1. The body's `RichDocument` mounts. Generates a per-instance `providerId` via `useId()`. Effect dispatches `registerProvider(surfaceId, registration)` — push onto the stack.
2. The header's `RichDocumentActionSurface` selects `selectTopProvider("notes-detail-toolbar")` → reads `computedActionSpecs`.
3. The surface renders the spec-list using the same variant renderer the inline `"bar"` variant would use. Click handlers look up the handler by id from the module-scope registry, then build a live context via the body's still-mounted refs (Phase 2 wires this).
4. Navigation from note A to note B: new RichDocument mounts FIRST → push(B), stack = `[A, B]`, top = B (correct render). Old RichDocument unmounts SECOND → splice(A), stack = `[B]`, top still = B. No empty state, no stale binding.

**State changes / side effects** — only the slice's `bySurfaceId[surfaceId]` map. Handlers themselves are the same as inline; the surface is purely a render target.

**Exit condition** — unmount of the body's RichDocument splices out its provider.

### 3. Custom action via `extra` — open a feature-specific overlay

**Trigger** — Notes consumer wants a "Open in floating window" action only on Notes.

**Path**
1. Consumer passes `actions={{ extra: [{id: "open-in-window", label, icon, category: "app", supportedSources: ["note"], run: ({dispatch, source, instanceKey}) => dispatch(openOverlay({overlayId: "noteWindow", instanceId: instanceKey("note-window"), data: {noteId: (source as Extract<ContentSource,{type:"note"}>).noteId}}))}]}}`.
2. `resolveActions` includes it in the visible set alongside the built-ins.
3. Click → `run` dispatches `openOverlay` with the standard shape.

**Constraint** — `overlayId` must already exist in `features/overlays/overlay-ids.ts` + the controller + the catalogue. To add a new overlay, follow `features/overlays/FEATURE.md` — the 3-file process.

---

## Invariants & gotchas

These are load-bearing. Violating any of them produces silent bugs that survive PR review.

1. **No functions in `richDocumentActionSurfaces` slice state.** Handlers, callbacks, and live content are held by the registering component in refs and looked up by id at invocation time. Storing closures in Redux breaks DevTools time-travel, breaks SSR equality checks, and (per `features/overlays/FEATURE.md`) explicitly violates the overlay-system pattern that this feature mirrors.
2. **Provider registration uses a stack, not last-wins.** Out-of-order mount/unmount during navigation (new component mounts before old unmounts) would otherwise leave the surface empty when the older component splices the registration. Stack + splice-by-providerId is idempotent under StrictMode double-mount and correct under unmount-after-newer-mount.
3. **Live content is read via refs, never frozen at registration time.** Handlers running after the user edited the note must operate on the new content. The pattern: `contentRef.current = content` inside `useLayoutEffect` on every render; handlers read `contentRef.current` at call time.
4. **Source-specific edit/delete/re-run go through the source adapter.** Handlers never call `editMessage` (chat thunk) or `NotesAPI.update` (note service) directly — they call `ctx.sourceAdapter.edit({newContent, source, dispatch})`. This is how the same generic action ("edit") works across every source type.
5. **`extra` actions must target already-registered `overlayId`s.** No magic. The wrapper does not register overlays — that lives in `features/overlays/`.
6. **`"use client"` is mandatory.** The engine is `dynamic({ ssr: false })`. Marking RichDocument client-only is what makes the dynamic import legal in App Router pages. Server components must render a client child that mounts RichDocument.
7. **React Compiler is on.** No manual `useMemo` / `useCallback` / `React.memo`. The compiler memoizes based on input deps. Refs are deliberately not memoized — they're mutable by design.
8. **`renderer` is explicit.** No `"auto"`. The two renderers (basic, configurable) have subtly different preprocessing (backtick-escaped angle brackets, code-fence parsing). Silent engine swaps diverge rendering. Default is `"basic"`; consumers opt into the others.
9. **Raw-source `instanceKey` includes a content hash.** Two raw RichDocuments on the same page (e.g. multiple PromptToasts) need distinct overlay `instanceId`s. The hash is FNV-1a, 8 hex chars — collision-tolerable, deterministic, fast.

---

## Related features

- **Depends on:** `components/mardown-display/` (the content engine), `lib/redux/slices/overlaySlice.ts` (overlay dispatch), `features/overlays/` (overlay registration), `components/icons/tap-buttons` (button primitives for inline variants), `features/tts/components/StreamingSpeakerButton` (TTS inline button), `features/notes/service/notesApi` (save-to-notes), `features/code-files/service/codeFilesApi` (save-to-code), `features/tasks/redux/taskAssociationsSlice` (save-to-task).
- **Depended on by:** *(post-migration)* `features/agents/components/messages-display/assistant/AgentAssistantMessage.tsx`, `features/notes/components/*Preview*`, `features/prompts/components/results-display/*`, `components/socket-io/presets/preset-manager/responses/admin-tabs/*`, `features/scraper/parts/recipes/*`, and ~25 more consumer sites.
- **Cross-links:** `features/overlays/FEATURE.md` (overlay registration contract), `components/mardown-display/chat-markdown/REACT_RENDER_CONTRACT.md` (engine block protocol), `components/mardown-display/GUIDE.md` (engine event-mode vs legacy-mode).

---

## Doctrine compliance

> Required by [PRINCIPLES.md](../../PRINCIPLES.md). The artifact is disposable; the platform is the product.

**Primitives reused** — every type, component, slice, hook, and service this feature consumes from elsewhere.
- Types: `AppDispatch` (`lib/redux/store.ts`), `RootState` (`lib/redux/rootReducer.ts`), `ServerProcessedBlock` (`components/mardown-display/chat-markdown/EnhancedChatMarkdown`), `TypedStreamEvent` (`components/mardown-display/chat-markdown/types`).
- Components: `MarkdownStream` (`components/MarkdownStream`) — the content engine, dynamically imported.
- Redux slices / selectors: dispatches `openOverlay` / `closeOverlay` from `lib/redux/slices/overlaySlice`; subscribes to `state.userAuth.id` and `state.userAuth.isAdmin`. *(Phase 1+)* dispatches `editMessage`, `deleteMessage`, `forkConversation` from `features/agents/redux/execution-system/message-crud/*` via the chat-message source adapter; calls `NotesAPI.update` via the note adapter; etc.
- Hooks: `useAppDispatch` / `useAppSelector` (`lib/redux/hooks`), `useId` (React 19), `useRef` / `useLayoutEffect` / `useEffect` (React).

**Primitives introduced** — every new type, component, slice, or hook this feature added.
- `RichDocument` component (`features/rich-document/RichDocument.tsx`) — why a new component: nothing in the codebase pairs the content engine with a generalized action surface. Considered extending `MarkdownStream` directly; rejected because it's already a dynamic shell over a heavy implementation, adding action-surface concerns there would mix the rendering and interaction layers and break the 30+ existing usages that want bare rendering.
- `RichDocumentActionSurface` component (`features/rich-document/RichDocumentActionSurface.tsx`) — why a new component: no existing primitive renders a portaled action set from a remote location-by-id. The overlay system has a single mount and isn't designed for "render here, content lives there" inversion.
- `RichDocumentActionProvider` component + `useActionSurfaceProvider` hook (`features/rich-document/RichDocumentActionProvider.tsx`, `runtime/useActionSurfaceProvider.ts`) — why new: `RichDocument` coupled the toolkit to the content engine, so a surface that drew its own content (the working document, with five editor modes) could only get the toolbar in the one mode that mounted a `RichDocument`. Extracted the registration brain into the hook, reused it headless. Considered rendering a hidden `RichDocument` to register — rejected: it would double-render the heavy `MarkdownStream` engine off-screen.
- `richDocumentActionSurfaces` slice (`features/rich-document/redux/actionSurfacesSlice.ts`) — why a new slice: grep-confirmed no existing slice maps `surfaceId → stack of action providers`. Existing `features/surfaces/` is the `ui_surface` admin table (tool/agent manifest); `features/agents/redux/surfaces/surfaces.slice.ts` is request-surface-navigation (routes fork/delete to UI surface); `features/files/components/surfaces/` is file-handling taxonomy. None of these match purpose.
- `RichDocumentAction` + `RichDocumentActionContext` + `ContentSource` + `ContentSourceAdapter` types (`features/rich-document/types.ts`) — why new types: generalized from chat-only `MessageActionContext` (`features/agents/components/messages-display/message-options/messageActionRegistry.ts`). The original lives on; Phase 1 moves its handlers into the new registry tagged with `supportedSources: ["chat-message"]` and the old file becomes a thin re-export until Phase 8 deletes it.

---

## Current work / migration state

**Target:** every consumer of `BasicMarkdownContent` / `MarkdownStream` (~30–40 sites) swaps to `RichDocument`, gaining the full action toolkit configured per surface. The chat-only `AssistantActionBar` is deleted in favor of `<RichDocument actionsVariant="bar"/>`.

**Master plan:** `~/.claude/plans/if-you-review-the-snappy-stallman.md`.

**Phase map:**

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundations: feature dir, FEATURE.md, types, registry skeleton, surface slice (registered), empty RichDocument + RichDocumentActionSurface shells | ✅ Done |
| 1 | Move handlers from `messageActionRegistry.ts` into `features/rich-document/actions/handlers/*.ts`, tagged with `supportedSources`. Old file re-exports. | ✅ Done |
| 2 | Build inline variants (`ActionBar`, `MiniActionBar`, `OverflowMenu`, `HoverMenu`) + module-scope provider bridge so `RichDocumentActionSurface` can invoke handlers without functions in Redux. | ✅ Done |
| 3 | Wrapping-parity gate on PromptToast — vanilla content, no interactive blocks, isolates wrapper from registry. Exercises the remote-surface pattern end-to-end. | ✅ Done |
| 4 | Chat parity migration — replace `AssistantActionBar` | ⏸ Deferred — chat already has the action toolkit via `AssistantActionBar`; migration is consolidation only. Specced in detail in the master plan; revisit when consolidation is the priority. |
| 5 | Notes uplift — preview surfaces (desktop NoteEditor preview, NoteEditorCore preview, MobileNoteEditor preview). | ✅ Done (preview only; MatrxSplit-side + detail-header remote surface deferred — both require changes to the shared MatrxSplit primitive / Notes page chrome). |
| 6 | Tier-2 surfaces — PromptInlineOverlay, PromptExecutionTestModal (3 result panes), WebResearchOverlay (2 panes). | ✅ Done |
| 7 | Long tail — scoped down: block-level renderers (ArtifactBlock, MarkdownPreviewBlock, StructuredPlanViewer) intentionally stay on `BasicMarkdownContent` (they live INSIDE the engine; wrapping with RichDocument would recurse). Socket admin tabs deliberately keep `BasicMarkdownContent` because they're A/B-comparison renderer tools — adding the wrapper defeats the comparison. Flashcards / AI modals use `MarkdownRenderer` (a separate, lightweight primitive — not the heavy engine), out of scope. | ✅ Done (scope-clarified) |
| 8 | Cleanup — delete `messageActionRegistry.ts` shim, delete `AssistantActionBar.tsx`, audit remaining `BasicMarkdownContent` imports | ⏸ Blocked on Phase 4 |

---

## Change log

Newest first.

- `2026-06-23` — claude: **Working document gets the full toolkit.** New `working-document` `ContentSource` (`{ conversationId, kind, documentId? }`) + adapter (`actions/sources/working-document.ts`, edits via `persistWorkingDocumentContentThunk`) + `save-to-task` entity link (`cx_working_document` → `cx_conversation` parent). Extracted `RichDocument`'s provider/bridge registration into `runtime/useActionSurfaceProvider.ts`; added headless `RichDocumentActionProvider` (renders the toolkit with no engine). `NoteEditorCore` gained `actionsSource` (override the derived source) + `previewActionsVariant` (suppress the in-body bar when the host carries its own). The working-document panel/window/Smart-Input-tab now expose copy / read-aloud / save-to-notes-or-task / HTML page / email / print / edit — parity with an assistant response and a note — in every editor mode, plus the right-click menu.
- `2026-06-16` — claude: "Add to docs" stub is now the real **Save to Document** action (`actions/handlers/save.ts`, source-agnostic). It lazy-imports `pushMarkdownToDocument` (`features/data-tables/export-targets`) to convert the content to a Univer document and toasts an "Open" link. The same change landed on the chat menu (`messageActionRegistry.ts` `add-docs`). Markdown → `IDocumentData` conversion lives in `features/data-tables/markdown-to-univer-doc.ts`.
- `2026-05-19` — Claude/arman: Round 2 — (R2.1) multi-layer menu: central `menuStructure.ts` config + `buildMenuTree`; desktop `DropdownMenuTree` submenus + mobile `MobileActionDrawer` (accordion). (R2.2) MatrxSplit opt-in action props + Notes detail-header remote surface (active note → header bar via PageHeader portal; split-right keeps inline). (R2.3) orthogonal positioning model — `actionsVariant` (what) / `actionsPosition` (where: below/above/top-*/middle-*) / `actionsBehavior` (always/hover-only); removed `hover-menu` variant + `HoverMenu.tsx`, migrated consumers to `{icon-only, top-right, hover-only}`. (R2.4) lazy + streaming-safe right-click context menu (`ContextMenuMount` + dynamic `ContextMenu`); Notes preview is first consumer. Dropped unused `registeredAt` from the surface registration.
- `2026-05-19` — Claude/arman: Phases 3 / 5 / 6 — consumer migrations. PromptToast (parity gate, exercises remote-surface end-to-end). Notes preview (desktop NoteEditor, NoteEditorCore, mobile). PromptInlineOverlay, PromptExecutionTestModal (3 panes), WebResearchOverlay (2 panes). Phase 4 (chat migration) deferred — chat already has the actions via AssistantActionBar; consolidation can come later. Phase 7 scoped down — block-level renderers stay on BasicMarkdownContent (recursion risk), socket admin tabs stay on BasicMarkdownContent (A/B-comparison tools), flashcards use a separate `MarkdownRenderer` primitive that isn't the heavy engine.
- `2026-05-19` — Claude/arman: Phase 2 — inline variants (`ActionBar`, `MiniActionBar`, `MenuVariant`, `HoverMenu`) + `OverflowMenu` shared dropdown + `PrimaryButtons` shared inline row. Module-scope `providerBridge` registry lets `RichDocumentActionSurface` invoke handlers on the host's behalf without functions traversing Redux. `RichDocumentActionSurface` now renders real variants (was a dev-only diagnostic marker).
- `2026-05-19` — Claude/arman: Phase 1 — ported every chat action handler from `messageActionRegistry.ts` into source-aware modules under `actions/handlers/` (copy, save, export, print, edit, creator, feedback, fullscreen-editor, stubs, app, server-api). `save-to-task` generalized to any source via per-source entity_type map; `html-preview` and `edit` route through `sourceAdapter.edit` instead of closure-in-Redux. Chat/note source adapters wired with `edit`/`delete`.
- `2026-05-19` — Claude/arman: Phase 0 scaffolding — types, slice, registry skeleton, source-adapter stubs, empty RichDocument + RichDocumentActionSurface shells, slice registered in slimReducerMap.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature, update this file's status, add flows you introduced/removed, and append to the Change log. Stale FEATURE.md cascades across parallel agents.
