# System Context — Roadmap & Pending Work

The living backlog for the **System Context** admin (`/administration/system-context`) and the
feed model behind it. Cross-repo companion (backend + arc): `aidream/docs/ctx_context/CONTEXT_SYSTEM_HANDOFF.md`.

**The model in one line:** a System Context resource = a **DEFINITION + a FEED**. The value is the
feed's *output*, not the authored thing. Feeds: `dataset | manual | computed | agent | api | web`.
A resource resolves for **every user with no scope selected** (its scope type is `is_system` in the
member-less `matrx-system` org).

---

## Shipped & live-verified (2026-06-25)

| Piece | Where | Status |
|---|---|---|
| Feed model columns | `migrations/ctx_context_item_feed_model.sql` (+ `ctx_feed_type_add_web.sql`) | applied + ledgered |
| Feed-type-first Add/Edit, table Feed/Output cols | `page.tsx`, `parts/FeedConfigEditor.tsx` | live |
| **Dataset feed** (pick a real RAG data store) | `FeedConfigEditor` `DatasetFeedConfig` + `useLibraryCatalog` | live (AMA Guides) |
| **Dataset → agents** (resolver emits a pointer) | `migrations/ctx_resolve_full_context_dataset_pointers.sql` (loop 4c) | applied + verified |
| Manual value (component-aware) | `EditItemDialog` / `AddItemDialog` + `ItemValueField` | live |
| "Preview agent context" | `route.ts` `GET ?preview=1` + `PreviewDialog` | live |
| Open-source + create links on every linked item | `feedSourceLink` / `feedCreateLink` / `OpenSourceLink` | live |
| Create category / item, delete, per-item edit | `route.ts` POST/PATCH/DELETE | live |

**Auth model (load-bearing):** all writes use the service client EXCEPT the `is_system` flip, which the
DB trigger gates on `is_super_admin()` vs the live JWT — so that one call uses the caller's authed client.

---

## Pending work — prioritized

### 1. Scheduler feed — "refresh this value on a cadence" (NEXT BIG ONE)

The scheduler already runs 7 system cron jobs through a clean registry. Adding a context-item refresh is
"one `register_system_task` + a handler + a seeded task" — the plumbing exists.

**Ground truth (verified by reading the code):**
- Handler registry: `aidream/aidream/services/scheduling/system_task_runner.py` — `register_system_task(name, handler)`, registered in `register_builtin_system_tasks()`.
- A `kind='tool'` task carries `sch_agent_task.variables = { tool_name, args }`. The handler receives `ToolRunInput { user_id, tool_name, args, task_id, run_id }` and returns `AgentRunResult { success, result_summary, error_message, metadata }` (`packages/matrx-scheduler/matrx_scheduler/models.py`).
- Task creation: `create_agent_task` in `aidream/db/managers/chat/agent_task.py`; the FE reader `lib/services/scheduling-admin-service.ts` filters `.eq("kind","agent")`. Both are agent-scoped today — **widen to accept `kind='tool'`** carrying `variables.tool_name` + `variables.args` (verify the manager's exact signature before editing).

**Build recipe:**
1. **aidream** — add `_run_refresh_context_item(input)` to `system_task_runner.py`:
   - `args = { context_item_id, scope_id, feed_type, feed_config }`.
   - Dispatch on `feed_type` to the executor (see #2/#3); get the produced value.
   - Write it via the **canonical per-turn write path** (invoke the `matrx-persistence` skill — Session/Coordinator, NOT a raw insert) into `ctx_context_item_values` (new row; the DB trigger flips `is_current`/`version`), then stamp `ctx_context_items.feed_status='ok'|'error'`, `last_fed_at=now`, `feed_error`.
   - Register as `REFRESH_CONTEXT_ITEM_TOOL_NAME = "refresh_context_item"`.
2. **DB migration** (BLOCKED this session — Supabase MCP unavailable): widen `create_agent_task` RPC for `kind='tool'` + `tool_name`/`args`; regenerate types.
3. **FE** — a "Refresh schedule" control on the feed editor (cron field already drafted in `FeedConfigEditor` for agent/api/web `feed_config.cron`) that, on save, creates the `sch_task` via `scheduling-admin-service.ts` and stores `refresh_task_id` on the item. **Do NOT wire live task creation until the handler is deployed** — a task firing with no handler produces failing runs.
4. **Verify:** create a task, let it fire (or trigger manually via `/administration/scheduling`), confirm the value lands + `feed_status='ok'`.

**Dependency:** a scheduled refresh is only a *trigger* — it needs a feed executor (#2/#3) to produce the value. Build the API executor first; it's the most self-contained.

### 2. API feed executor (the new generic primitive)

No generic "call an HTTP endpoint + extract a value" capability exists (api-integrations = MCP-only; action-catalog = internal-table CRUD). Build a generic executor:
- **aidream** — a `POST /context/feed/run` (or a service fn) that reads `feed_config { endpoint, method, headers, body, auth_secret_id, extraction }`, does the outbound fetch, applies the extraction (JSONPath/jq), returns the value. Reuse `user_secrets` for auth (never client-side). Model it on the action-catalog execute-envelope + receipt pattern. NOT a Next.js route (no middle tier).
- Doubles as a future **agent HTTP tool** — build it generic.
- **FE** config already drafted in `FeedConfigEditor` `DefinitionFeedConfig` (method/endpoint/extraction/cron).

### 3. Agent feed executor

Run an agent (optionally with a JSON output schema) to produce the value, with a **merge policy** (replace | additive | merge). Reuse the agent runner + structured output. FE config drafted (prompt/merge/cron). Note: `agent_runner_adapter.py` already exists in aidream scheduling for `kind='agent'` runs — study it before wiring.

### 4. Web / scrape feed + browser extraction patterns

The `web` feed type exists. Wire it to:
- Our **scraper** (`features/scraper/`) for server-side page fetch + extraction.
- The **matrx-extend Chrome plugin ShowcaseView** (`/Users/armanisadeghi/code/matrx-extend/src/features/showcase/ShowcaseView.tsx`) — its **saved extraction patterns** (AI Extract / List Pattern / Patterns) are exactly a reusable feed source. This is a user-facing feature in its own right; the connection is via the `connect-matrx-extend` bridge. Store `feed_config { url, pattern_id, extraction }`.

### 5. Dataset sub-resource selectors ("just the tables / the KG")

A dataset resource decomposes into addressable sub-resources (chunks / `chunk_kind='table'` / `table_row` / `section_summary` / KG entities / page images — all off `data_store_id` via `(source_kind, source_id)`). Today only the whole `data_store_id` is addressable.
- **aidream** — add a `chunk_kind`/`derivation_kind` filter to `RagSearchArgs` + `matrx_rag.search`.
- **FE** — a multi-select in `DatasetFeedConfig` writing `feed_config.parts = ['table', ...]`.
- **Resolver** — loop 4c already carries `feed_config`; extend the pointer descriptor with `parts`.

### 6. Auto-arm the RAG tool from a dataset pointer

Today the resolver emits a dataset *descriptor* (name + `data_store_id` + "use rag_search" hint) — the agent must call `rag_search(data_store_id=…)` itself. Next: auto-arm the RAG tool with the pointer's `data_store_id` during agent prep (`context_engine` / tool arming) so the agent queries it with zero friction.

### 7. Computed feed — user-defined code

`_apply_ambient` (`packages/matrx-ai/matrx_ai/context_engine.py`) is a closed 5-key dict (the reserved `current_*` keys), no extension point. A user-defined computed feed (expression/code evaluated at resolution) is **security-sensitive** — do LAST, with a sandbox/whitelist. A few more hard-coded computes are fine in the interim.

### 8. Class 2 / Class 3 authoring polish

- **Class 2 (curated globals)** — stored values refreshed by the scheduler (covered by #1–#3).
- **Class 3 (industry datasets)** — the publish-to-industry flow (`rag.data_store_grants`) already exists at `/rag/data-stores` (`DataStorePublishPanel`). Consider surfacing "publish a new dataset to an industry" inline from the System Context dataset picker (reuse `useDataStoreGrants`), so creating + publishing + linking is one flow.

---

## Smaller / cleanup

- **Open in window panel** (vs new tab): `OpenSourceLink` uses a new tab today. If a canonical resource-window opener lands, offer window-panel open too (the user asked for "either").
- **Edit-item metadata dialog reuse**: `EditItemDialog` edits name/description/sensitivity/feed; confirm it covers component edits for manual items with a `custom_component`.
- **Andon (low-risk)**: `set_value` / preview trust a client-supplied `scopeId` / user id; super-admin-gated, but re-derive server-side if this surface ever widens.
- **Per-feature admin map**: consider a `/system-context` entry in the admin map primitive (`features/admin/types/featureAdminMap.ts`).
- **`refresh_task_id`** column exists on `ctx_context_items` but is unused until the scheduler ships (#1).

---

## Session constraints note (2026-06-25)

The scheduler DB migration (`create_agent_task` widen) and any live/browser verification were **blocked** in
the session that wrote this: the Supabase MCP disconnected (needs re-auth) and the preview MCP was gone. All
scheduler/executor items above are therefore *specified, not shipped*. When picking them up: re-auth Supabase
(for migrations), and secure a way to verify against aidream (local run or deploy) before claiming done.
