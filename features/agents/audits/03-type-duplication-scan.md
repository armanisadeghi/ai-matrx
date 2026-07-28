# Type Duplication Scan

Local types that shadow globals. Prioritized list — act on HIGH items first.

| Severity | File:line | Local type | Shared source | Action |
|---|---|---|---|---|
| **HIGH** | `features/agents/types/agent-message-types.ts:316` | `interface ConversationMessage` | `features/cx-chat/types/conversation.ts:39` | **Consolidate.** Two `ConversationMessage` types with different shapes — one for API wire, one for UI state. Chat slice should wrap/extend the API shape, not redefine it. |
| **HIGH** | `features/cx-chat/types/conversation.ts:26` | `type MessageRole = "system" \| "user" \| "assistant"` | `features/agents/types/agent-message-types.ts:99` (`type Role` — 6 values incl. `"tool"`, `"developer"`, `"output"`) | **Align.** Chat slice's `MessageRole` is too narrow for DB rows (missing `"tool"`). Replace with `Role` from agent-message-types. |
| **MED** | `features/cx-chat/types/conversation.ts:135` | `type ApiMode = "agent" \| "conversation" \| "chat"` | `features/agents/redux/legacy-shims/cx-message-actions-types.ts:41` | **Single source.** Both define the same union. Import from legacy-shims until chat rewrite, then promote to `@matrx/agents/types`. |
| **MED** | `features/agents/redux/legacy-shims/*` | Entire folder of stubs | Multiple | **Boundary marker.** Acceptable today because it unblocks chat-feature compilation. Flag any NEW imports of these as technical debt. |
| **LOW** | `features/artifacts/types.ts:67` | `interface CxArtifactRow` | `Database["public"]["Tables"]["cx_artifact"]["Row"]` (verify exists) | **Verify alignment.** If DB auto-gen produces the row type, replace the local interface. |

## Types we don't need to touch

- `MessageRecord` / `ConversationRecord` / `CxUserRequestRecord` / `CxRequestRecord` / `CxToolCallRecord` — intentional camelCase mirrors of DB snake_case rows. Acceptable.
- `ConversationInvocation` — single canonical definition at `features/agents/types/conversation-invocation.types.ts`. Not duplicated anywhere.

## Notes

- The `apiEndpointMode` rename was complete — zero stragglers using the old `conversationMode` name in the new code paths.
- Local row-shape interfaces inside `load-conversation.thunk.ts` (`CxConversationRow`, `CxMessageRow`, etc.) are acceptable — they're a deliberate narrow view of the RPC bundle until `get_cx_conversation_bundle` types are regenerated into `database.types.ts`. They'll collapse into generated types on the next sync.
