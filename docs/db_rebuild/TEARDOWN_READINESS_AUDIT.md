# Teardown-readiness audit — surviving refs to old tables/columns

> Generated 2026-06-26 by a 6-agent parallel sweep of matrx-frontend (`*.ts`, `*.tsx`, `migrations/*.sql`, generated types) ahead of dropping the compat shim views + legacy columns described in `DB_TRANSITION_PENDING.md`. Companion to `compat-view-drop-repoint-list.md` (which audited aidream).

---

## ⚡ 2026-06-26 — LIVE-VERIFIED against the DB + EXECUTED (read this first)

The original audit below was a **worst-case sweep of the static files**. Cross-checking every flagged item against the **live DB** (`pg_get_functiondef`, `pg_class`, `pg_publication_tables`) changed the picture dramatically — **most of it was already repointed live**; the migration *files* are just stale. Net state after this session:

**Live-verified FALSE ALARMS (no action needed — files lag the DB):**
- `check_resource_access` — live body already uses `iam.memberships` (`container_type='project'`), NOT `ctx_project_members`. Not broken.
- `resolve_full_context`, `get_task_associations`, `get_user_full_context`, `set_entity_scopes` — live bodies already read `chat.*` / `platform.associations`; **zero** `cx_*`-view or `ctx_scope_assignments` refs. The "contested function" risk is moot.
- `cx_message_soft_delete`, `cx_truncate_conversation_after`, `cx_message_set_content`, `get_cx_conversation_source_facets`, `cx_code_history_upsert`, `agx_usage_history_counts`, `get_user_dashboard_metrics` — all already on `chat.*` live.
- `pdf_resolve_file_page_link` — reads `files.files` + `processed_document_pages`, never `file_pages`. Safe.

**Canonical-name corrections (the agents guessed `cld_*`; truth from live DB):**
- `file_*` → **`files.*` schema** (`files.analysis`, `files.pages`, …), NOT `public.cld_*`. `cx_*` → `chat.*`. war-room → `workspace.*`. All confirmed in the `supabase_realtime` publication for the 4 realtime targets.

**FIXED + verified this session:**
- ✅ DB: `pdf_link_file_pages_for_new_page` trigger — the **only** real live DB straggler — repointed `file_pages` → `files.pages` (`migrations/pdf_repoint_link_trigger_to_files_pages.sql`, applied + live-verified + ledger-recorded).
- ✅ FE: 5 `file_*` rows in `utils/permissions/registry.ts` got `schemaName:"files"` + `physicalTable` (`analysis`/`entities`/`overrides`/`page_annotations`/`pages`). `conversation` entry + `agent-memory.service.ts` were already fixed by concurrent agents.
- ✅ FE: 4 realtime subs (`useFileAnalysis` ×2, `usePages`, `useAnnotations`) repointed to `schema:"files"`.
- ✅ Final sweep: **zero** breaking `.from('cx_*')` / `.from('file_*')` table calls remain; remaining `table:"cx_message"`/`"file_versions"`/`"file_rag_jobs"` hits are demo-data or `files`-schema tables not in the rename batch.

**Readiness now:** Drops **1a/1b/1c/1d are FE + our-DB ready.** The actual `DROP` of the shim views is the remaining step — and is **gated on cross-repo coordination I cannot verify from here**: aidream's Python consumers repointed, `platform.v_deprecated_table_access` → 0 for every name, and PITR. Do NOT pull the drop trigger until those gates are green. Drops **2 (tasks `user_id`/`is_public`) and 3 (litter `project_id`/`task_id`) remain intentionally HELD** — their FE+DB repoints are NOT done (columns still live; reads still depend on them — see sections below).

**Stale-file note:** `check:migrations` reports 17 DRIFTED migration files (e.g. `*resolve_full_context*`, `*task_associations*`, `mbr/inv/cmt/assoc_public_rpcs`). Pre-existing, non-blocking — concurrent agents edited the files; the live functions are already correct. Reconciling the ledger checksums is the changeover owners' call, not done here (would clobber in-flight edits on shared `main`).

---

**Original static-file audit (worst-case) follows — cross-reference with the live-verified status above before acting.**

## TL;DR readiness by drop

| Drop (from the teardown plan) | FE app code | DB function/trigger bodies (in matrx-frontend migrations) | Verdict |
|---|---|---|---|
| **1a. Drop `cx_*` chat shim views** | 2 real stragglers | ~9 functions still read `cx_*` | **NOT READY** — small, well-scoped |
| **1b. Drop `file_*` → `cld_*` shim views** | 4 realtime subs + 5 registry rows | 2 live PDF triggers read `file_pages` | **NOT READY** — small, well-scoped |
| **1c. Drop `ctx_war_room_*` / `wr_*` shim views** | 0 (fully repointed) | 0 live bodies; backfill must re-run first | **READY** after backfill re-run |
| **1d. Drop legacy `ctx_*` junctions** | 0 (fully repointed to iam/platform) | `check_resource_access` may ALREADY be broken; `resolve_full_context`/`get_user_full_context` read `ctx_scope_assignments` | **NOT READY** — see CRITICAL |
| **2. Drop `workspace.tasks.user_id` / `is_public`** | ~10 FE files | ~6 functions + sharing registry row | **NOT READY** |
| **3. Drop `project_id` / `task_id` litter columns** | 15+ files for `tasks.project_id` alone, + notes/artifacts/shortcuts/agents/canvas/skills | many | **FAR FROM READY** |

---

## CRITICAL — verify these may ALREADY be broken in prod

1. **`check_resource_access` reads `ctx_project_members` unqualified** — `migrations/perm_org_share_moderation.sql:76` (`SELECT 1 FROM ctx_project_members pm ...`). `graveyard_ctx_junction_tables.sql` moved `public.ctx_project_members` → `graveyard.*`, so with `search_path=public` this function may already 500 on project permission checks. FE callers: `utils/permissions/service.ts`, `utils/permissions/orgModeration.ts`. Repoint to `iam.memberships`. **Check live before anything else.**

---

## Drop 1a — `cx_*` → `chat.*` shim views

### FE app code — BREAKS
- **`features/agents/ui-first-tools/service/agent-memory.service.ts:15,31,47,60,71`** — `scratchpadDb = supabase as any` then `.from("cx_agent_memory")` ×5. The `as any` bypassed the repoint sweep. Fix: `.schema("chat").from("agent_memory")`.
- **`utils/permissions/registry.ts:148`** — `conversation` entry has `tableName: "cx_conversation"` with no `schemaName`/`physicalTable`. `service.ts` (`setVisibilityColumn`/`getResourceVisibility`/`isResourceOwner`) feeds it into `.from()`. Fix: add `schemaName:"chat", physicalTable:"conversation"`; keep the `resource_type` key (`cx_conversation`) for RLS parity (it is the permissions grant key, decoupled from schema — verify against `shareable_resource_registry` before changing).

### DB function bodies in migrations — BREAKS (repoint at drop time, coordinate ownership)
All read `cx_*` via the shim today; the *latest-applied* `CREATE OR REPLACE` is the live body (confirm vs `_schema_migrations`):
- `cx_message_soft_delete_and_truncate.sql` → `cx_message_soft_delete`, `cx_truncate_conversation_after` (cx_message/conversation/tool_call/artifact/media)
- `cx_message_set_content_and_status_fix.sql` → `cx_message_set_content`
- `cx_conversation_source_facets.sql` → `get_cx_conversation_source_facets`
- `cx_code_edit_history.sql` → `cx_code_history_upsert` (ownership subquery lines 249/252; the INSERTs into `cx_code_edit`/`cx_code_message_file` are REAL tables — safe)
- `get_user_dashboard_metrics.sql` → `get_user_dashboard_metrics` (also hits `workspace.tasks.user_id` — see Drop 2)
- `agx_usage_005_fix_history_counts_text_agent_id.sql` → `agx_usage_history_counts` (live version; supersedes `agx_usage_002`)
- `fix_get_task_associations_graveyard_refs.sql` (live `get_task_associations`) — JOINs cx_message/cx_conversation
- `ctx_resolve_full_context_*.sql` ×4 → `resolve_full_context` (**contested** with aidream — repoint in aidream source too to avoid deploy-clobber)

### SAFE (do not touch)
- `.rpc('cx_*')` / `.rpc('get_cx_*')` — functions stayed in `public`, not moved.
- Stream-payload discriminators (`d.table === "cx_message"` in process-stream.ts/selectors/debug) — SSE field values from aidream, not DB queries.
- Association `entity_type` strings (`"cx_conversation"` in TaskAttachmentsPanel, TaskQuickCreate, kg-suggestions, ShareModal routing) — semantic type tags, not table refs.
- `recover-dropped-stream.thunk.ts` embedded-select alias `cx_user_request:user_request_id(...)` — cosmetic FK alias.
- `resource-catalogue.ts` `shareKey:"cx_conversation"` — permissions grant key.
- `types/python-generated/*` — regenerate from backend, never hand-edit.

---

## Drop 1b — `file_*` → `cld_*` shim views

### FE app code — BREAKS
- **Realtime subs** (views don't emit realtime — already silently dead, repoint fixes them):
  - `features/file-analysis/hooks/useFileAnalysis.ts:56` `table:"file_analysis"` → `cld_analysis`
  - `useFileAnalysis.ts:69` `table:"file_analysis_result"` → `cld_analysis_result`
  - `usePages.ts:44` `table:"file_pages"` → `cld_pages`
  - `useAnnotations.ts:53` `table:"file_page_annotations"` → `cld_page_annotations`
- **Permissions registry `tableName`** (`utils/permissions/registry.ts` ~334–383, used by `service.ts:155,660`): `file_analysis`, `file_entities`, `file_overrides`, `file_page_annotations`, `file_pages` → `cld_*` (or add `physicalTable`). Do NOT change the `resourceType` keys without a `shareable_resource_registry` migration.

### DB trigger bodies — BREAKS (live!)
- **`migrations/pdf_page_bridge_unification.sql`** trigger fns `pdf_link_file_pages_for_new_page` (~L120) and `pdf_resolve_file_page_link` (~L137) update/read `file_pages`. These fire on every `processed_document_pages` INSERT and were never repointed. → `cld_pages`.

### SAFE
- `utils/schema/*` static descriptors holding `file_structure` (~30 spots) — client schema metadata, no `.from()`. Stale-but-not-breaking; regen later.
- `file_rag_jobs`, `file_versions` — `files` schema, NOT in this rename batch.
- No `.rpc('cld_check_rate_limit')` stragglers (renamed to `check_file_rate_limit`).

---

## Drop 1c — `ctx_war_room_*` / `wr_*` shim views

**FE: zero breaks.** Fully repointed to `workspace.war_rooms` / `workspace.threads` (`workspaceDb()` + constants `SESSIONS="war_rooms"`, `THREADS="threads"`). Remaining mentions are stale comments (`useActiveThreadRestore.ts:8,11,31`, `WarRoomShell.tsx:129`, `useRoomUrlSync.ts:11`) and admin-page doc strings (`app/(core)/war-room/admin/page.tsx`) — no DB calls.

**DB: zero live function bodies** read `ctx_war_room_*` via shim. `wr_read_api_security_definer.sql` reads `platform.associations` only.

**SEQUENCING:** `migrations/ctx_war_room_assoc_backfill.sql` reads the old names and is documented to re-run "immediately before the branch deploy." **Re-run it, THEN drop the views.**

---

## Drop 1d — legacy `ctx_*` junctions + `ctx_scope_assignments`

**FE: zero breaks** — repointed to `iam.*` + `platform.associations` RPCs (`assoc_set_targets`); `scopesService.ts` no longer calls `set_entity_scopes`.

**`ctx_scope_assignments` is the 7th junction, deliberately still live** (renamed to `_deprecated` behind a compat view + `_mirror_assoc` trigger). Before dropping it, repoint these DB bodies (all FE-called → would 500):
- `resolve_full_context` (`ctx_resolve_full_context_*.sql`; `app/api/admin/system-context/route.ts:274`)
- `get_user_full_context` (`repoint_project_member_trio_to_iam.sql:133`; `hierarchyService.ts:523`, `hierarchyThunks.ts:89`)
- `set_entity_scopes` (`ctx_set_entity_scopes_auth.sql`) — retire or repoint; confirm no aidream callers
- Drop the `_mirror_assoc` trigger (`assoc_m2m_mirror_triggers.sql`) first.
- RLS: `repoint_project_member_rls_to_iam.sql` — `cx_conv_select` policy is ON the `cx_conversation` *view*; base `chat.conversation` needs its own RLS (verify with iam generator).

---

## Drop 2 — `workspace.tasks.user_id` → `created_by`, `is_public` → `visibility`

### FE app code — BREAKS (all confirmed task-scoped via `workspaceDb().from("tasks")`)
- `features/tasks/services/taskService.ts` — interfaces (L23,36), INSERT `user_id` (L64), `.eq("user_id")` (L108,663), notify select (L867,871,877); JSDoc on makePublic/Private (L732,748) flags the indirect RPC break below
- `features/agent-context/service/hierarchyService.ts` — type L58, selects L160/175, `.eq("user_id")` L178, INSERT L418
- `features/agent-context/redux/tasksSlice.ts` — type L38, select L84, maps L159/187, INSERT L212/216
- `features/tasks/redux/thunks.ts:157`; `features/tasks/redux/selectors.ts:65` (`userId`), L66 (`isPublic` hardcoded false)
- `features/tasks/redux/taskAssociationsSlice.ts` — RPC response shapes L273,288,365,380
- `features/tasks/components/editor/TaskEditorBody.tsx:167,704,706` (Owner display)
- `app/api/cron/due-date-reminders/route.ts:48,87`
- Types: `features/tasks/types/database.ts:33` (`user_id`), `features/tasks/types/index.ts:17,18` (`userId`/`isPublic`)

### DB function bodies + registry — BREAKS
- `get_user_dashboard_metrics.sql:40` (`where user_id = uid`)
- `task_associations_canonical_repoint.sql` — INSERTs L115/159, access checks L48/91/195 (functions `create_task_with_association`, `create_tasks_bulk`, `get_task_associations`)
- `fix_get_task_associations_graveyard_refs.sql:26-27`, `ctx_get_task_associations_cld_files.sql:32-34` (visibility predicate)
- `create_project_from_json.sql:108,128` (INSERT `ctx_tasks ... user_id`)
- **`sharing_resource_registry_add_task.sql:28`** — registry row `('task','ctx_tasks','id','user_id','is_public',...)`. `make_resource_public`/`make_resource_private` build dynamic `UPDATE ... SET <is_public_column>` from this → crashes after column drop. Update to `created_by`/`visibility` (or rewrite RPCs to the enum).
- `repoint_project_member_rls_to_iam.sql:62` — RLS on `ctx_tasks.user_id` (sub-queried by skill policies).

### Notes
- `tasks_canonical_bridge` trigger: **0 code refs** — drop in DB only.
- False positives correctly excluded: `ResourcePermission.is_public` (permissions table), `sch_task.user_id` (scheduler), `TaskAssigneePicker` user lists.

---

## Drop 3 — `project_id` / `task_id` litter columns (FAR FROM READY)

This is the big one. Direct legacy-column dependencies still everywhere. **Do not drop these columns yet** — the canonical `platform.associations` cutover for these entities is incomplete.

- **`workspace.tasks.project_id`** — 15+ FE files (taskService, tasks/redux/thunks, hierarchyService, agent-context/tasksSlice, scopesService, ProjectsHub, resolveCreatedProject, ImportTasksModal, TaskPreviewWindow, several quick-create widgets, HierarchyMove/Entity/Cascade/HoverMenu). Every project-scoped task list/create reads/writes it directly.
- **`notes.project_id`/`task_id`** — `lib/notes/data.ts:22`, `notesService.ts:44,144,146`, `notes/redux/thunks.ts:350`, `NoteContextSection.tsx:41`, `NoteSidebar.tsx`, `war-room/redux/thunks.ts:736` (`updateNote({task_id})`).
- **`cx_artifact.project_id/task_id`** (`chat.artifact`) — `app/api/artifacts/route.ts:136,305`, `canvasArtifactService.ts:404`.
- **Agent scope-discriminator columns** — `agx_shortcut`, `content_blocks`, `shortcut_categories` `project_id/task_id` via `app/api/agent-shortcuts|agent-shortcut-categories|agent-content-blocks/route.ts` + shared `app/api/_lib/apply-scope-to-insert.ts`; views in `agx_*` migrations derive `scope` label from these.
- **`agx_agent`/`agent.definition`/`app.definition` project_id/task_id** — INSERT `null` in `lib/agents/actions.ts:120`, `agent-apps` routes, builtins convert route; many `agx_*` migration INSERTs.
- **`agent.agent_surface.project_id/task_id`** — `agent-surface-bindings.service.ts:170-211` (binding resolution).
- **`chat.agent_plan.project_id`** — `agent-plan.service.ts:76`.
- **`canvas_items.task_id`** — `canvasItemsService.ts:45,67,203,281,344`.
- **`skill.project` junction** — `skillsThunks.ts:112,414,447` (read + upsert + delete).
- **`rs_topic.project_id`** — research service/admin/settings (4 files) — confirm whether intentional domain FK vs litter.
- **`cx_conversation.project_id/task_id`** — primary path uses `get_cx_conversation_bundle` RPC (safe if it hides cols); the **fallback direct `select("*")` at `conversation-bundle.ts:296`** + `load-conversation.thunk.ts:197-198` read them.
- **Ambiguous**: `aiExportService.ts:61-82` (`.eq("project_id"/"task_id")` — confirm target table); `app.execution.task_id` / `prompt_app_executions.task_id` (likely internal tracking IDs, not litter — confirm).
- **SAFE/canonical**: `fromDeprecatedTable("ai_tasks"/"broker_values",...)` (already stubbed), `associationsService.*`, `*_with_association` RPC params (`p_project_id`), `call-api.ts:548` (HTTP body to Python, not a DB column), all `sch_*.task_id` (scheduler's own FK).

---

## Generated types — regenerate (don't hand-edit)
After each drop, run `pnpm db-types` (schemas: `chat files public workspace`). Currently in `types/database.types.ts`: all `cx_*` + `file_*` appear under `public.Views` (the shims); canonical entries already exist under `chat.Tables`/`files.Tables`. `cx_code_edit`/`cx_code_message_file` are REAL tables misclassified under Views (types already stale). `workspace.tasks` still carries `user_id`+`is_public` alongside `created_by`+`visibility`. No app type-alias imports `Database["public"]["Views"]["cx_*"/"file_*"]` directly — the FE types layer already uses `Database["chat"]["Tables"][...]`. `types/python-generated/*` references are doc-comment/generated only.
