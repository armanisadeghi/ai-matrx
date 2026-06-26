# Plan: finish the canonical-model cutover (frontend → drop the legacy junctions)

## ⚡ Execution status — updated 2026-06-25

**DONE & live-verified (Waves 1 + 2):**
- **DB foundation** (5 migrations, MCP-applied + ledgered + `pnpm db-types` regen): `mbr_*` over `iam.memberships`, `inv_*` over `iam.invitations`, `cmt_*` over `platform.comments`, the Part-1 task-assoc RPC repoint, and `repoint_project_member_rls_to_iam.sql`.
- **Part 1** — task-assoc RPCs read/write `platform.associations`. ⚠️ Plan's premise was wrong twice: (a) the 13 rows were NOT mirrored — added a backfill; (b) direction is **content=source → container=target** (the `target_type` CHECK forbids entity types as targets), not "source=task". FE untouched (shapes preserved).
- **Part 2 + 3** (Projects vertical) — `membershipsService.ts` + `invitationsService.ts` built; `features/projects/service.ts`, `features/tasks/services/projectService.ts`, `ProjectReferencesPanel.tsx`, `hierarchyService.ts`, the accept page, and the 2 API routes (now email-only) migrated. `createProject` now writes the owner membership explicitly via `mbr_add` (legacy creator trigger no longer mirrors to `iam`).
- **Part 4 + 5** (Tasks vertical) — `features/comments/service/commentsService.ts` built; task comments → `platform.comments`; attachments → `platform.associations` (file=source, task=target); assignment alias deleted; legacy type aliases removed.
- **NEW — RLS correctness fix (not in original plan):** 13 RLS policies on LIVE tables (`ctx_tasks`, `cx_conversation`, `skl_categories`/`skl_definitions`/`skl_render_definitions`/`skl_skill_projects`, `wc_claim`) still subqueried `ctx_project_members`, which now goes stale (edits flow only to `iam.memberships`). All repointed via the `iam.user_container_ids()` SECURITY-DEFINER helper. Policies ON the legacy tables themselves are left (drop with the table).
- **aidream** — minimal impact: one runtime read (`core/managers.py get_user_project_ids`) + the ctx-explorer dashboard members tab repointed to `iam.memberships` (live-verified 37 rows). Five of six tables had zero runtime access. Uncommitted in that repo, ready for review.
- `pnpm type-check` = 0 errors. App-code `rg` for all six legacy tables = clean (comments/demo strings updated too).

**OPEN:**
- **Browser QA pending** — DB + types verified; live click-through of project members / invite-accept / task comments not yet run (dev-server contention from concurrent sessions). Routes to test handed to user.
- **Part 6 (decommission)** — NOT started; destructive, gated. Before dropping: repoint the 3 `skl_skill_projects` RLS policies in aidream migration `0094` (flagged by aidream agent — actually already covered by the RLS repoint above; re-verify), drop `_mirror_assoc` trigger + the legacy-table own policies, then drop the 7 tables. Also droppable: `get_entity_scopes`/`set_entity_scopes`/`list_entities_by_scopes`, `get_project_members_with_users`.
- **Part 7** — `iam.has_access` ALREADY EXISTS (plan was wrong). Base-contract/visibility adoption remains long-horizon.
- **aidream follow-up** — add `iam` schema to `db/matrx_orm.yaml` codegen to retire the hand-authored `IamMemberships` bridge.

---


## Goal & definition of done
Move every frontend reference off the legacy per-feature junction tables onto the canonical surface, so the 7 `ctx_*` link tables can be dropped. A part is **done** when: (1) `rg` shows zero app-code references to the table or its table-reading RPCs, (2) `pnpm type-check` is green, (3) any new migration is applied via MCP + recorded in `_schema_migrations` + verified live, (4) the relevant `FEATURE.md` is updated with a Change Log line.

## What already exists vs. what's missing
**Built & FE-reachable** (public SECURITY-DEFINER RPCs + chokepoint services):
- Associations → `assoc_*` (incl. the new `assoc_for_sources`) + `associationsService`
- Categories → `cat_*` + `categoriesService`
- Per-user state → `ues_*` + `favoritesService`
- Sharing → `has_permission` (resolver only)
- **`ctx_scope_assignments` is fully cut over** (this session).

**Missing — tables exist & data copied, but NO public RPC bridge** (confirmed via `pg_proc`): `iam.memberships`, `iam.invitations`, `platform.comments`. **`iam.has_access` is not built** (canonical doc §9 "to build"). These gaps are the long pole.

## The canonical pattern every new primitive must copy
`migrations/assoc_public_rpcs.sql` (RPC family) + `features/scopes/service/associationsService.ts` (chokepoint: `requireUserId`, returns `ScopesRpcResult`, never throws, sole caller of its RPCs, org-gated inside the RPC via `iam.has_org_access`). New bridges mirror this 1:1 — **build the reusable primitive, then migrate consumers through it.**

---

## Workstreams (each = one subagent)

### Part 0 — Canonical RPC bridges + chokepoint services *(foundation; blocks Parts 2-4)*
Three independent sub-parts, same shape, can run as 3 parallel subagents:

| Sub | DB (new migration, MCP-applied + ledgered) | FE chokepoint service | Vocabulary |
|---|---|---|---|
| **0a Memberships** | `mbr_*` RPCs over `iam.memberships` (list/add/update-role/remove, by `container_type`+`container_id`) | `features/organizations/service/membershipsService.ts` | `container_type='project'\|'task'\|'war_room'`, `role` text, `status='active'` |
| **0b Invitations** | `inv_*` RPCs over `iam.invitations` (create/list/get-by-token/accept/revoke/resend) | `features/organizations/service/invitationsService.ts` | `target_type='project'`, `target_id` |
| **0c Comments** | `cmt_*` RPCs over `platform.comments` (list-for-entity/add/edit/delete, `parent_id` threading) | `features/tasks/services/commentsService.ts` (or a shared `features/comments/`) | `entity_type`,`entity_id`,`body`,`parent_id` |

Each sub: regen `pnpm db-types`, return the exact RPC arg/return shapes for downstream parts. **Acceptance:** RPC live-verified; service returns `ScopesRpcResult`; type-check green.

### Part 1 — `ctx_task_associations` cutover *(no Part-0 dependency; can start now)*
The 6 task-association RPCs (`get_task_associations`, `get_tasks_for_entity`, `associate_with_task`, `dissociate_from_task`, `create_task_with_association`, `create_tasks_bulk`) + `get_task_associations_cld_files` all read `ctx_task_associations`. Data is already mirrored into `platform.associations`. **Cheapest correct cutover is DB-side: repoint these functions to read/write `platform.associations`** (source=`task` ⇄ target=entity), keeping the FE (`taskAssociationsSlice`, `AssociateTaskButton`, canvas `TasksArtifact`/`artifact-adapters`, `TaskChecklist`) stable. The denormalized `get_task_associations` bundle (notes/files/messages/conversations/blocks) stays in the function. **Acceptance:** RPCs return identical shapes off `platform.associations`; live-verify a task with known links; FE untouched or minimally adjusted.

### Part 2 — `ctx_project_members` → `iam.memberships` *(depends on 0a)*
Migrate `features/projects/service.ts` (~13 refs), `features/tasks/services/projectService.ts` (3), `app/(core)/invitations/project/accept/[token]/page.tsx`, `features/projects/components/ProjectReferencesPanel.tsx`, `features/agent-context/service/hierarchyService.ts` to `membershipsService` (`container_type='project'`). Note the existing creator-membership DB trigger — keep it or move into `mbr_add`. **Acceptance:** zero `ctx_project_members` refs in app code.

### Part 3 — `ctx_project_invitations` → `iam.invitations` *(depends on 0b)*
Migrate `features/projects/service.ts` (~8) + the 3 API routes (`app/api/projects/invite`, `.../invitations/resend`, accept page) to `invitationsService` (`target_type='project'`). **Acceptance:** zero `ctx_project_invitations` refs; invite→accept flow works end to end. *(Note: `organization_invitations` unification into `iam.invitations` is related but out of the 7-table scope — flag for Part 7.)*

### Part 4 — `ctx_task_comments` → `platform.comments` *(depends on 0c)*
Migrate `features/tasks/services/taskService.ts` (lines ~771/806) + `features/tasks/components/TaskCommentPopover.tsx` + the War Room comment surface to `commentsService` (`entity_type='task'`). **Acceptance:** zero `ctx_task_comments` refs; popover thread + composer work.

### Part 5 — `ctx_task_attachments` + `ctx_task_assignments` retirement *(empty tables; assoc exists)*
- **Attachments** (`taskService.ts` ~192/262/323): create a `file` entity then `assoc_add('file', fileId, 'task', taskId)` via the files handler + `associationsService`; read via `assoc_for_targets('task', …)` / `assoc_for_sources`.
- **Assignments** (0 rows, no `.from` usage): drop the type alias; primary assignee stays `ctx_tasks.assignee_id`; multi-assignee (if ever) → `iam.memberships` `container_type='task'`.
- Update `features/tasks/types/database.ts` aliases for both. **Acceptance:** zero refs; attachments round-trip through the file handler.

### Part 6 — DB decommission *(final wave; after Parts 1-5 verified)*
Repoint/drop the remaining DB functions that still read legacy tables: the now-FE-unused scope RPCs `get_entity_scopes`/`set_entity_scopes`/`list_entities_by_scopes` (droppable), `resolve_full_context*` (repoint to `platform.associations` — **needs aidream/Python coordination**), the task-assoc functions (done in Part 1). Then drop the `_mirror_*` triggers and finally the 7 tables. **Gated, destructive — runs last.**

### Part 7 — Base-contract & `has_access` adoption *(parallel long-horizon track)*
The broader canonical model beyond the 7 tables: `visibility` column + `deleted_at` (replace `is_deleted`/`is_*` booleans), `iam.has_access(type,id,required)` as the single gate (RLS + Python call it), `platform.activity_log`/`log_activity`, `history.row_versions`, and the `entity_types`/`entity_relationships`/`org_module_config` registries. Mostly DB+Python; FE adopts `deleted_at`, visibility pickers, and `has_access`-driven gating incrementally. **Independent of Waves 1-3.**

---

## Execution waves (parallelization map)

- **Wave 1 (parallel now):** Part 0a, 0b, 0c (3 subagents) · Part 1 · Part 5 — none block each other.
- **Wave 2 (parallel, after the matching Wave-1 bridge lands):** Part 2 (needs 0a) · Part 3 (needs 0b) · Part 4 (needs 0c).
- **Wave 3:** Part 6 decommission (after Waves 1-2 verified live).
- **Track B:** Part 7, anytime, separate cadence.

## Cross-cutting rules & risks (give to every subagent)
- **One chokepoint per primitive** — no `.from('iam.*'/'platform.*')`, no direct `assoc_*`/`mbr_*`/`inv_*`/`cmt_*` calls outside the owning service (mirror the associations ESLint chokepoint).
- **`organization_id`, not `org_id`** — live `platform.*` columns use `organization_id`; the older `assoc_*` migration *files* drifted (cosmetic). New RPCs must match live.
- **`pnpm db-types` clobbers the whole types file** — expect large diffs and latent drift surfacing as type errors (we hit `created_by`/`updated_by` on `cld_notes` and `org_id`→`organization_id` this session). Budget for fixing collateral; run `type-check` per part.
- **Loud cutover + live verify** — never report a migration "done" off a file; verify with `execute_sql`. No destructive drop until *all* FE **and** DB readers are off (Part 6).
- **Cross-repo** — `resolve_full_context*` and `has_access` touch aidream/Python; coordinate, don't unilaterally drop.

---
