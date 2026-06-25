# Generic Shared Tables + ctx_ Consolidation — Agent Migration Guide

> Four new generic tables now exist (live, with canonical RLS + history + registry tokens). This guide tells the coding agents how to repoint each per-feature `ctx_` table onto them. Principle: **one generic table per cross-cutting concern — no per-feature satellites.** Attaching/assigning/categorizing/commenting/inviting/logging are all universal; they each get ONE home.

## The new generic tables (BUILT — do not recreate)

### 1. `iam.invitations` — every invitation, any feature
`id, org_id, target_type, target_id, email, invited_user_id, role, status('pending'|'accepted'|'declined'|'revoked'|'expired'), token (unique), expires_at, accepted_at` + standard columns.
- **Write:** insert with `org_id`, `target_type` (entity_types token, e.g. `'project'`), `target_id`, and either `email` (pre-signup) or `invited_user_id`.
- **Read/RLS:** org members manage their org's invitations; an invitee sees rows where `invited_user_id = auth.uid()` (`inv_invitee_read` policy). Email-only (pre-signup) acceptance must go through a `SECURITY DEFINER` RPC.
- **TODO (agents):** build `iam.accept_invitation(p_token text)` — validates token/expiry, sets `status='accepted'`/`accepted_at`, and creates the resulting grant/membership. This is the access path for not-yet-members.

### 2. `platform.comments` — polymorphic, threaded
`id, org_id, entity_type, entity_id, parent_id (self-FK, threads), body` + standard columns.
- **Write:** insert with `entity_type`/`entity_id` of the thing being commented on; `parent_id` for replies.
- **Read:** `… WHERE entity_type=$1 AND entity_id=$2 AND deleted_at IS NULL ORDER BY created_at`. RLS = canonical entity (owner/org/grant).

### 3. `platform.activity_log` — generic append-only log (Base 3)
`id (bigint), org_id, entity_type, entity_id, action, actor_id, occurred_at, metadata`.
- **Write:** call `platform.log_activity(p_org, p_action, p_entity_type, p_entity_id, p_metadata)` — `SECURITY DEFINER`, stamps `actor_id` from the session. **Do not INSERT directly** (RLS is ledger: org-read-only, no user writes).
- **Read:** `… WHERE org_id=$1 ORDER BY occurred_at DESC`. Indexed by `(org_id, occurred_at)` and `(entity_type, entity_id, occurred_at)`.
- Currently non-partitioned (fine at low volume); partition by `occurred_at` when it grows.

### 4. `iam.memberships` — polymorphic container membership
`id, org_id, container_type, container_id, user_id, role, status` + standard columns. `UNIQUE(container_type, container_id, user_id)`.
- **Scope:** for **non-org** containers (`project`, `war_room`, …). **Org membership stays in `organization_members`** — do not touch it (auth depends on it).
- **Membership vs permissions:** `iam.memberships` is the *roster* (who belongs + role). `permissions` is *explicit shares* of a specific resource. They're complementary. **Important:** the canonical RLS resolver (`iam.access_level`) currently grants access via org membership + `permissions` only — it does **not** yet read `iam.memberships`. So to make a project membership actually grant access, either (a) also create a `permissions` grant on the project, or (b) extend `iam.access_level`/the entity policy to consult `iam.memberships`. **Decision needed before relying on memberships for access.**

## Already-shared (no new table) — assignments & attachments
- **assignments / associations** → `platform.associations` (source_type, source_id, target_type, target_id, org_id, label, metadata).
- **attachments** → a file is a `cld_files` id linked via `platform.associations` (`source_type='file'`). Never store a path.

## Old → new mapping + per-table playbook
| Old `ctx_` table | Rows | New home | Notes |
|---|---|---|---|
| `ctx_project_invitations` | 1 | `iam.invitations` | `target_type='project'`, `target_id=project_id`. |
| `ctx_task_comments` | 1 | `platform.comments` | `entity_type='task'`, `entity_id=task_id`. |
| `ctx_context_access_log` | 0 | `platform.activity_log` | empty — just repoint writers to `log_activity()`. |
| `ctx_project_members` | 57 | `iam.memberships` | `container_type='project'`. Resolve the access decision above. |
| `ctx_scope_assignments` | 91 | `platform.associations` | **already mirrored** (the 91 scope edges match). Repoint readers, then graveyard. |
| `ctx_task_associations` | 13 | `platform.associations` | **backfill the 13 first** (not yet mirrored), then repoint `get_task_associations`, then graveyard. |
| `ctx_task_assignments` | 0 | `platform.associations` | empty — repoint + graveyard. |
| `ctx_task_attachments` | 0 | `cld_files` + `platform.associations` | empty — repoint + graveyard. |

**Per-table migration steps (each one, in order):**
1. **Backfill** remaining rows old → new (skip where already mirrored; `ctx_scope_assignments` is done, `ctx_task_associations` needs its 13).
2. **Repoint writes** — app/RPC inserts now target the generic table.
3. **Repoint reads** — including DB functions (e.g. `get_task_associations` reads `ctx_task_associations` today).
4. **Verify** counts reconcile and reads return identical results.
5. **Graveyard** the old table (`ALTER TABLE public.x SET SCHEMA graveyard`), soak, then drop.

## Keep (the real ctx core — do NOT consolidate)
`ctx_context_items`, `ctx_context_item_values` (→ become `knowledge.attribute_values`), `ctx_scopes`, `ctx_scope_types`, `ctx_projects`, `ctx_tasks` (→ `work`), `ctx_templates`, `ctx_template_context_items`, `ctx_template_scope_types`, and `ctx_user_active_context` (the Active Context runtime layer — distinct from membership/associations).

## Registry tokens added
`invitation`, `comment`, `activity`, `membership` are registered in `platform.entity_types`. Use these exact tokens in `target_type`/`entity_type`/`container_type` fields and in associations.
