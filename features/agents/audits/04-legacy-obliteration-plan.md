# Legacy Obliteration Plan

No more `@deprecated` aliases, no more rename-and-reexport shims, no
more legacy-first naming. Execute waves in order.

## Wave 1 — Zero-risk alias deletions (30 min, no consumers)

These aliases exist only to ease the migration window. Consumer code
already uses the standard names.

- [ ] `features/agents/redux/execution-system/conversations/index.ts` — remove `executionInstancesReducer` re-export.
- [ ] `features/agents/redux/execution-system/messages/index.ts` — remove `instanceConversationHistoryReducer` re-export.
- [ ] `features/agents/redux/conversation-list/conversation-list.types.ts` — remove `AgentConversationListItem` + `agentConversationsCacheKey` aliases.
- [ ] `features/agents/redux/conversation-list/conversation-list.slice.ts` — remove `patchAgentConversationMetadata` + `upsertAgentConversationInCaches` aliases.
- [ ] `features/agents/redux/conversation-list/conversation-list.selectors.ts` — remove `makeSelectAgentConversations`, `selectAgentConversationsEntry`, `selectAgentConversationsEntryForInstance`.
- [ ] `features/agents/redux/conversation-list/record-conversation-from-execution.ts` — remove `upsertAgentConversationFromExecutionAction` + `buildAgentConversationListItemFromExecution` aliases.
- [ ] `lib/api/endpoints.ts` — remove the `chat: "/ai/manual"` alias (`ai.chat`).
- [ ] Any `process-stream.ts` call sites using aliases → switch to canonical names.

**Verify:**
```
grep -r "executionInstancesReducer\|instanceConversationHistoryReducer\|AgentConversationListItem\|agentConversationsCacheKey\|patchAgentConversationMetadata\|upsertAgentConversationInCaches\|upsertAgentConversationFromExecutionAction\|makeSelectAgentConversations" --include="*.ts" --include="*.tsx"
```
Expected: zero matches outside the audit docs.

## Wave 2 — Orphaned files (5 min, zero risk)

- [ ] Verify no imports of `lib/redux/liteRootReducer.ts` — the file header marks it `@deprecated`.
- [ ] Delete `lib/redux/liteRootReducer.ts`.
- [ ] Clean unmount comments in `lib/redux/rootReducer.ts` (lines `// activeChat — unmounted …` etc.) once Wave 4 lands.

## Wave 3 — Type name consolidation (1–2 hrs, coordinated rename)

- [ ] `ExecutionInstance` → `ConversationRecord`.
  - Primary source: `features/agents/types/instance.types.ts`.
  - Followthrough: `conversations.slice.ts`, `conversations.selectors.ts`, the package `types/index.ts` barrel.
  - Grep: `grep -r "ExecutionInstance" --include="*.ts"` — confirm 0 outside a deprecation alias.

## Wave 4 — Legacy-shims folder delete (blocked on chat rewrite)

Today the `features/agents/redux/legacy-shims/` folder is alive to
unblock 53 imports across `cx-chat/`, `cx-conversation/`, `conversation/`
barrels. Delete after chat is rebuilt on `@matrx/agents`.

- [ ] Rewrite cx-chat components to import directly from `@matrx/agents`.
- [ ] Rewrite cx-conversation hooks + components similarly.
- [ ] Update `features/conversation/state/index.ts` + `features/conversation/index.ts` barrels.
- [ ] Delete `features/agents/redux/legacy-shims/`.

**Verify:**
```
grep -r "legacy-shims" --include="*.ts" --include="*.tsx"
```
Expected: zero matches.

## Wave 5 — Folder renames (after Wave 4, ~100 imports)

- [ ] `features/agents/redux/execution-system/instance-ui-state/` → `display/`
- [ ] `.../instance-variable-values/` → `variables/`
- [ ] `.../instance-model-overrides/` → `model-config/`
- [ ] `.../instance-resources/` → `resources/`
- [ ] `.../instance-context/` → `context/`
- [ ] `.../instance-client-tools/` → `client-tools/`
- [ ] `.../instance-user-input/` → `input/`
- [ ] Rename slice store keys to match (`instanceUIState` → `display`, etc.) — cascades into every selector.
- [ ] Update `buildAgentsReducerMap()` and the host's `rootReducer.ts`.

## Wave 6 — Flatten `execution-system/` wrapper

Optional; cosmetic but large. Move slices to flat positions:

- [ ] `features/agents/redux/execution-system/conversations/` → `features/agents/redux/conversations/` (alongside `conversation-list/`).
- [ ] Same for `messages/`, `observability/`, `active-requests/`, `message-actions/`, `message-crud/`, `conversation-focus/`, and the renamed `display/` `variables/` etc.
- [ ] Delete empty `execution-system/` folder.
- [ ] Update ~100+ imports across the app.

## Wave 7 — Thunk rename

- [ ] `executeChatInstance` → `executeManualInstance` (file + symbol).
  - Call sites: `launch-agent-execution.thunk.ts`, `create-instance.thunk.ts`, `smart-execute.thunk.ts`, `execute-instance.thunk.ts`.
  - File rename: `execute-chat-instance.thunk.ts` → `execute-manual-instance.thunk.ts`.

## Scheduling

- Waves 1 + 2 land NOW — no risk, tiny diff.
- Wave 3 next — single coordinated rename.
- Waves 4 + 5 + 6 + 7 after chat is rebuilt on `@matrx/agents`. They can run together as one "clean-up sprint".
