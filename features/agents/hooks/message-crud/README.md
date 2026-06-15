# Message CRUD Playbook

How the agent system persists message edits, forks, and interactive-artifact
state. All three flow through the same pipe: the authoritative DB row is
`cx_message`, every write goes through a thunk that updates Redux
optimistically + round-trips via the relevant Supabase RPC + flips the
conversation's cache-bypass flag for the next outbound AI call.

## Four operations

| Operation | Thunk | RPC | Invoked from |
|---|---|---|---|
| Save a whole message (edit in full-screen editor) | `editMessage` | `cx_message_edit` | `saveFullContent` on `useMessageActions` + menu "Edit content" |
| Patch one block's state (quiz answers, form fields, artifact edits) | `editMessage` with the updated content blocks | `cx_message_edit` | `useMessageBlockPersistence.patchBlock` |
| Fork at this message ("Submit from here") | `forkConversation` | `cx_fork_conversation` | `forkAtThisMessage` on `useMessageActions` + menu "Fork at this message" |
| Edit + resubmit | `forkConversation` + `launchConversation` | `cx_fork_conversation` + usual launch | `editAndResubmit` on `useMessageActions` + menu "Edit & resubmit" |

Auxiliary:
- Soft-delete whole conversation: `softDeleteConversation` / `cx_soft_delete_conversation`.
- Invalidate server agent cache out-of-band: `invalidateConversationCache`.

## Two hooks

### `useMessageBlockPersistence(conversationId, messageId, blockType?, blockId?, indexHint?)`

For any stateful render block (quiz, flashcard, form, editable table, code
sandbox). Returns `{ blockState, patchBlock }`.

```ts
const { blockState, patchBlock } = useMessageBlockPersistence({
  conversationId, messageId,
  blockType: "quiz",
  indexHint: blockIndex,
});

// rehydrate on mount from the persisted block
useEffect(() => {
  if (blockState?._matrxState) setLocalState(blockState._matrxState.quizState);
}, [blockState?._matrxBlockId]);

// persist on change (debounced in the caller)
useEffect(() => {
  const t = setTimeout(() => void patchBlock({ _matrxState: { quizState } }), 750);
  return () => clearTimeout(t);
}, [quizState, patchBlock]);
```

The hook:
- reads `cx_message.content` (the `CxContentBlock[]` JSON).
- locates the block by `_matrxBlockId` (preferred) or by `(blockType + indexHint)`.
- merges the patch into the target block, minting a UUID for `_matrxBlockId` on first write.
- dispatches `editMessage` which calls `cx_message_edit` and flips cache-bypass.

Side effect: the agent's next-turn history now reflects the current block state. Want the model to "see" how the user did on the quiz? It already does — the answers are inside the message content it's re-shown.

### `useMessageActions(conversationId, messageId, position?, surfaceKey?, buildInvocationForResubmit?, onNavigateToFork?)`

Returns `{ saveFullContent, forkAtThisMessage, editAndResubmit, deleteConversation }`. Use this from a menu or toolbar, NOT from inside a leaf block.

## Identifying blocks

Render blocks stamped with `_matrxBlockId` persist cleanly. Blocks without
it fall back to `(blockType + indexHint)` — fine for the FIRST write, but
risky when the same message has multiple blocks of the same type. The hook
mints a stable UUID on first `patchBlock` call and writes it back, so
subsequent round-trips use the stable id.

Agents that author artifacts with a model-provided `id` field can stamp
`_matrxBlockId` directly from the model output — skip the client mint. All
existing behavior stays correct: `_matrxBlockId` + `_matrxBlockType` +
`_matrxState` are namespaced so they never collide with server-side block
fields.

## Re-render safety

Every CRUD path respects the re-render contract documented in
`features/agents/redux/execution-system/messages/RE-RENDER-CONTRACT.md`.
Key rules:

- `editMessage` patches `content` (and `status` on the owning message) via
  `updateMessageRecord` — Immer's structural sharing keeps OTHER messages
  in the transcript reference-stable. Only the edited message's body
  re-renders.
- Block-level `patchBlock` replaces ONE entry in the content array. The
  array reference changes, but if consumers subscribe through the narrow
  `selectMessageContent(cid, mid)` selector, only that one message's
  subscribers re-run — not every renderer in the transcript.

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

## The block persistence pattern (checklist for new stateful blocks)

1. Accept `conversationId?: string`, `messageId?: string`, `blockIndex?: number` in the block's props.
2. Thread them from `BlockRenderer` (already done for `MultipleChoiceQuiz`; copy the pattern).
3. Call `useMessageBlockPersistence({ conversationId, messageId, blockType: "...", indexHint: blockIndex })`.
4. Rehydrate local state from `blockState._matrxState` in a mount-only effect.
5. Debounce writes on state change (150–750ms depending on how hot the changes are). Do NOT write every keystroke — 50 writes/sec would swamp the RPC.
6. Use `_matrxState` for arbitrary state (serialize anything JSON-safe). Keep the block's OWN fields (the server-authored shape) untouched.

## Out-of-scope (future work)

- **Full undo/redo on message edits.** `cx_message_edit` archives the
  prior content into `content_history` automatically; a client-side undo
  stack can read from there. Not wired to a menu today.
- **Per-sub-block ids for renderers that split one block into many parts**
  (e.g. a quiz renderer that treats each question as a sub-block). Today
  one quiz → one `_matrxBlockId`; that's sufficient because the serialized
  `_matrxState` carries the full quiz state.
