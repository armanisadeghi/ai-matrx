# Tool Call Visualization — Expansion Guide

**Last updated:** 2026-06-19  
**Skill for hardcoded renderers:** `.cursor/skills/create-tool-renderer/SKILL.md` (updated same date)

This doc is the operational snapshot for adding many new tool UIs. Architecture details live in `FEATURE.md`.

---

## Mental model

One canonical renderer contract. One shell (`ToolCallVisualization`). Three resolution tiers. Two data ingress paths (live stream vs persisted).

```
Python NDJSON  ──► process-stream.ts ──► activeRequests.toolLifecycle[callId]
                                              │
cx_message + cx_tool_call (reload) ──► observability.toolCalls + message parts
                                              │
                                              ▼
                         ToolLifecycleEntry  ──►  ToolCallVisualization (shell)
                                              │
                         getInlineRenderer(toolName)
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        Static registry   Dynamic (tool_ui)   GenericRenderer
        renderers/*       DB + Babel compile  (default fallback)
```

**No intermediate shapes.** Renderers consume `ToolLifecycleEntry` directly. Optional `events: ToolEventPayload[]` for step-driven UIs.

---

## The renderer contract (`types.ts`)

```ts
interface ToolRendererProps {
  entry: ToolLifecycleEntry;           // primary — always
  events?: ToolEventPayload[];         // raw per-call log — live path only today
  onOpenOverlay?: (tabId?: string) => void;
  onOpenWindowPanel?: (tabId?: string) => void;
  toolGroupId?: string;                // mirrors entry.callId
  isPersisted?: boolean;               // true for DB-loaded turns
}
```

### `ToolLifecycleEntry` (from `features/agents/types/request.types.ts`)

| Field | Source (live) | Source (persisted) |
|---|---|---|
| `callId` | `ToolEventPayload.call_id` | `cx_message` tool_call block `call_id` / `id` |
| `toolName` | wire `tool_name` | `cx_tool_call.tool_name` (canonical — **registry key**) |
| `displayName` | starts as `toolName`; may differ after reload | usually `toolName`; `tool_name_as_called` exists on row but not wired into card yet |
| `status` | `started \| progress \| step \| result_preview \| completed \| error` | `completed` or `error` only |
| `arguments` | `tool_started` → `data.arguments` | merged from `cx_tool_call.arguments` + message stub |
| `result` | `tool_completed` → `data.result` | `cx_tool_call.output` (JSON-parsed in `DbToolCard`) |
| `errorMessage` | `tool_error.message` | `cx_tool_call` error fields / output on failure |
| `latestMessage` / `latestData` | progress events | **null** (not persisted into entry today) |
| `events[]` | appended on every wire event | **[]** ( `execution_events` on row exists but **not** mapped into entry yet) |

**Registry lookup always uses `entry.toolName` (canonical), never `displayName`.**

---

## Wire format (`types/python-generated/stream-events.ts`)

```ts
interface ToolEventPayload {
  event: "tool_started" | "tool_progress" | "tool_step" | "tool_result_preview"
       | "tool_completed" | "tool_error" | "tool_delegated";
  call_id: string;
  tool_name: string;
  timestamp?: number;
  message?: string | null;
  show_spinner?: boolean;
  data?: Record<string, unknown>;  // arguments, result, preview, step metadata, …
}
```

`process-stream.ts` maps each event → `upsertToolLifecycle` on `activeRequests.byRequestId[requestId].toolLifecycle[callId]`.

---

## Database shapes

### `public.cx_tool_call` (one row per invocation)

Key columns: `call_id`, `tool_name`, `tool_name_as_called`, `arguments` (jsonb), `output` (text, often JSON string), `output_preview` (jsonb), `execution_events` (jsonb array of wire events), `success`, `is_error`, `error_message`, `status`, `iteration`, `user_request_id`, `message_id`.

Loaded into Redux as `CxToolCallRecord` in `observability.toolCalls`, indexed by UUID and by `call_id`.

### `cx_message.content[]` (assistant message parts)

```ts
{ type: "tool_call", call_id: string, name: string, arguments: Record<string, unknown> }
{ type: "tool_result", call_id: string, name: string, content: unknown, is_error?: boolean }
```

V2: `role: "tool"` messages are stubs — results join onto the preceding assistant message via `call_id`.

### `public.tool_ui` (dynamic renderers — was `tool_ui_components`)

| Column | Purpose |
|---|---|
| `tool_name` | matches `entry.toolName` |
| `inline_code` / `overlay_code` | TSX compiled at runtime |
| `header_subtitle_code` / `header_extras_code` | optional header fns |
| `utility_code` | shared helpers |
| `contract_version` | **2 = current** (`ToolRendererProps`); v1 rows stub to GenericRenderer |
| `keep_expanded_on_stream` | same semantics as static registry |
| `display_name`, `results_label`, `allowed_imports`, `is_active`, `semver` | metadata |

Fetched by `dynamic/fetcher.ts` from `tool_ui` where `is_active = true`.

---

## How data reaches the UI

### Path A — Live stream (chat during execution)

1. NDJSON `tool_event` → `process-stream.ts` → `toolLifecycle[callId]`
2. Timeline gets `tool_started` → `selectUnifiedSlots` emits `{ kind: "tool", callId }`
3. `EnhancedChatMarkdown` renders `<InlineToolCard requestId callId />`
4. `InlineToolCard` selects `selectToolLifecycle(requestId, callId)` → `<ToolCallVisualization entries={[lifecycle]} requestId=… />`
5. Expanded body calls `getInlineRenderer(entry.toolName)` with `events={entry.events}`

### Path B — Persisted / reloaded conversation

1. `load-conversation` loads `cx_message` + `cx_tool_call` → `observability.toolCalls`
2. `selectMessageInterleavedContent` walks message parts; on `tool_call` joins `observability.toolCalls` by `call_id`
3. Emits `ContentSegmentDbTool` → `<DbToolCard />` builds synthetic `ToolLifecycleEntry` (terminal only, `events: []`)
4. `<ToolCallVisualization isPersisted entries={[entry]} />` — no `requestId` (snapshot window mode)

### Path C — Non-agent surfaces (public chat, markdown blocks)

`toolCallBlockToLifecycleEntry(ToolCallBlock)` — best-effort from chat-protocol blocks; no `events`, placeholder timestamps.

---

## Default path vs custom path

### Default path — `GenericRenderer`

**Triggered when** `getInlineRenderer(toolName)` finds:

1. No static registry entry, **and**
2. No compiled dynamic renderer (fetch returned null / compile failed / v1 contract), **or**
3. `isKnownNoDynamic(toolName)` negative cache

**What users see:**

- **Collapsed row:** verb-phrase label from `getToolPhaseLabel` (fallback: raw `displayName` + `failed: reason` on error). No status icons — shimmer while running.
- **Expanded body:** activity messages from `events` or `latestMessage`, result preview/stats, link to overlay.
- **Overlay:** Results (GenericRenderer again) | Input (arguments) | Raw (full entry JSON).

GenericRenderer is intentional — ship fast, refine later.

### Custom path — static hardcoded

**Triggered when** `toolName` exists in `registry/registry.tsx` → `toolRendererRegistry[toolName].InlineComponent`.

13 tools registered today: `web_search`, `news_get_headlines`, `seo_check_meta_tags_batch`, `seo_check_meta_titles`, `seo_check_meta_descriptions`, `web_search_v1`, `core_web_search`, `research_web`, `core_web_search_and_read`, `get_user_lists`, `core_web_read_web_pages`, `rag_search`, `random_wheel`.

**Add one:**

1. `renderers/<kebab-name>/<Tool>Inline.tsx` (+ optional Overlay)
2. Register in `toolRendererRegistry` with `phaseLabels`, optional `keepExpandedOnStream`, `getHeaderSubtitle`, `getHeaderExtras`, optional `OverlayTabs`
3. Test at `/demos/api-tests/tool-testing`

### Custom path — dynamic (DB)

**Triggered when** static miss **and** active `tool_ui` row compiles successfully.

Resolution order in `getInlineRenderer`:

1. Static registry
2. Cached dynamic compile
3. `DynamicInlineRenderer` (fetch + compile on mount; prefetch on shell mount)
4. `GenericRenderer`

Author at `/administration/mcp-tools/[toolId]/ui` or via generator prompt (`admin/tool-ui-generator-prompt.ts`).

Dynamic renderers **do not** support `OverlayTabs` yet — single overlay component only.

---

## Shell behavior (`ToolCallVisualization`)

Every tool — default or custom — shares the same chrome:

| Behavior | Detail |
|---|---|
| Default collapsed | Single transcript line: `phaseLabel` · optional query subtitle · chevron |
| Auto-expanded | Tool has custom renderer **and** `keepExpandedOnStream: true` |
| Phase labels | `phaseLabels: { running, complete, errorPrefix? }` on registry entry |
| Expand click | Renders `InlineComponent` (custom or Generic) |
| Overlay / window | Hover actions; `ToolUpdatesOverlay` or `toolCallWindow` panel |

Custom renderers render **inside** the expanded region only. They do not own the collapsed row label (registry `phaseLabels` + shell do).

---

## Persisted vs live — renderer author checklist

| Concern | Live stream | Persisted (DbToolCard) |
|---|---|---|
| Progressive UI | `entry.status`, `events`, `latestMessage` | Terminal only — treat as read-only snapshot |
| Step-driven tools (Brave, web research) | Use `filterStepEvents(events, …)` | **Broken today** — `events: []`; must fall back to `entry.result` parsing |
| `isPersisted` prop | `false` | `true` — prefer compact layout |
| Window panel live sync | `requestId` set → subscribes to all tools in request | Snapshot mode — fixed `entries` |

**Gap to fix at scale:** map `cx_tool_call.execution_events` → `entry.events` in `DbToolCard` so persisted deep-research / brave tools match live UI.

---

## Resolution quick reference

```
toolName
  ├─ in toolRendererRegistry?     → Static Inline/Overlay/OverlayTabs
  ├─ in dynamic cache?            → Compiled Inline/Overlay
  ├─ mightHaveDynamicRenderer?    → DynamicInlineRenderer (async fetch)
  └─ else                         → GenericRenderer
```

Overlay: same order via `getOverlayRenderer` / `getOverlayTabs`.

---

## Skill status (`.cursor/skills/create-tool-renderer/SKILL.md`)

Was **stale** as of 2026-06-19 (accordion UI, status icons, missing `phaseLabels` / `OverlayTabs` / `onOpenWindowPanel`, wrong table name `tool_ui_components`, `seo-keywords` path). Updated in same PR pass as this doc.

**Use the skill for hardcoded renderers.** Use admin UI + generator for dynamic. Read `WebResearchInline.tsx` for streaming gold standard; `RagSearchInline.tsx` for result-only tools.

---

## Change log

- `2026-06-19` — Initial expansion guide: dual ingress paths, default vs custom resolution, DB shapes, persisted gaps.
