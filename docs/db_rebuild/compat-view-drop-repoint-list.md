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

## Not ours: the scheduler 400 flood

The repeating prod `column sch_task.trigger_type does not exist` (400) is **matrx-extend's** context-match poller filtering `sch_task.trigger_type` — but trigger type lives on **`sch_trigger.type`**. Confirmed NOT aidream (`SchTask` model has no such field; all reads `select("*")` or pull it from the `sch_trigger` child) and NOT matrx-frontend FE (no such filter; only type defs). The `sch_*` schema is correct and was never touched by the changeover.
