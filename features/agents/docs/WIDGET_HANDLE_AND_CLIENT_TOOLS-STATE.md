# Widget Handle + Client-Handled Tools — Current State

> **Landed:** 2026-04-18. Companion to [`WIDGET_HANDLE_SYSTEM.md`](WIDGET_HANDLE_SYSTEM.md) (the usage contract) — this doc captures what's wired, what it touches, and what's still queued behind it.

## 1. Current state — what shipped

### 1.1 Architecture

```
┌──────────┐  useWidgetHandle   ┌───────────────┐
│  Widget  │ ─────────────────▶ │ CallbackManager│ ← single source of truth for handle
│  (React) │                    └───────┬───────┘
└────┬─────┘                            │ .get<WidgetHandle>(id)
     │                                  │
     │ launchConversation               ▼
     │  ({widgetHandleId})      ┌───────────────┐
     ▼                          │ InstanceUIState│ widgetHandleId: string | null
┌──────────┐                    └───────┬───────┘
│  launch  │                            │
│  thunks  │ ──── (stores id) ──────────┘
└────┬─────┘
     │                                  ┌─────────────────────────┐
     ▼                                  │ assembler (per-turn)     │
┌──────────┐                            │  read handle live →     │
│ execute- │ ─────── invokes ───────▶   │  deriveClientTools →    │
│ instance │                            │  merge with slice tools │
└────┬─────┘                            └──────────────┬──────────┘
     │ POST with client_tools                          │
     ▼                                                 ▼
┌────────────────────────────────────────────────────────────────┐
│                      Python server                              │
│  AI loop → widget_* tool call → tool_delegated event           │
└────────────────────────┬───────────────────────────────────────┘
                         │ stream
                         ▼
                ┌──────────────────┐   isWidgetActionName? ──┐
                │  process-stream  │──────────────────────┐  │
                │   tool_delegated │                      │  │
                │     branch       │ yes                  │  │ no → pause
                └────────┬─────────┘                      │  │
                         ▼                                ▼  ▼
                  ┌───────────────┐                ┌──────────────┐
                  │  dispatch-    │                │ setInstance  │
                  │  WidgetAction │                │  Status:     │
                  │  thunk        │                │  paused      │
                  └──────┬────────┘                └──────────────┘
                         │
                         ├─ callbackManager.get(id) + handle.onTextReplace(args)
                         ├─ upsertToolLifecycle (completed | error)
                         └─ submitToolResult → microtask batcher
                                  │
                                  ▼
                        ┌───────────────────┐
                        │ POST /ai/convers- │
                        │  ations/{id}/tool_│
                        │  results          │  ← server resumes stream
                        └───────────────────┘

              At stream end (isEndEvent):
              ──────────────────────────────
              handle.onComplete({conversationId, requestId, responseText})
```

### 1.2 File inventory

**Created**

| File | Purpose |
|---|---|
| [`features/agents/types/widget-handle.types.ts`](../types/widget-handle.types.ts) | `WidgetHandle`, `WidgetActionName`, payload types, `deriveClientToolsFromHandle`, `isWidgetActionName`, `WIDGET_TOOL_NAME_TO_HANDLE_METHOD` |
| [`features/agents/hooks/useWidgetHandle.ts`](../hooks/useWidgetHandle.ts) | React hook — registers handle once, live-method forwarding via getters, unregister on unmount |
| [`features/agents/api/submit-tool-results.ts`](../api/submit-tool-results.ts) | Microtask-coalescing POST batcher for `/tool_results` |
| [`features/agents/redux/execution-system/thunks/dispatch-widget-action.thunk.ts`](../redux/execution-system/thunks/dispatch-widget-action.thunk.ts) | Routes `tool_delegated` for `widget_*` to handle methods |
| [`features/agents/components/tools-management/WIDGET_TOOLS_SEED.sql`](../components/tools-management/WIDGET_TOOLS_SEED.sql) | The 10 INSERT statements |
| [`features/agents/docs/WIDGET_HANDLE_SYSTEM.md`](WIDGET_HANDLE_SYSTEM.md) | End-to-end usage + contract |
| [`features/agents/docs/WIDGET_HANDLE_AND_CLIENT_TOOLS-STATE.md`](WIDGET_HANDLE_AND_CLIENT_TOOLS-STATE.md) | This doc |

**Modified**

| File | Change |
|---|---|
| [`utils/callbackManager.ts`](../../../utils/callbackManager.ts) | Added `get<T>(id)`, `unregister(id)`, `registerWidgetHandle(handle)` |
| [`features/agents/types/conversation-invocation.types.ts`](../types/conversation-invocation.types.ts) | `ConversationInvocationCallbacks`: 5 fields → 2 (`widgetHandleId`, `originalText`) |
| [`features/agents/types/instance.types.ts`](../types/instance.types.ts) | `InstanceUIState.callbackGroupId` → `widgetHandleId`. `ManagedAgentOptions`: removed `onComplete`/`onTextReplace`/`onTextInsertBefore`/`onTextInsertAfter`; added `widgetHandleId`. `AGENT_EXECUTION_DEFAULTS` same. |
| [`features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice.ts`](../redux/execution-system/instance-ui-state/instance-ui-state.slice.ts) | Rename everywhere. `setCallbackGroupId` → `setWidgetHandleId`. `destroyInstance` extraReducer uses `callbackManager.unregister` (not `removeGroup`). |
| [`features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors.ts`](../redux/execution-system/instance-ui-state/instance-ui-state.selectors.ts) | `selectCallbackGroupId` → `selectWidgetHandleId` + non-curried variant `selectWidgetHandleIdFor` |
| [`features/agents/redux/execution-system/instance-ui-state/components/InstanceUIStateCore.tsx`](../redux/execution-system/instance-ui-state/components/InstanceUIStateCore.tsx) | Debug panel label rename |
| [`features/agents/redux/execution-system/thunks/create-instance.thunk.ts`](../redux/execution-system/thunks/create-instance.thunk.ts) | Rename `callbackGroupId` → `widgetHandleId` throughout all three create thunks + the two startNewConversation thunks. Added `widgetHandleId` to `createManualInstanceNoAgent` args (gap fix). |
| [`features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts`](../redux/execution-system/thunks/launch-agent-execution.thunk.ts) | Deleted `registerCallbacks(options)` helper. Removed `onComplete?.(launchResult)` narrow-branch call (now fires from stream-end in process-stream). Threads `widgetHandleId` through all three create paths. |
| [`features/agents/redux/execution-system/thunks/launch-conversation.thunk.ts`](../redux/execution-system/thunks/launch-conversation.thunk.ts) | Deleted `makeUnary` helper and the four per-action callback resolutions. Adapter forwards only `widgetHandleId` + `originalText`. |
| [`features/agents/redux/execution-system/thunks/execute-instance.thunk.ts`](../redux/execution-system/thunks/execute-instance.thunk.ts) | Per-turn `client_tools` derivation: reads handle live, merges with non-widget tools from slice |
| [`features/agents/redux/execution-system/thunks/execute-chat-instance.thunk.ts`](../redux/execution-system/thunks/execute-chat-instance.thunk.ts) | Same per-turn derivation |
| [`features/agents/redux/execution-system/thunks/process-stream.ts`](../redux/execution-system/thunks/process-stream.ts) | `tool_delegated` branch: widget_* names dispatch `dispatchWidgetAction` without pausing; non-widget preserved. `handle.onComplete` fires at stream end (all display modes). `handle.onError` fires on stream-level errors. |
| [`features/agents/hooks/useAgentLauncher.ts`](../hooks/useAgentLauncher.ts) | Replaced the four callback passthroughs with `widgetHandleId` |
| [`features/agents/components/tools-management/CLIENT_SIDE_TOOLS.md`](../components/tools-management/CLIENT_SIDE_TOOLS.md) | Appended Widget Actions section |
| [`features/agents/conversation-invocation-reference.md`](../conversation-invocation-reference.md) | Rewrote callbacks section to describe `widgetHandleId` only |
| [`features/agents/agent-system-mental-model.md`](../agent-system-mental-model.md) | §7 flipped from 🚧 to ✅, content updated |
| [`features/agents/ROADMAP-agent-ecosystem-rebuild.md`](../ROADMAP-agent-ecosystem-rebuild.md) | §0 flipped from 🚧 to ✅ LANDED |

### 1.3 Database

10 rows live in `tool.definition` with `tag=widget-capable` and `semver=1.0.0`,
each actively bound to executor `matrx-ai-core` in `tool.binding`. Verified:

```sql
SELECT d.name, b.executor_name
FROM tool.definition d
JOIN tool.binding b ON b.tool_id = d.id AND b.is_active
WHERE 'widget-capable' = ANY(d.tags)
ORDER BY d.name;
-- Returns exactly the 10 widget_* names matching WIDGET_ACTION_NAMES
```

Python implementations at `matrx_ai.tools.implementations.widgets.*` — owned by Python team, same names and schemas.

### 1.4 Key contracts

**`WidgetHandle`:** 10 optional action methods (one per `widget_*` tool) + 3 optional lifecycle methods (`onComplete`, `onCancel`, `onError`). Presence of an action method determines capability.

**`WidgetActionResult`:**
```ts
| { ok: true; applied: WidgetActionName }
| { ok: false; reason: "unsupported" | "failed" | "not_found"; message?; cause? }
```

**`/tool_results` payload:** `{ results: ClientToolResult[] }` where `ClientToolResult = { call_id, tool_name, output?, is_error?, error_message? }`.

### 1.5 Diff-vs-plan-TODO summary

The original [`TODO-widget-tools-plan.md`](../TODO-widget-tools-plan.md) had 9 phases. The actual implementation followed the plan with **6 corrections** added from the design-review pass (all documented inline in the plan file at `/Users/armanisadeghi/.claude/plans/review-the-following-plan-sorted-token.md`):

| # | TODO plan | What actually landed | Why |
|---|---|---|---|
| C1 | Dispatch `setClientTools` once at launch | Per-turn derivation at the assembler | TODO approach lost capabilities on rehydrated conversations |
| C2 | Same as C1 | Same | Also lost mid-conversation capability changes |
| C3 | Dispatch one POST per resolved tool | Microtask batcher coalesces per-conversation | Concurrent widget tool calls raced the server's resumption logic |
| H1 | `setClientTools` merge with existing | Dropped merge — init zeros the slice anyway | Dead code |
| H2 | `onComplete` at narrow autoRun/direct/inline site | `handle.onComplete` fires in `process-stream.ts` at stream-end for ALL display modes | TODO would have preserved a pre-existing bug; interactive modes were missing onComplete |
| H3 | Slice rename only | Also changed `destroyInstance` extraReducer from `removeGroup` → `unregister` | Widget handles are single entries, not groups; `removeGroup(id)` silently no-ops and leaks |

## 2. Touched surfaces

### 2.1 Agent execution system
- Launch thunks simplified (no `registerCallbacks`, no `makeUnary`).
- Both execute thunks read widget handle live and merge `client_tools` per turn.
- Stream branches cleanly on `isWidgetActionName`. Non-widget delegated tools keep the old "pause" behavior.

### 2.2 Consumer components
- [`useAgentLauncher`](../hooks/useAgentLauncher.ts) migrated to `widgetHandleId`.
- **Not yet migrated:** `features/prompts/**`, `features/context-menu/**`, `features/notes/**`. These run on a separate legacy prompts overlay system with its own `onTextReplace` plumbing; they don't touch `ManagedAgentOptions`. When they migrate to the agent execution system (ROADMAP §2), they'll adopt `useWidgetHandle` too.

### 2.3 Redux slices
- `instance-ui-state`: field and action renamed (`callbackGroupId` → `widgetHandleId`, `setCallbackGroupId` → `setWidgetHandleId`).
- `instance-client-tools`: unchanged; now holds only non-widget client tools.
- `active-requests`: unchanged; `upsertToolLifecycle` called from both the stream and the dispatcher.

### 2.4 API layer
- New [`features/agents/api/`](../api/) directory with `submit-tool-results.ts` hosting the microtask batcher.
- Uses the existing `callApi` thunk action from [`lib/api/call-api.ts`](../../../lib/api/call-api.ts) — no fetch(), no direct HTTP.

### 2.5 Docs
- **Usage:** [`WIDGET_HANDLE_SYSTEM.md`](WIDGET_HANDLE_SYSTEM.md).
- **Contract:** [`CLIENT_SIDE_TOOLS.md`](../components/tools-management/CLIENT_SIDE_TOOLS.md) (widget-actions section appended).
- **Reference:** [`conversation-invocation-reference.md`](../conversation-invocation-reference.md) §10 rewritten.
- **Architecture:** [`agent-system-mental-model.md`](../agent-system-mental-model.md) §7 updated.
- **Strategy:** [`ROADMAP-agent-ecosystem-rebuild.md`](../ROADMAP-agent-ecosystem-rebuild.md) §0 marked landed.
- **History:** [`TODO-widget-tools-plan.md`](../TODO-widget-tools-plan.md) kept unchanged for provenance.

## 3. Remaining work + follow-ups

### 3.1 Consumer migrations (ROADMAP §2)
The prompts/context-menu surfaces still wire their own `onTextReplace` through a legacy overlay system. When ROADMAP §2 (UnifiedContextMenu → agent shortcuts) lands, each of these gets a `useWidgetHandle` call:

- [`features/context-menu/UnifiedContextMenu.tsx`](../../context-menu/UnifiedContextMenu.tsx)
- [`features/context-menu/CodeEditorContextMenu.tsx`](../../context-menu/CodeEditorContextMenu.tsx)
- [`features/context-menu/DynamicContextMenu.tsx`](../../context-menu/DynamicContextMenu.tsx)
- [`features/notes/components/NoteEditor.tsx`](../../notes/components/NoteEditor.tsx)
- Every caller under `features/prompts/**` that currently wires `onTextReplace`/`onTextInsertBefore`/`onTextInsertAfter` (7+ files)

**Pattern:**
```tsx
const widgetHandleId = useWidgetHandle({
  onTextReplace: ({ text }) => existingReplaceHandler(text),
  onTextInsertBefore: ({ text }) => existingInsertBeforeHandler(text),
  onTextInsertAfter: ({ text }) => existingInsertAfterHandler(text),
});
// Pass widgetHandleId on the invocation, drop the three callback props.
```

### 3.2 Wave-2 widget tools
Trivial to add under the same contract once a use case emerges:
- `widget_navigate` — router push/replace
- `widget_toast` — one-off notifications
- `widget_undo` / `widget_redo` — history stack integration
- `widget_focus` — focus management

Each: add a `tool.definition` row plus its `matrx-ai-core` `tool.binding`, add an
action method to `WidgetHandle`, add an entry to
`WIDGET_TOOL_NAME_TO_HANDLE_METHOD`, and add it to `WIDGET_ACTION_NAMES`.

### 3.3 Python implementations
All ten tools have active `tool.binding` rows for `matrx-ai-core`. Implementation
location is code-owned and deliberately absent from `tool.definition`; the DB
stores the contract and executor identity only. Widget-capable requests still
delegate them through `client_tools`, while other callers route them to
`matrx-ai-core`.

### 3.4 Sub-agent handle inheritance
A sub-agent (`origin: "sub-agent"`) spawned by a parent conversation does **not** inherit the parent's `widgetHandleId`. This is intentional: sub-agents run inside their own conversation, and the parent's widget isn't necessarily a sensible target for sub-agent actions. If we need explicit propagation later, add `shareWidgetHandleWithSubAgents?: boolean` to the invocation or a per-sub-agent override.

### 3.5 `execution_side` column on `tool.definition`
The CLIENT_SIDE_TOOLS.md open question ("mark DB tools as client-handled permanently?") is mostly obviated by the per-turn derivation — the frontend derives `client_tools` from the handle anyway. Still worth considering if we later want DB tools outside the `widget_*` family that should always delegate. Deferred.

### 3.6 Drift / conflict detection
When a widget handle changes capabilities mid-conversation (between turn N and N+1), the model's memory of "what tools exist" is stale until the next turn's `client_tools`. This is usually fine (the next request corrects it), but if a tool-completion on turn N references a capability that's no longer present by turn N+1, the agent may retry and get an `unsupported` response. Not observed in practice; log-and-learn for now.

### 3.7 Telemetry
We don't yet count per-tool invocation frequency or failure rate. Hooking `upsertToolLifecycle` outcomes into a counter slice (or emitting events to a telemetry sink) would enable catalog tuning. Belongs with ROADMAP cross-cutting "tooling & observability".

### 3.8 Smoke test automation
Phase 9 smoke tests are documented but manual. A lightweight Jest/Vitest suite covering at least items 3–8 from the test list (unsupported method, thrown method, no-handle, unmount, batching, rehydration) would catch regressions. Not on the critical path.

## 4. Known limitations

- **Per-conversation fan-out.** Concurrent POSTs across different `conversationId`s don't batch together. Intentional — conversations are independent.
- **Microtask window.** Tools that resolve synchronously in the same JS tick coalesce. A tool that takes 50+ms resolves in its own POST. Acceptable — most widget operations are `setState` calls.
- **`removeGroup` preserved for non-widget groups.** `utils/callbackManager.ts` still exports `removeGroup`; it's used by legitimate group-callback consumers like `hooks/useOrchestrateSave.ts` (save orchestration). The widget-handle cleanup uses `unregister`, not `removeGroup`.
- **Sub-agents without handle.** Noted in §3.4 above.
- **Docs lag.** `TODO-widget-tools-plan.md` kept unchanged as historical provenance; readers should defer to `WIDGET_HANDLE_SYSTEM.md` + this doc for current state.

## 5. Verification commands (bookmark)

```bash
# Typecheck (only failures are in unrelated files)
NODE_OPTIONS="--max-old-space-size=8192" pnpm tsc --noEmit

# DB verification
# (via Supabase MCP against project txzxabzwovsujtloxrus)
SELECT d.name, d.category, b.executor_name
FROM tool.definition d
JOIN tool.binding b ON b.tool_id = d.id AND b.is_active
WHERE 'widget-capable' = ANY(d.tags) ORDER BY d.name;
# Expected: 10 rows

# Grep for any remaining old references (should be zero in code, only docs)
grep -r "callbackGroupId\|onCompleteId\|onTextReplaceId" features/agents/ --include="*.ts" --include="*.tsx"
```
