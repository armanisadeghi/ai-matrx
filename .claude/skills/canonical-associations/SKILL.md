---
name: canonical-associations
description: "The one association system (platform.associations) and schema-qualified table refs. Use when touching an M2M junction table, an associate_*/attach_*/tag_* RPC, FK columns used as tags, a 'things attached to X' list or card, or a PGRST205 / 42703 table-not-found on a bare .from()."
---

# Canonical Associations — the campaign playbook

> **W5 SWAP NOTICE (2026-08-29):** the association/category UI + hooks + service
> implementations now ship in **`@ai-matrx/associations`** (`/react` for faces +
> hooks, `/core` for the headless services/store). Paths in this document that
> point at `features/scopes/components/associations/**`,
> `features/scopes/components/Category*`, or `features/scopes/redux/**`
> association/category fragments refer to DELETED files — import from
> `@ai-matrx/associations/react` (hooks also re-exported under
> `features/scopes/hooks/`), and see `features/scopes/host/` for the host
> binding. The rules and contracts described remain in force.


There is **ONE** way to relate two entities (content↔content, content↔container) in this app: an edge in **`platform.associations`**, written ONLY through `associationsService` (`features/scopes/service/associationsService.ts`), which is the sole caller of the `assoc_*` RPCs. Every bespoke M2M junction table, `associate_*`/`get_*_associations` RPC, and FK-tag column used as a relationship is **debt to migrate onto this edge**. This skill is the exact recipe a subagent follows, one file at a time.

## Which recipe — each run uses one

The rules below (field realities, tombstones, the boundary, the token rule, edge direction) apply to every run. Then read ONLY the recipe your task needs:

- **Replacing a bespoke M2M junction, an `associate_*`/`get_*_associations` RPC, or an FK-tag column** → read [recipe-a-replace-m2m.md](recipe-a-replace-m2m.md) (Recipe A FE repoint + Recipe A-DB junction collapse — they ship in ONE change).
- **Putting association cards, a picker, or a name dropdown on a container page, or adding a new card kind** → read [recipe-b-container-cards.md](recipe-b-container-cards.md).
- **A bare `.from("<moved-table>")`, PGRST205, or 42703** → read [recipe-c-table-refs.md](recipe-c-table-refs.md).
- **Running a whole flip** (DB collapse + FE repoint) → the **Campaign workflow** below, plus the recipe files it names.

## ⚡ Field realities — "make this table associable everywhere" (verified 2026-07-05)

When a newly-canonicalized entity must be "added to all the places we have associations (orgs, war rooms, etc.)", it is almost entirely ONE edit — do NOT hunt for per-surface lists:

1. **The card/picker gate is a `titleColumn` in `ENTITY_OVERLAY` (`features/scopes/registry/entityRegistry.ts`) — NOT `is_listed`.** `listableTokens()`/`canListCandidates` = `titleColumn != null || listCandidates`. Add ONE overlay line (`token: { Icon, labelPlural, titleColumn: "name", contentRole }`) and the entity lights up as an attachable card on the org page, war rooms, projects, scopes, and every container at once. War-room has been **open-vocabulary since 2026-07-03** (all whitelists deleted → `AssociationList`/`UniversalAssociationPicker` read the same registry), so there is NO separate war-room list to edit.
2. **Register the ENTITY tokens, never the component token.** A `*_version`/component token (`is_component=true`) is not an attachable card — omit it. Owner/org are the `created_by`/`organization_id` conventions; only override in the overlay if the table truly diverges.
3. **`entity-types.generated.ts` is the token source of truth** — after the DB registers the token in `platform.entity_types`, run `pnpm gen:entity-types` so the token exists before you reference it in the overlay.
4. **Matrx Directives (aidream) is a SEPARATE, BIDIRECTIONAL registry — `entity_types` registration does NOT put a table there.** The catalog (`aidream/services/directive_catalog/catalog.py`) is driven by the references registry (`aidream/services/references/resources.py` → `drift.py`): every registered reference shape MUST appear in the catalog with `reference=Y` AND every catalog `reference=Y` MUST have a registered reference shape. To add a table to Matrx Directives, register it in `resources.py` first; adding a catalog row for an unregistered token fails drift, and vice-versa. Not every entity is referenceable (there is no generic `folder` reference type — so `code_folder` is intentionally absent while `code_file`/`code_repository` are present).
5. **A raw `(schema, table)` resolves to its canonical display via `tryGetEntityInfoByTable(schema, table)`** (added to `entityRegistry.ts`). Any surface keyed by a live table name (FK-reference panels, drift reports) MUST resolve icon/label/grouping through it — never a hand-maintained `TABLE_META` map (that duplication drifts; `ProjectReferencesPanel` was migrated off exactly this).
6. **Structural FKs stay FKs — do NOT migrate them into associations.** A canonicalized entity's own `folder_id`/`repository_id`/`parent_folder_id`/`project_id`/`task_id` are real hierarchy/ownership columns. Registering the token makes OTHER things associate *to* the entity; it does not turn the entity's own FKs into edges.

## 🚨 Edges are TOMBSTONED, never purged, when an endpoint is trashed (2026-08-14, D135)

`platform.associations` carries `deleted_at` + a `deleted_via_type`/`deleted_via_id` stamp. Soft-deleting an entity tombstones its live edges; restoring it revives exactly those; only a hard `DELETE` purges. **Every READ is live-only** — SQL reads `platform.associations_live`, a direct PostgREST read passes `.is("deleted_at", null)`, aidream's ORM engine filters it automatically. A reader that sees a tombstone is an **access leak** (edges convey access via `platform.containment_edges` → `platform.reachability`). Re-attaching over a tombstone revives it (BEFORE INSERT trigger) — never "fix" a unique violation by deleting the tombstone. Full contract: `common-docs/systems/platform/access/FEATURE.md` §2.4c.

## The one load-bearing boundary — DO NOT cross it

`platform.associations` is the M2M association edge. It does **NOT** absorb two adjacent single-home domains. Leave them alone:

- **`iam.permissions`** = access control / RLS visibility / sharing (`share_resource_with_org`, `has_permission`, the ONE resolver `iam.has_access`/`has_access_for`, the `shareable_resource_registry`). Deleting/repointing it tears out who-can-see-what. **KEEP.** (`check_resource_access` was retired 2026-07-15 — never reference or preserve it.)
- **`iam.memberships`** = org/project membership (`mbr_*`). **KEEP.**

If a relationship answers *"who is allowed to see/do this?"* → it's `iam.*`, not associations. If it answers *"what content/containers is this attached to?"* → it's `platform.associations`. When unsure, ask; do not guess and migrate a permissions grant into an association edge.

**Where the two meet — contextual access.** An association edge can *convey* access: `association_types.conveys_max` + `container_side` feed `platform.reachability`, so a thing attached to a container the user can reach becomes readable *through that container* (`iam.has_access_for`) — but it must NEVER become discoverable in that thing's own lists/search (`iam.is_discoverable`, which skips conveyance). Before registering a pair with a non-null `conveys_max`, or building any list/search over an entity that can be attached, read `/Users/armanisadeghi/code/aidream/docs/access/CONTEXTUAL_ACCESS.md` (the reads-use-has_access / lists-use-is_discoverable rule + the per-surface leak gotcha).

## Non-negotiable token rule (this caused the original disaster)

Every `sourceType`/`targetType` MUST be a **canonical `EntityTypeToken`** — generated 1:1 from `platform.entity_types` into `types/generated/entity-types.generated.ts`. **ZERO legacy/guessed names.** `associationGuards` rejects non-canonical tokens and non-UUID ids at the call site, so a wrong token throws in code, not at Postgres.

- A token missing for a **real** entity → register the entity in `platform.entity_types` (DB), regenerate (`pnpm tsx scripts/generate-entity-types.ts`), then use it. Never alias.
- A token that's just a wrong name (`agent_app`→`app`, `user_file`→`file`, `notes`→`note`) → repoint the callsite to the canonical token. Never add a compatibility map.
- Ids are **row UUIDs**, never display strings. (The original bug: an agent passed a cute string as an id.)

## Edge direction and one canonical path — every edge write

**Direction is canonical and fixed: little points to big — the smaller thing is the source, the bigger thing it points to is the target.** `task → organization`, `file → scope`, `note → project`, `project → war_room` (a war room is bigger than a project — many threads make a war room). (Same direction as scope-tagging; a container's attached resources are its INCOMING edges.) The registry `platform.association_types` is the single truth of direction per pair; `trg_associations_auto_orient` **REJECTS** a wrong-way write of a registered pair with an error naming the canonical direction, and `/administration/relationships` flags reversed edges. **The size hierarchy is a product fact — if a pair's direction seems wrong, ASK; never flip the registry or edges on your own judgment.** Registering a NEW pair: insert it in `/administration/relationships` (or `admin_upsert_relationship_rule`) with `container_side='none'` — whether it conveys access is a human decision made there.

> A relationship has **exactly one** canonical path. If two surfaces reach the same edge two ways (one via associations, one via a junction), that's the bug — collapse to associations.

> **Create-then-associate contract:** a surface that CREATES an item and attaches it (upload→attach, "+ New X") creates the durable row FIRST, writes the idempotent edge SECOND, and makes every terminal outcome loud — a created-but-unlinked item is reported WITH its location, never silently orphaned. Full contract + reference implementations: the `association-entity-select` skill.

---

## Recipe A — Replace a bespoke M2M / association RPC with `associationsService`

**Replacing a junction / association RPC → read [recipe-a-replace-m2m.md](recipe-a-replace-m2m.md)** — the write/read/hook swaps and retiring the old path.

## Recipe A-DB — collapse the junction in the DB (2026 downtime SOP)

**Collapsing the junction in the DB → read [recipe-a-replace-m2m.md](recipe-a-replace-m2m.md)** — the audit toolkit and the atomic, count-verified migration.

## Recipe B — Put an association surface on a container (the card system)

**Container card / picker / name-dropdown work → read [recipe-b-container-cards.md](recipe-b-container-cards.md)** — provider mount, the one overlay line, `getEntityInfo`, the third face.

## Recipe C — Canonicalize a table reference (kills PGRST205 / 42703)

**PGRST205 / 42703 / bare moved-table ref → read [recipe-c-table-refs.md](recipe-c-table-refs.md)** — find the canonical home, qualify, register in `dead-relations.json`, verify.

---

## Campaign workflow (per flip)

1. Pick a target: a genuine junction from `audit.m2m_candidates` (now factual) or a file from `WORK-QUEUE.md`.
2. DB collapse (Recipe A-DB) + FE repoint (Recipe A / B / C) in ONE change. One canonical path only.
3. `pnpm check:schema` + `pnpm check:dead-relations` green; touched files type-check; `audit.refresh()` → junction gone from candidates, no new `broken_functions`.
4. **Adversarial sweep (mandatory before "done").** Spawn a fresh agent (Sonnet 5) in EACH repo — matrx-frontend AND aidream — whose sole job is to REFUTE that the migration is complete: grep for any surviving old-shape usage (`.from("<junction>")`, the retired RPC, a dropped column, a PostgREST embed of the old relationship, Python ORM models/managers of the moved table). Anything it finds is unfinished work, not noise. A confirmed-empty sweep is the sign-off.
5. Update the feature's `FEATURE.md` + Change Log if behavior changed; log the flip to `platform.deprecated_relations` + the worklog Done log; tick `WORK-QUEUE.md`.

**Guardrails to lean on:** `scripts/schema-check/` (live diff + dead-relations), `eslint.config.mjs` (direct-schema ban — extend it to fail-fast in-editor when a whole class is done), `pnpm check:doctrine`. **Loud recovery:** any fallback you add (RLS-only candidate read, etc.) must `console.error` when it fires — a recovery firing means a real ref is still wrong.

## Backlog

The prioritized, file-anchored campaign backlog lives in **[`WORK-QUEUE.md`](./WORK-QUEUE.md)** next to this skill. Start there; keep it current as items land.

The 2026-06-29 facts-only migration snapshot (triage verdicts, the `bundle_member` finding) lives in **[`STATUS.md`](./STATUS.md)**.
