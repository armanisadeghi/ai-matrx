> 🚫 HISTORICAL — `storage_uri`/`file_uri` were ERADICATED from the FE (2026-07-06). Any instruction below referencing them is obsolete; see features/files/FEATURE.md.

# Follow-Up Tasks — Post-Review

All P0 and P1 issues from `DB_SCHEMA_SYNC_ANALYSIS.md` were resolved correctly.
Six issues remain (three original + three new from the rendering migration).

---

## Issue 1 — ACTIVE BUG: V1 tool-result `call_id` not checked (OpenAI legacy conversations)

**File:** `lib/chat-protocol/from-db.ts`
**Function:** `extractResultsFromToolRoleContent`

**What breaks:** In V1 conversations (old schema where `role="tool"` messages contain embedded `tool_result` blocks), OpenAI-generated tool results are silently lost. The function never finds the `callId`, so outputs are discarded and the preceding `ToolCallBlock` is left with no output.

**Root cause:** Python's `ToolResultContent.to_storage_dict()` writes either `tool_use_id` (Anthropic) or `call_id` (OpenAI). It **never** writes `tool_call_id`. The current code checks the wrong field:

```ts
// CURRENT — wrong: tool_call_id is a phantom field never written by Python
const callId = String(block.tool_call_id ?? block.tool_use_id ?? '');

// CORRECT — check call_id (OpenAI) first, then tool_use_id (Anthropic)
const callId = String(block.call_id ?? block.tool_use_id ?? '');
```

**Location:** `from-db.ts`, inside `extractResultsFromToolRoleContent`, the `if (block.type === 'tool_result')` block.

---

## Issue 2 — TYPE ACCURACY: `CxToolResultContent.tool_call_id` is a phantom field

**File:** `features/public-chat/types/cx-tables.ts`

**What's wrong:** `CxToolResultContent` has a `tool_call_id?: string` field that Python **never** writes. This is misleading — any code that keys on `tool_call_id` will never find a value.

Python's `ToolResultContent.to_storage_dict()` only writes:
- `tool_use_id` — Anthropic
- `call_id` — OpenAI

The `tool_call_id` field should be **removed** from `CxToolResultContent`:

```ts
// REMOVE this field:
tool_call_id?: string;
```

---

## Issue 3 — ACTIVE BUG: Base64-only media blocks silently dropped

**File:** `lib/chat-protocol/from-db.ts`
**Function:** `convertMediaContent`

**What breaks:** When an image (or other media) was stored with only `base64_data` — no `url` and no `file_uri` — the block is silently dropped. This can happen with any inline media that was never uploaded to a CDN/GCS before persistence.

**Root cause:** `MediaBlock.url` is a required field, so the converter returns `null` when neither `url` nor `file_uri` is present, even though `base64_data` holds the full content.

**Current code:**
```ts
function convertMediaContent(block: CxMediaContent): MediaBlock | null {
    const url = block.url ?? block.file_uri ?? null;
    if (!url) return null;   // ← drops base64-only blocks
    ...
}
```

**Fix:** Synthesize a data URL from `base64_data` as a final fallback:

```ts
function convertMediaContent(block: CxMediaContent): MediaBlock | null {
    let url: string | null = block.url ?? block.file_uri ?? null;
    if (!url && block.base64_data) {
        const mime = block.mime_type ?? 'application/octet-stream';
        url = `data:${mime};base64,${block.base64_data}`;
    }
    if (!url) return null;
    return {
        type: 'media',
        kind: block.kind,
        url,
        ...(block.file_uri ? { fileUri: block.file_uri } : {}),
        ...(block.mime_type ? { mimeType: block.mime_type } : {}),
    };
}
```

Note: The cast `block.kind as MediaBlock['kind']` inside the current `return` can also be removed — both types now share the same `kind` union including `'youtube'`, so no cast is needed.

---

## Issue 4 — COMPLETED FIX: Stuck loading spinner on tool calls

**Root cause:** `ToolCallVisualization` determined `currentPhase` by checking whether the
last entry in `toolUpdates` had `type === "mcp_output"`. This broke because:
- Progress (`user_message`) entries come **after** `mcp_output` in the old adapter output order.
- Any tool with progress messages after its result showed a spinner forever.

**Fix applied:**
1. Added `phase?: ToolCallPhase` to `ToolCallObject` (in `lib/api/tool-call.types.ts`).
2. `toolCallBlockToLegacy` now emits the canonical `phase` on the `mcp_input` entry.
3. `ToolCallVisualization` reads `phase` from the `mcp_input` entry instead of inferring from array position.
4. Legacy fallback retained: if `phase` is absent, check `any entry.type === 'mcp_output'`.

**DO NOT** infer tool execution phase from the type or position of ToolCallObject entries.
**ALWAYS** use `entry.phase` from the `mcp_input` entry.

---

## Issue 5 — COMPLETED FIX: Tool updates not rendering in Redux-backed routes

**Affected routes:** `ai/prompts/run/[id]`, `ai/prompts/edit/[id]`

**Root cause:** `EnhancedChatMarkdown` used `useMemo(() => store.getState())` to read
Redux — a manual snapshot, not a subscription. New tool events dispatched to Redux were
never reflected in the UI because the `useMemo` deps did not include Redux state changes.

**Fix applied:** Extracted a dedicated `ReduxToolVisualization` component that uses
`useSelector` for a live Redux subscription. This component is mounted alongside text
blocks only when `hasReduxProvider && taskId && toolUpdatesProp === undefined`. It
re-renders only when `rawToolEvents` changes, not on every text chunk.

---

## Issue 6 — ONGOING: Routes that need migration to canonical rendering

Per `MIGRATION_AUDIT.md`, the following routes still use the legacy tool event engine
(`tool-event-engine.ts` / `ToolCallObject[]` directly) and should eventually be migrated
to consume `CanonicalBlock[]` directly:

- `features/chat/` — authenticated chat (low priority, working)
- `features/public-chat/MessageDisplay.tsx` — uses `buildStreamBlocks` from old engine

The legacy engine and `toolCallBlockToLegacy` adapter can be removed once these are migrated.
