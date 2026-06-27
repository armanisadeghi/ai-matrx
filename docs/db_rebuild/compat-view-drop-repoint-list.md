# Compat-view drop — repoint list (aidream consumers)

> The `file_*` and `ctx_war_room_*` renames left **security_invoker compat views** at the old names, so aidream keeps working **today**. Before ever **dropping** those views, repoint the references below to the new names. Source: live read-only audit of `/Users/armanisadeghi/code/aidream`, 2026-06-24.

## Why nothing is broken now (consumer-safety, verified)

The additive retrofit columns (`organization_id`/`created_by`/`updated_by`/`version`/`deleted_at`/`metadata`) **cannot** break aidream reads:
- matrx-orm hydrates rows via `Model.__init__` and funnels unknown columns into `self._extra_data` — never rejects (`packages/matrx-orm/matrx_orm/core/base.py:494-501`).
- The ORM read/output schema is **`extra="allow"`** (`packages/matrx-orm/matrx_orm/core/pydantic_bridge.py:297`); `extra="forbid"` is **input/write-only** (`:270`).
- Inserts are **named-dict payloads** (e.g. `aidream/api/virtual/adapters/notes_adapter.py:309`), so new nullable-default columns are untouched.
- `db/models.py` is **already regenerated** with the new columns **and** the new names (`CldAnalysis`, `CldPages`, `WrSessions`, `WrTiles`).

The 747 `.model_validate(` calls are API schemas / LLM-output parsers, not DB-row readers. The one `forbid` model near agx (`BuiltAgentDraft`, `services/agent_factory/builder.py:66`) parses **LLM JSON**, not a table row.

## `file_*` → `cld_*` — LIVE, includes raw SQL (must repoint before view drop)

- **Live services (load-bearing):** `aidream/services/file_analysis/persistence_impl.py:3,92,152,181` (**raw SQL** `UPDATE public.file_analysis` @181), `services/file_analysis/pipeline.py:252,335`, `services/file_analysis/coverage.py:17,118,140`, `services/file_entities/service.py:1,128`, `services/file_pages/service.py:1,15,169,181,265` (raw SQL `public.file_overrides` @181), `services/file_pages/__init__.py:1`, `services/file_annotations/service.py:200`.
- **Routers/wiring:** `aidream/api/app.py:1631,1633,1639,1642,1649`, `api/routers/file_analysis.py:305,311`, `api/routers/file_annotations.py:405,440`, `api/routers/file_render.py:22`, `db/fx_managers.py:4`, `db/watchdog_configs.py:4`.
- **Ops raw SQL:** `scripts/backfill_stuck_rows.py:84,87,89,159,160`.
- **Packages mirror:** `packages/matrx-utils/matrx_utils/file_handling/analysis/persistence.py:7`.
- **Legacy generated managers:** `db/managers/file_analysis.py`, `file_analysis_result.py`, `file_entities.py`, `file_overrides.py`, `file_page_annotations.py`, `file_pages.py`, `file_structure.py`.
- **Tests:** `tests_trials/db_migration/test_file_analysis_extracted_text_parity.py`, `test_file_entities_parity.py`.

## `ctx_war_room_*` → `wr_*` — mostly DEAD (managers unwired)

- `db/managers/ctx_war_room_*.py` (6 files) — **not imported anywhere live** (dead; safe).
- **Only 2 live string refs to repoint** → `wr_sessions` / `WrSessions`:
  - `aidream/services/references/resources.py:69` — `("war_room_session","CtxWarRoomSessions","ctx_war_room_sessions",...)`
  - `aidream/services/action_catalog/catalog.py:79` — `("War Room","war_room_session","ctx_war_room_sessions",...)`

## `cx_*` → `chat.*` — AI schema reorg (NEW, 2026-06-26)

> The `cx_*` tables moved out of `public` into the new **`chat`** schema, prefix dropped (`public.cx_conversation` → `chat.conversation`, etc.). Each old name is now a `security_invoker` pass-through **VIEW** in `public`, so everything keeps working today. 21 tables. `chat` is exposed to PostgREST (verified live) alongside `agent, ai, app, context, skill, tool, workspace`. Before dropping the 21 shim views, repoint the consumers below.

**Mapping:** drop the `cx_` prefix. `cx_conversation`→`chat.conversation`, `cx_message`→`chat.message`, `cx_request`/`cx_request_snapshot`/`cx_user_request`, `cx_tool_call`/`cx_tool_trace`, `cx_artifact`, `cx_media`, `cx_agent_memory`/`cx_agent_plan`/`cx_agent_task`, `cx_observational_memory`(`_event`), `cx_pending_injection`, `cx_user_todo`, `cx_user_usage_summary`, `cx_working_documents`, `cx_conversation_documents`, `cx_code_edit`/`cx_code_message_file`. (Enums stayed in `public`: `cx_plan_status`, `cx_agent_task_*` — referenced cross-schema by the generated types, no move needed.)

### matrx-frontend — DONE (this PR, repoint commit)
- **117 `.from('cx_x')` callsites → `.schema('chat').from('x')`** across 29 files. `chat` added to `pnpm db-types` (`--schema chat`); `database.types.ts` regenerated with the `chat` block.
- **4 realtime `postgres_changes` subscriptions** repointed `schema:"public",table:"cx_x"` → `schema:"chat",table:"x"` (`SidebarChats`, `agent-lists.thunks` ×3, `useWorkingDocument`). These were **silently dead** post-move — `public.cx_*` is a view and views don't emit realtime; the base tables are in the `supabase_realtime` publication under `chat.*`, so this repoint *fixes* them.
- **Type aliases** repointed off `Database["public"]["Tables"]["cx_*"]` (now Views, would not type) → `Database["chat"]["Tables"]["*"]`: `features/{cx-chat,public-chat}/types/cx-tables.ts` (`ChatSchema = Database["chat"]`), `conversation-bundle.ts`, `voiceTranscriptWriter.ts`, `refetch-single-message.thunk.ts`, `MemoryStateInspector.tsx` (`Tables<{schema:"chat"},"observational_memory">`).
- **`resource-catalogue.ts`** conversation entry → `table:"conversation", schemaName:"chat"` (consumers already honor `schemaName`). **`shareKey` left `cx_conversation`** — it's the `permissions.resource_type` / `shareable_resource_registry` grant key, decoupled from schema; verify the registry value before changing it.
- **NOT changed (correct):** `.rpc('cx_*')` / `.rpc('get_cx_*')` call names — the reorg moved **tables, not functions**; those functions still live in `public` with their `cx_` names. The embedded-select alias `cx_user_request:user_request_id(...)` in `recover-dropped-stream.thunk.ts` is cosmetic (FK-resolved). `types/python-generated/stream-events.ts` `table:"cx_*"` literals are **generated** from the aidream backend — regenerate from the backend, don't hand-edit.

### DB functions — repoint bodies BEFORE the shim drop (gated; coordinate by owner)
24 live functions read `cx_*` in their bodies (via the shims). **Automated `cx_→chat.` substitution is UNSAFE** — the token also appears in function names (`cx_message_set_content`), CTE aliases, and plurals (`cx_conversations`). Rewrite only genuine `FROM/JOIN/UPDATE/INTO` table refs, per function, and verify live. Repointing only the FE half is pointless: the shim stays alive until aidream's functions are repointed too, so do these as **one coordinated batch at drop time**.

Ownership from `public._schema_migrations` ledger + aidream source audit:

| Function | Real `cx_` table refs | Owner |
|---|---|---|
| `cx_fork_conversation` | conversation, message, tool_call, artifact, media | **aidream** |
| `cx_message_edit` | conversation, message | **aidream** |
| `cx_soft_delete_conversation` | conversation, message, request, user_request, tool_call, artifact, media | **aidream** |
| `get_cx_conversation_bundle` | conversation, message, tool_call, artifact, media | **aidream** |
| `cx_canvas_upsert` / `cx_canvas_update_version` | message | **aidream** (canvas family) |
| `fn_cx_user_usage_summary_apply` / `fn_get_user_usage_snapshot` | user_usage_summary | **aidream** |
| `get_agent_usage_stats` | request, user_request | **aidream** |
| `resolve_full_context` | conversation | **contested** — FE applied latest patches (`ctx_resolve_full_context_*`), aidream also calls it; repoint in aidream source to avoid deploy-clobber |
| `get_conversation_for_display` / `get_conversation_messages_for_display` / `get_conversation_messages_for_model` | conversation, message | **uncertain** — no FE-ledger migration, 0 aidream refs (applied-direct?); confirm owner before touching |
| `get_agent_conversations` / `get_cx_conversations_shared_with_me` | conversation | **uncertain** — same |
| `iam.can_access_conversation` | conversation | **iam infra** (canonical RLS) — repoint with the iam generator |
| `agx_usage_history_counts` | conversation, message, user_request | **matrx-frontend** (`agx_usage_005…`) |
| `get_task_associations` | conversation, message | **matrx-frontend** (`ctx_get_task_associations_cld_files`, `fix_get_task_associations_graveyard_refs`) |
| `cx_code_history_upsert` | code_edit, code_message_file, conversation, message | **matrx-frontend** (`cx_code_edit_history`) |
| `get_cx_conversation_source_facets` | conversation | **matrx-frontend** (`cx_conversation_source_facets`) |
| `cx_message_set_content` | conversation, message | **matrx-frontend** (`cx_message_set_content_and_status_fix`) |
| `cx_message_soft_delete` | conversation, message, tool_call, artifact, media | **matrx-frontend** (`cx_message_soft_delete_and_truncate`) |
| `cx_truncate_conversation_after` | conversation, message, tool_call, artifact, media | **matrx-frontend** (`cx_message_soft_delete_and_truncate`) |
| `get_user_dashboard_metrics` | conversation | **matrx-frontend** (`get_user_dashboard_metrics`) |

### aidream — Python consumers (audit + repoint in that repo)
matrx-orm models + any raw SQL that read/write `public.cx_*` keep working through the shims today (the views pass reads/writes through with RLS). Before the view drop: regenerate `db/models.py` to point the cx models at the `chat` schema, repoint raw-SQL `public.cx_*` references, and the function bodies in the **aidream** column above. Gate the drop on `platform.v_deprecated_table_access` → 0 for every `cx_*` name + PITR.

## Not ours: the scheduler 400 flood

The repeating prod `column sch_task.trigger_type does not exist` (400) is **matrx-extend's** context-match poller filtering `sch_task.trigger_type` — but trigger type lives on **`sch_trigger.type`**. Confirmed NOT aidream (`SchTask` model has no such field; all reads `select("*")` or pull it from the `sch_trigger` child) and NOT matrx-frontend FE (no such filter; only type defs). The `sch_*` schema is correct and was never touched by the changeover.
