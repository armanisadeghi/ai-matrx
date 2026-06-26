# AI Matrx — DB Rulebook (source of truth)

**Project:** `txzxabzwovsujtloxrus`. This is the one doc that defines *how we build*. Agents and both of us read this first. If a decision isn't here, it isn't decided — add it here when it is.

## Doc index (what's live vs dead)
**LIVE — keep current:**
- `db-rulebook.md` (this) — paradigm + rules + decisions.
- `db-status.md` — what's done / what remains (the only backlog).
- `db-changelog-for-team.md` — outward log of shipped DB changes.
- `app-agent-cutover-instructions.md` — outward task spec for coding agents.

**ARCHIVED — historical, do not trust as current:** `db-canonical-access-model.md`, `db-canonical-backlog.md`, `war-room-cutover-handoff.md`, `README-ctx-association.md`, and all earlier `db-*` design/handoff/SQL files. Their content is folded into the four live docs above.

## Core paradigm
1. **One subsystem/package = one schema.** `platform, iam, runtime, knowledge, work, history, internal` already follow this. **(PROPOSED, awaiting confirm)** extend to `cx, wf, cld, ctx`, dropping the redundant prefix (`cx.conversation`). `public` shrinks to genuinely-shared/legacy tables. Internal schemas stay *unexposed* in PostgREST by default — that removes the RLS-off-leak class entirely.
2. **Canonical concepts are never duplicated.** Every package depends on the canonical core; that dependency is the design, not a leak.
3. **Decide by what's enterprise-right, not by what exists or what's fastest.** A decision is a rule that recurs everywhere, not a one-off.

## Canonical homes (never re-implement these)
| Concept | Home |
|---|---|
| Grants (incl. optional `expires_at`) | `public.permissions` (resolved via `iam.has_access` / `public.has_permission`) |
| Membership | `iam.memberships` (`container_type`/`container_id`/`user_id`/`role`) |
| Invitations | `iam.invitations` |
| Activity/audit | `platform.activity_log` (write via `platform.log_activity`) |
| Relationships / links / arrays | `platform.associations` (via `assoc_*` RPCs) |
| Per-user state (pin/hide/favorite) | `platform.user_entity_state` |
| Comments | `platform.comments` |
| Entity registry + defaults + cascades | `platform.entity_types` + `platform.entity_relationships` |

## Base entity contract (every governed table)
`id`, `organization_id` (NOT NULL, FK→organizations CASCADE; null→personal-org fallback), `created_by` (owner; nullable only for legit system rows), `updated_by`, `created_at`, `updated_at` (trigger), `version` (trigger), `visibility` (governed roots only; default from `entity_types`), `deleted_at` (timestamptz — never `is_deleted`).
- Triggers: `_touch_row` (needs `updated_at`+`version`), `_stamp_actor` (needs `created_by`+`updated_by`). Immutable ledgers get neither (only `created_at`).
- **Components** (composition children) have **no own** `visibility`/`organization_id`/`created_by` — they inherit via the parent.
- Relationships→associations; members→memberships; grants→permissions; per-user state→user_entity_state. No second org refs, no duplicate owner columns, no null wiggle room in CHECKs, FKs everywhere.

## Access model
- **visibility** enum `private < internal < link < public` (who can open). **role** `permission_level` = `viewer < editor < admin`.
- **Relationship kinds:** *containment* (cascade-as-floor), *composition* (full inherit, no own visibility), *association* (lateral, no access implication).
- `iam.has_access(type, id, level)` is THE resolver: owner → **org-admin oversight (viewer, any visibility)** → public+viewer → explicit grant → internal+org-member → containment cascade → deny. Generated from the registries; never hand-write per-table RLS logic.

## Standing decisions (binding — do not re-litigate)
- **organization_id** is the canonical tenant column everywhere; null → personal org (`is_personal=true`), else system org.
- **Conversations & runtime**: private by default, owner-owned, org-admin read-only oversight, public/link via `visibility`.
- **Grant expiry**: first-class on `public.permissions.expires_at`; `has_permission` filters expired.
- **`cx_user_request`** is superseded by `runtime.global_request` → migrate then graveyard; frozen meanwhile.
- **Retirement = graveyard, not DROP**: `ALTER TABLE … SET SCHEMA graveyard` (reversible, off the live API), drop only after a soak.

## Naming
Schema = subsystem (`cx`/`wf`/`cld`/…). Table names drop the subsystem prefix once schema'd. Constraints/indexes carry the table prefix. `created_at`/`updated_at` everywhere (no `at`/`occurred_at`).
