# Audit — New Work (Phase 5–9)

Read-only audit of all code shipped during the Redux unification.

## Critical — fixed in-session

- ✅ **process-stream.ts** — `completedAt` dead ternary. Both branches computed the same timestamp. Simplified to a single `new Date().toISOString()` write whenever the tool-call record transitions.
- ✅ **launch-conversation.thunk.ts** — the adapter collapsed legacy `"chat"` to `"agent"` on `apiEndpointMode`, which was wrong. Fixed: `"chat"` now maps to `"manual"` (same as the endpoint swap `/ai/chat → /ai/manual`).
- ✅ **packages/matrx-agents/src/redux/slices.ts** — `messageActionsActions` wasn't exported from the slices barrel. Added.

## Noted, not fixed (by design)

- **Ephemeral turn-2+ short-circuit** intentionally skips the outer `createRequest` / `setInstanceStatus` dispatches because the inner `executeChatInstance` fires its own. Selectors read the INNER request id from `LaunchResult.requestId`; the outer chain never surfaces.
- **Cache-bypass race between parallel executions** is theoretically possible but requires two thunks awaiting in parallel on the same conversationId — not a pattern the app dispatches. If a consumer ever does, the second call gets the already-cleared flag and just ships no cache-bust (worst case: one stale read). Documented in the slice.
- **Tool reservations without `record_reserved cx_tool_call`** (sub-agent / streamed-only tool events) will skip the observability patch. The `toolCallIdByProviderCallId` map is the single gate; missing reservations mean no DB id to patch. Acceptable — those events still live in `activeRequests.toolLifecycle` for the live UI.

## Observability

- `CxUserRequestRecord.agentVersionId` is initialized to `null` at reservation time. The server provides it via `record_update` → `metadata`; to patch it post-reservation, the stream handler would need a table-specific metadata merge on `record_update`. Currently only `status` + `completedAt` flow through. Follow-up if Runner observability displays `agentVersionId`.

## Package scaffold

- `buildAgentsReducerMap()` keys are aligned with the selectors (`state.conversations`, `state.messages`, etc.). No key drift.
- `configure()` accessors throw with actionable messages on missing adapters.
- `types/index.ts` re-exports everything the `redux/*` barrels need; no circular re-exports found.
