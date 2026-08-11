# Message CRUD Playbook

How the agent system persists message edits and forks. The authoritative DB
row is `cx_message`; writes update Redux optimistically, round-trip through the
relevant Supabase RPC, and flip cache bypass for the next outbound AI call.

**`cx_message.content` contains generated `MessagePart` variants only.** Never
store renderer-private state there. Interactive artifacts persist through
`features/canvas/artifact-types/persistence/`: domain adapters for quiz,
flashcards, and tasks; `useArtifactState` + `canvas_item_state` for generic
per-viewer state. Historical `_matrxState` rows are read only by
`messages/persisted-content-boundary.ts`; no writer may recreate them.

## Three operations

| Operation | Thunk | RPC | Invoked from |
|---|---|---|---|
| Save a whole message (edit in full-screen editor) | `editMessage` | `cx_message_edit` | `saveFullContent` on `useMessageActions` + menu "Edit content" |
| Fork at this message ("Submit from here") | `forkConversation` | `cx_fork_conversation` | `forkAtThisMessage` on `useMessageActions` + menu "Fork at this message" |
| Edit + resubmit | `forkConversation` + `launchConversation` | `cx_fork_conversation` + usual launch | `editAndResubmit` on `useMessageActions` + menu "Edit & resubmit" |

Auxiliary:
- Soft-delete whole conversation: `softDeleteConversation` / `cx_soft_delete_conversation`.
- Invalidate server agent cache out-of-band: `invalidateConversationCache`.

## Hook

### `useMessageActions(conversationId, messageId, position?, surfaceKey?, buildInvocationForResubmit?, onNavigateToFork?)`

Returns `{ saveFullContent, forkAtThisMessage, editAndResubmit, deleteConversation }`. Use this from a menu or toolbar, NOT from inside a leaf block.

## Re-render safety

Every CRUD path respects the re-render contract documented in
`features/agents/redux/execution-system/messages/RE-RENDER-CONTRACT.md`.
Key rules:

- `editMessage` patches `content` (and `status` on the owning message) via
  `updateMessageRecord` — Immer's structural sharing keeps OTHER messages
  in the transcript reference-stable. Only the edited message's body
  re-renders.

## The editor save channel — NEVER pass `onSave` through overlay data

The full-screen editor (`fullScreenEditor` overlay) is rendered by the overlay
controller, which **cannot pass a function through Redux**. For most of 2026
the controller hard-coded `onSave={undefined}`, so every editor Save silently
no-op'd — that is what broke chat's "Edit" and "Edit & resubmit" (fixed
2026-06-14). The save now reaches the right place one of two ways:

1. **Self-handle** (plain edits) — open the editor with `conversationId` +
   `messageId` and **no** `onSave`. The bridge calls `editMessage` itself.
   This is the path for `UserActionBar` "Edit" and the menu "Edit content".
2. **Callback group** (when the caller needs the result) — use the typed opener
   `useOpenFullScreenMarkdownEditorBridge({ onSave })`. The opener registers a
   `callbackManager` group and passes only the `callbackGroupId` string; the
   bridge emits the saved text to your `onSave`. "Edit & resubmit" uses this to
   open the fork-vs-overwrite dialog. See
   `features/overlays/callbacks/fullScreenEditor.ts`.

**Attachments survive edits.** Every text edit goes through
`mergeEditedText(existingContent, newText)`
(`message-crud/content-blocks.util.ts`) — it replaces the text block but keeps
the message's image/audio/doc/context blocks. Do NOT re-wrap edited text as a
bare `[{type:'text',text}]` array; that silently drops attachments.

## Menu wiring

The canonical message-action menu (`features/agents/components/messages-display/message-options/messageActionRegistry.ts`)
exposes these CRUD items under the "Edit" category:

- **Edit content** — opens the full-screen editor with `conversationId` +
  `messageId` and no callback; the bridge self-handles via `editMessage`
  (`cx_message_edit` RPC), preserving non-text blocks.
- **Fork at this message** — dispatches a thunk-in-action that reads the
  message's `position` from state, then calls `forkConversation`.
- **Edit & resubmit** — lives ONLY on the inline `UserActionBar` Send button
  (`handleEditAndResubmit`): opens the editor with an `onSave` callback that
  stashes the new text and opens the fork-vs-overwrite dialog. Fork →
  `forkConversation` + `editMessage` on the fork head; Overwrite →
  `overwriteAndResend`. The old menu-item factory was deleted — it carried the
  broken `onSave`-in-Redux pattern.

## Cache-bust guarantee

`editMessage`, `forkConversation`, `softDeleteConversation` all call
`markCacheBypass({ conversation: true })` on success. The next outbound
AI request (via `executeInstance` or `executeChatInstance`) consumes that
flag through `consumePendingCacheBypass` and ships `cache_bypass` on the
payload. The server's agent cache rebuilds from the DB — never stale.

If the user edits then navigates away (no follow-up turn), call
`invalidateConversationCache({ conversationId })` directly. It hits
`POST /cx/conversations/{id}/invalidate-cache` and clears the pending
bypass flag.

## Artifact dedupe (HTML preview, flashcard decks, diagrams, etc.)

`registerArtifactThunk` is idempotent on the natural key
`(user_id, message_id, artifact_type, external_system)`. Duplicate
creation is prevented at two layers:

- **Client-side:** the thunk short-circuits if a matching artifact is
  already in Redux and the caller isn't pushing fresh mutable fields
  (`externalId`, `externalUrl`, `title`, `description`, `thumbnailUrl`).
- **Server-side:** `POST /api/artifacts { action: "create" }` looks up
  the natural key first; if an artifact exists it applies any provided
  updates and returns the single row, otherwise it inserts a new one.

Effect: opening the HTML preview overlay repeatedly (or double-clicking
"Generate Page" before the artifact fetch settles) produces exactly one
`cx_artifact` row per message — regardless of client-side races.

## Stateful block persistence

**Read [`features/artifacts/FEATURE.md`](../../../artifacts/FEATURE.md) before
adding state to any render block.** Use its registered custom adapter when the
domain owns state; otherwise use `useArtifactState`. Never patch interactive
state into `cx_message.content` or invent a local content-part type.

## Out-of-scope (future work)

- **Full undo/redo on message edits.** `cx_message_edit` archives the
  prior content into `content_history` automatically; a client-side undo
  stack can read from there. Not wired to a menu today.
