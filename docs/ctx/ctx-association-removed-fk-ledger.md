# Removed-FK Ledger — CTX Association Overhaul

> **Requirement #2:** track every FK we are retiring so nothing relies on the old path silently. A column is only safe to **drop** (Phase 2) once its row here is `verified` — meaning the codebase + Postgres-internals audits confirm nothing reads or writes it.
>
> **Status values:** `frozen` (data backfilled to `ctx_associations`; app must stop writing it) → `verified` (no remaining references anywhere) → `dropped` (Phase 2 done).

## A. Consolidated association tables
| Object | Old shape | New path | Status |
|---|---|---|---|
| `ctx_scope_assignments` (table) | `(scope_id, entity_type, entity_id)` | `ctx_associations` target_type=`scope`; name kept as compat **view** | frozen |
| `ctx_task_associations` (table) | `(task_id, entity_type, entity_id, label, metadata)` | `ctx_associations` target_type=`task`; name kept as compat **view** | frozen |
| `ctx_scope_assignments_deprecated` | renamed original (data backup) | retire in Phase 2C | frozen |
| `ctx_task_associations_deprecated` | renamed original (data backup) | retire in Phase 2C | frozen |

## B. Litter `project_id` columns → `ctx_associations` (target_type=`project`)
Backfilled by Phase 1. App must stop writing these. Drop in Phase 2A.

`agx_agent`, `agx_agent_templates`, `agx_shortcut`, `app_instances`, `broker_values`, `canvas_items`, `content_template`, `ctx_context_variables`, `cx_agent_plan`, `cx_conversation`, `flashcard_data`, `flashcard_sets`, `notes`, `page_extraction_jobs`, `prompt_actions`, `prompt_apps`, `prompts`, `quiz_sessions`, `rs_topic`, `sandbox_instances`, `transcripts`, `udt_datasets`, `user_files`, `workflow` — **status: frozen**

## C. Litter `task_id` columns → `ctx_associations` (target_type=`task`)
Backfilled by Phase 1. Drop in Phase 2B.

`agx_agent`, `agx_agent_templates`, `agx_shortcut`, `app_instances`, `broker_values`, `ctx_context_variables`, `cx_conversation`, `notes`, `prompts`, `sandbox_instances`, `transcripts`, `udt_datasets`, `user_files`, `workflow` — **status: frozen**

## D. KEPT — do not touch (not litter)
| Column(s) | Reason |
|---|---|
| `ctx_tasks.project_id`, `ctx_tasks.parent_task_id` | containment spine |
| `ctx_scopes.parent_scope_id`, `ctx_scope_types.parent_type_id` | hierarchy spine |
| `ctx_project_members.project_id`, `ctx_project_invitations.project_id` | project child tables |
| `ctx_task_comments/attachments/assignments.task_id` | task child tables |
| `ctx_user_active_context.project_id`, `.task_id` | **Active Context**, not durable association |

## E. JUDGMENT — resolve in audit before classifying (currently KEPT)
| Column | Question |
|---|---|
| `code_repositories.project_id`, `code_files.project_id`, `code_file_folders.project_id` | True containment? (likely a coding-discipline container — may later warrant its own `code_projects` rather than sharing `ctx_projects`.) |
| `wc_claim.project_id` | Is a WC claim owned by exactly one project (containment) or merely associated? |
| `skl_skill_projects.project_id` | Already a junction table? If so it may simply migrate into `ctx_associations` wholesale. |
| `ai_runs.project_id`, `ai_tasks.project_id` | Execution records — containment or association? |

## F. IGNORE — different subsystem
`sch_run.task_id`, `sch_trigger.task_id` → reference `sch_task` (scheduler), unrelated to `ctx_tasks`.

## G. Token reconciliation (carry into audit)
Existing source tokens are already inconsistent (`message` vs `cx_message`; scopes already carry `project` and `task` as sources). Establish a **canonical `source_type` vocabulary** and normalize during cutover. The Phase-1 litter `source_type` tokens are provisional until confirmed.
