# Assistant Message Actions — Review Sheet

Scope: inline **Action Bar** + **⋯ Message options** menu on committed, non-failed assistant turns (`messageId` required). Bar hidden while streaming or on failed turns.

| Name | Opens / triggers | Notes | Arman Feedback | STATUS |
|------|------------------|-------|----------------|--------|
| **Like message** *(action bar)* | Local UI toggle only | No Redux/API; resets dislike | | Needs Review |
| **Dislike message** *(action bar)* | Local UI toggle only | No Redux/API; resets like | | Needs Review |
| **Copy message** *(action bar)* | Clipboard | Uses aggregated text when `AssistantTurnGroup` passes `groupMessageIds` | | Needs Review |
| **Speak** *(action bar)* | `StreamingSpeakerButton` → TTS stream | Same aggregated text as copy | | Needs Review |
| **Edit message** *(action bar)* | `fullScreenEditor` overlay (`mode: "assistant-message"`) | Save → `editMessage` thunk via bridge | | Needs Review |
| **More options** *(action bar, ⋯)* | `MessageOptionsMenu` (`role="assistant"`) | Gated by `selectShowAssistantMessageOptions`; lazy-loaded | | Needs Review |
| **Edit content** *(options → Edit)* | `fullScreenEditor` overlay (`mode: "free"`) | Duplicate edit path vs bar pencil — different mode | | Needs Review |
| **Edit history (N)** *(options → Edit)* | `EditHistoryDialog` | Hidden when `contentHistoryCount === 0` | | Needs Review |
| **Fork at this message** *(options → Edit)* | `forkConversation` → **Branch created** modal | Stay here / Go to new branch via `promptForkOutcome` | | Needs Review |
| **Delete message** *(options → Edit)* | `DeleteMessageDialog` | See delete sub-flow rows below | | Needs Review |
| **Note** *(options → Save as)* | `quickNoteSaveWindow` window panel | Folder: **Chat Saves**; title: `{conversation title} Message {n}` when labeled; amber **N** icon | | Needs Review |
| **Analyze response** *(options → Creator)* | `messageAnalysisWindow` overlay | Agent owner only (`isCreator`) | | Needs Review |
| **Debug stream** *(options → Creator)* | `streamDebug` overlay | Owner only; `streamRequestId` often null after reload | | Needs Review |
| **Copy text** *(options → Copy)* | Clipboard | Plain markdown text | | Needs Review |
| **Copy for Google Docs** *(options → Copy)* | Clipboard | `formatForGoogleDocs: true` | | Needs Review |
| **Copy for Word** *(options → Copy)* | Clipboard | Same formatter as Docs | | Needs Review |
| **Copy with thinking** *(options → Copy)* | Clipboard | `includeThinking: true` (assistant-only) | | Needs Review |
| **HTML preview** *(options → Export)* | `htmlPreview` overlay | Can save back via `editMessage` when ids present | | Needs Review |
| **Copy HTML page** *(options → Export)* | Clipboard (+ optional HTML preview) | WordPress-style HTML | | Needs Review |
| **Email to me** *(options → Export)* | `/api/chat/email-response` POST or `emailDialog` overlay | Unauthed → email dialog | | Needs Review |
| **Print / Save PDF** *(options → Export)* | Browser print dialog | `printMarkdownContent` — text only | | Needs Review |
| **Full Print (all blocks)** *(options → Export)* | DOM capture PDF (`useDomCapturePrint`) | Only when host passes `onFullPrint`; includes tool/media blocks | | Needs Review |
| **Save to Scratch** *(options → Actions)* | Direct `NotesAPI.create` → Scratch folder | Unauthed → `authGate` + sessionStorage resume | | Needs Review |
| **Save code to Scratch** *(options → Actions)* | Direct `CodeFilesAPI.create` | First fenced code block only | | Needs Review |
| **Save to Code** *(options → Actions)* | `saveToCode` overlay | Extracts first code block | | Needs Review |
| **Save as file** *(options → Actions)* | Browser download `.md` | `message-{timestamp}.md` blob | | Needs Review |
| **Create task from message** *(options → Actions)* | `setPendingSource` Redux (task UI seed) | Does not open overlay directly | | FIXED 2026-07-05 (see fix wave below) |
| **Convert to broker** *(options → Actions)* | `toast.info("Coming soon")` | **Stub — not implemented** | | Needs Review |
| **Save to Document** *(options → Actions)* | `pushMarkdownToDocument` (Univer) | Lazy import; toast with Open link | | Needs Review |
| **Fork at this message (server)** *(options → Server API test)* | Python `forkConversationServer` | Super-admin only | | Needs Review |
| **Fork BEFORE this message (server)** *(options → Server API test)* | Same, `exclusive: true` | Super-admin only | | Needs Review |
| **Hide this from model (server)** *(options → Server API test)* | `hideMessages` thunk | Super-admin only | | Needs Review |
| **Delete this message (server)** *(options → Server API test)* | `ConfirmDialog` → `batchDeleteMessages` | Hard delete + reload; super-admin | | Needs Review |
| **Delete this + everything after (server)** *(options → Server API test)* | Confirm → truncate via server | Super-admin only | | Needs Review |
| **Dry-run: delete this + after (server)** *(options → Server API test)* | Info toast with would-delete IDs | No mutation | | Needs Review |
| **Replace this with a summary… (server)** *(options → Server API test)* | `fullScreenEditor` → `replaceMessages` | Admin test path | | Needs Review |
| **Restore compaction (server)** *(options → Server API test)* | `restoreCompaction` thunk | Only when message has compaction metadata | | Needs Review |
| **Submit feedback** *(options → App)* | `feedbackDialog` overlay | | | Needs Review |
| **Announcements** *(options → App)* | `announcements` overlay | | | Needs Review |
| **Preferences** *(options → App)* | `userPreferences` overlay | Label in menu is "Preferences" | | Needs Review |

### Sub-flows (not top-level menu items)

| Name | Opens / triggers | Notes | Arman Feedback | STATUS |
|------|------------------|-------|----------------|--------|
| **Delete here** *(delete dialog)* | `deleteMessage` thunk | In-place soft delete + tool cascade | | Needs Review |
| **Fork without this message** *(delete dialog)* | Fork at prior position → delete copy on fork → optional surface nav | Hidden when `canFork` false (first message) | | Needs Review |
| **Compare with current** *(edit history dialog)* | `diffViewerWindow` overlay | Per archived version | | Needs Review |
| **Restore this version** *(edit history dialog)* | `editMessage` + optional `setRequestEditedText` | Current text archived first (reversible) | | Needs Review |

---

## Observations for fix-up agents

### Architecture

- `AgentAssistantMessage` mounts `AssistantActionBar`; the bar owns inline buttons + hosts `MessageOptionsMenu` + `DeleteMessageDialog` + `EditHistoryDialog`.
- Menu items are defined in `messageActionRegistry.ts` → `getAssistantMessageActions()`. No Redux instance-registration — props/context only.
- Action bar renders only when: `!hideActionBar && !isStreamActive && !failed && messageId`.

### Key files

| File | Role |
|------|------|
| `features/agents/components/messages-display/assistant/AgentAssistantMessage.tsx` | Message shell; passes `onFullPrint`, retry, provider retry |
| `features/agents/components/messages-display/assistant/AssistantActionBar.tsx` | Inline bar + menu host + delete/edit-history dialogs |
| `features/agents/components/messages-display/message-options/MessageOptionsMenu.tsx` | Overflow menu shell; creator/admin detection |
| `features/agents/components/messages-display/message-options/messageActionRegistry.ts` | All menu item factories |
| `features/window-panels/windows/notes/QuickNoteSaveWindow.tsx` | Save-as-Note window panel (`90vw` × `85dvh`) |
| `components/branding/RouteFaviconIcon.tsx` | Route letter badge icons (Notes = amber N) |
| `features/agents/redux/execution-system/messages/messages.selectors.ts` | `extractFlatText` — answer-only by default; strips thinking |
| `features/agents/components/messages-display/message-options/DeleteMessageDialog.tsx` | Delete vs fork-without |
| `features/agents/components/messages-display/message-options/EditHistoryDialog.tsx` | Version list, compare, restore |
| `features/agents/components/messages-display/message-options/promptForkOutcome.ts` | Post-fork Stay / Go modal |
| `features/overlays/OverlayController.tsx` | Renders overlays opened from actions |
| `.cursor/skills/message-actions-overlay-system/SKILL.md` | Overlay wiring docs |

### Likely problem areas

1. **Duplicate edit paths** — Bar pencil uses `mode: "assistant-message"`; menu **Edit content** uses `mode: "free"`. Same overlay, different save contracts — easy to drift or break one.
2. **Like / Dislike** — Pure local state; nothing persisted or sent anywhere.
3. **Convert to broker** — Stub toast only.
4. **Creator panels** — `streamRequestId` from `_streamRequestId` is in-memory; reload degrades **Debug stream** / **Analyze response**.
5. **Menu vs dialog z-index** — Fork/delete server items close menu first (z-index 9999 collision documented in registry).
6. **Copy duplication** — Copy in bar and **Copy text** in menu do the same thing; menu copy uses single-message `content`, bar may aggregate multi-iteration turns.
7. **Compact density** — Bar is hover-only on non-latest assistant turns (`selectResponseDensity === "compact"`).
8. **Edit & Resubmit** — Intentionally hidden for assistant role (user messages only).
9. **Thinking in save/copy** — Fixed centrally in `extractFlatText` (excludes `thinking`/`reasoning` blocks + strips inline tags). **Copy with thinking** re-extracts with `{ includeThinking: true }`.

### Recent changes (2026-07-05)

- Added **Save as → Note** menu section after Delete; opens `quickNoteSaveWindow` (not `saveToNotes` modal).
- New default folder **Chat Saves** (`MessageSquareText`, sky) — pre-selected for chat saves.
- Note title pre-filled as `{conversation title} Message {n}` (1-based) when the conversation is labeled.
- Removed duplicate **Save to Notes** from Actions section.
- `QuickNoteSaveWindow` sized to `90vw` × `85dvh` (capped to viewport − 24px), matching modal footprint.
- `extractFlatText()` now answer-only by default — fixes thinking tokens leaking into save/copy/TTS paths.

### Fix wave (2026-07-05, PM) — create-task + shared primitives

**New primitives (use these for every subsequent action fix):**

- `components/content-refine/` — `useRefinableContent` (strip-thinking + start/end trim + edit-override transform pipeline) + `RefinableContentEditor` (view-mode toggle, strip/copy/reset-trim toolbar, trim sliders, char badge, `NoteEditorCore` body). Extracted from the quick-note-save flow; `useQuickNoteSave` and `TaskQuickCreateCore` both consume it. The old `quick-save/utils/stripThinking|trimContent` moved to `components/content-refine/utils/` (all imports repointed).
- `features/agents/utils/conversation-message-title.ts` — `buildConversationMessageTitle(title, position)` → `"{conversation title} Message {n}"`. Replaces `buildChatSaveNoteName` (deleted). EVERY "create something from a message" action derives its title here, never from raw content.
- `features/agents/components/messages-display/message-options/buildTaskSeedFromMessage.ts` — the one task-seed builder (menu action + post-auth resume both use it); also exports `buildMessagePreviewLabel` (cleanMarkdown → collapse whitespace → slice) for association labels.
- `MessageActionContext.turnContent` — aggregated whole-turn text, threaded from `AssistantActionBar` (`aggregatedContent`) through `MessageOptionsMenu`. Consumption actions (Copy ×3, Save as Note, Save to Scratch/Code/File/Document, Create task, Email, Print, Copy HTML) use `turnContent ?? content`; write-back actions (Edit content, HTML preview save) stay on single-message `content`. Kills the "menu silently drops earlier iterations" bug.

**Create-task specifics fixed:** title from conversation label; conversation edge labeled with the real conversation title (was message-preview); hierarchy ensure-fetch on mount (`useEnsureHierarchyLoaded`) so Project dropdown is never empty; window resized 720×560 → `90vw × 85dvh`; description gets the full refine toolkit. Still to verify live: post-save "Window" panel behavior (wiring looks correct — seeds `quickTasksWindowSlice` then opens `quickTasksWindow`).

### Menu reorg (2026-07-05, wave 2) — SUPERSEDES the section column in the table above

The ⋯ menu now has this structure (same for assistant + user messages, modulo role gates):

- **Edit** — unchanged (Edit content / Edit history / Fork / Delete).
- **Save as** (all destinations, route-badge icons via `RouteFaviconIcon`):
  1. **Note** (`save-as-note`, /notes badge) — refine window, Chat Saves folder.
  2. **Document** (`add-docs`, /documents badge) — Univer doc; name = conversation title via `deriveMessageTitle`.
  3. **Markdown** (`save-file`) — .md download; filename from conversation title (was `message-{ts}`).
  4. **Code** (`save-to-code`, /code badge) — saveToCode overlay.
  5. **File** (`save-as-file`, /files badge) — **NEW**: uploads `{title}.md` into the user's cloud files ("Chat Saves" folder) via `fileHandler.upload`; toast with Open → `/files/f/{id}`.
  6. **Scratch Code** (`save-code-scratch`, /code badge) — instant code-block save.
  7. **Scratch Note** (`save-scratch`, /notes badge) — instant save to Scratch; title now derived from conversation label (was hardcoded "New Note").
  8. **PDF Document** (`save-as-pdf`) — browser print→Save-as-PDF; same wiring as Print for now, presented as a destination.
- **Creator** — unchanged.
- **Copy** — plain / Google Docs / Word / **Copy HTML page** (moved from Export) / with thinking (assistant only).
- **Actions** — **Create Task** (/tasks badge, renamed), **Publish HTML** (renamed HTML preview), **Share as webpage** (NEW — same opener as Publish HTML, one `openHtmlPublish` so they can't drift), **Email to me**, **Print**, **Full Print (all blocks)**.
- **Server API (test)** / **App** — unchanged.
- **DELETED:** Convert to broker (stub). Dead `save-notes` auth-resume branch removed; `save-as-file` resume branch added.
- The old "Export" category no longer exists; `getUserMessageActions` also gained the full Save as section.

**Task window footer pattern (replicate on other save windows):** `TaskQuickCreateCore` takes `footerHost?: HTMLElement | null`; when the WindowPanel passes a `footerRight={<div ref={setFooterHost}/>}` slot, the Cancel / Create & attach / post-save buttons portal into the window footer (h-7 compact). Falls back inline when no host.

**Selection-aware TTS (NEW):** `StreamingSpeakerButton` accepts `getTextOverride?: () => string | null`, snapshotted at click (mousedown is prevented so the selection survives). `AssistantActionBar` passes a reader that returns the current selection ONLY if it sits inside this turn's `data-message-id` wrappers — select part of a response, hit Speak, hear just that part.

### Fix wave 3 (2026-07-13) — defects closed

- **Like/Dislike now PERSIST** — `metadata.user_reaction` via new `cx_message_set_reaction` RPC (security invoker, jsonb_set; '' or NULL clears; applied + ledgered). `setMessageReaction` thunk (message-crud) does optimistic patch + rollback; the bar hydrates from the record, clicking the active reaction clears it. NOTE: RLS requires conversation **editor** — viewers of a shared conversation cannot react (flagged, acceptable for now).
- **Edit paths unified** — bar pencil and menu "Edit content" both call `openAssistantMessageEditor` (message-options/) — one `mode:"assistant-message"` contract, one instance id.
- **`add-docs` post-auth resume branch added** (was the only auth-gated action without one).
- **Note quick-save on shared primitives** — QuickNoteSaveCore consumes `RefinableContentEditor` (its duplicated toolbar/TrimRow copy deleted) and portals footer actions into `QuickNoteSaveWindow`'s `footerRight` slot via `footerHost` — the same pattern as the task window. Both flagship windows now share ONE toolbar/trim/editor implementation and ONE footer pattern.
- **Still open (needs backend):** Analyze response / Debug stream degrade after reload — `chat.message` persists no request linkage (verified live: metadata keys are just `finish_reason`; `chat.request` has no message id). Fix belongs in aidream: persist `request_id` into assistant-message metadata at finalize.

### Fix wave 4 (2026-07-15) — menu twins differentiated

- **Share as webpage is REAL now** — `shareMessageAsWebpage.ts` (message-options/): markdown → `convertMarkdownToHtml` → `HTMLPageService.createPage` with `sourceMessageId` (idempotent: re-share updates the same page, same stable public `/p/{id}` URL), copies the link to clipboard, toast with Open. No longer an alias of Publish HTML.
- **PDF Document is REAL now** — `lib/block-print/markdown-pdf.ts` (`markdownToPdfBlob`): markdown → sanitized offscreen WordPress-styled render (scripts/handlers/javascript: URLs stripped) → `captureToPDFBlob` (new Blob variant of the dom-capture util, always-light background) → uploaded into Files under "Chat Saves" with an Open link. No longer an alias of Print.
- Both are auth-gated with post-auth resume branches (resume publishes/saves without per-message idempotency — no ids at resume time).
- **Decisions locked (2026-07-15):** reactions stay per-message (shared model accepted); viewer-gating of thumbs remains a known UX gap (no conversation-permission data in Redux; failure is graceful: rollback + toast).

### Related (not in bar/menu)

| Name | Where | Notes |
|------|-------|-------|
| **Retry** | `AssistantError` on failed turn | Last recoverable failure only (`canRetry`) |
| **Retry now / Cancel** | `ProviderRetryCard` | Provider busy state during stream |
| **Message file strip / Revert** | `MessageFilesStrip` | Code-edit history on message |
| **Right-click context menu** | `AgentConversationDisplay` / context-menu-v2 | Separate from ⋯ menu — selection actions, quick actions, run agents |

### Visibility gates (quick reference)

| Gate | Affects |
|------|---------|
| `selectShowAssistantMessageOptions` | ⋯ button + menu |
| `isCreator` | Creator section (2 items) |
| `selectIsSuperAdmin` | Server API (test) section |
| `contentHistoryCount > 0` | Edit history menu item |
| `showFullPrint && onFullPrint` | Full Print menu item |
| `onRequestDelete` wired | Delete message menu item |
