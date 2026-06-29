# Canonical Data Model — Rules & Conformance

> These rules are **absolutes**. Confirm on EVERY entity.
> **Objective gate:** `iam.verify_canonical_ok('<schema>','<table>','<token>')` → `true` (target: zero WARN).
> **"Kill"** = legacy pattern to migrate, then graveyard.

---

## 1. Identity & Registry

- Every persistent entity is registered in `platform.entity_types` with a `token`. **Unregistered = does not exist canonically.**
- The `token` is the **only** stable identity. Reference entities by `token` (+ `id`) — never by `schema.table`. Physical location is mutable; the token is not.
- **One token ↔ one table.** `schema_name` / `table_name` / `table_ref` are trigger-maintained on rename/move/drop — never hand-point them. Token renames go through the rename-RPC (cascades); nothing else renames a token.
- `entity_types` **is** the entity vocabulary — never build a parallel list of entity kinds.

---

## 2. Base Entity

Every entity table carries these columns and must not break on them:

| Column            | Type / Constraint                       |
|-------------------|-----------------------------------------|
| `id`              | uuid                                    |
| `organization_id` | uuid, NOT NULL, FK → `iam.organizations`|
| `created_by`      | uuid, FK → `auth.users.id`              |
| `updated_by`      | uuid, FK → `auth.users.id`              |
| `created_at`      | timestamptz                             |
| `updated_at`      | timestamptz                             |
| `deleted_at`      | timestamptz                             |
| `version`         | integer                                 |
| `metadata`        | jsonb                                   |

* System Org: `matrx-system` organization.id: '39c38960-d30c-4840-b0c1-c9960de95582'

**Canonical ↔ Kill:**

| Concern     | Canonical                                  | Kill                                                  |
|-------------|--------------------------------------------|-------------------------------------------------------|
| Owner       | `created_by` (+ `updated_by`)              | `user_id` / `owner_id` / `author_id` / `creator_id` as owner |
| Org         | `organization_id` NOT NULL → `iam.organizations` | `org_id`                                        |
| Soft delete | `deleted_at` (NULL = live)                 | `is_deleted`/`deleted` boolean, `status='deleted'`    |
| Version     | `version int` (bumped by `_touch`)         | parallel / ad-hoc per-table version tables            |

**Canonical trigger trio (required):**

| Trigger    | Function                            | Effect                                                        |
|------------|-------------------------------------|--------------------------------------------------------------|
| `_stamp`   | `platform._stamp_actor`             | sets `created_by` / `updated_by`                             |
| `_touch`   | `platform._touch_row`               | sets `updated_at`, bumps `version`                           |
| `_history` | `platform._version_capture('<token>')` | snapshots → `history.row_versions` (set `is_versioned=true` in `entity_types`) |

---

## 3. Relationships (Associations)

**Anything-to-anything is a ROW in `platform.associations`. A new `x_y` junction table is a bug, not a feature.**

| Column            | Type        |
|-------------------|-------------|
| `id`              | uuid        |
| `source_type`     | text (token)|
| `source_id`       | uuid        |
| `target_type`     | text (token)|
| `target_id`       | uuid        |
| `organization_id` | uuid        |
| `role`            | text        |
| `label`           | text        |
| `position`        | integer     |
| `metadata`        | jsonb       |
| `created_by`      | uuid        |
| `created_at`      | timestamptz |

**Rules:**
- Endpoints are `(source_type, source_id)` / `(target_type, target_id)`. The `*_type` values are `entity_types` tokens, **FK-enforced**.
- **Edge identity** = `(source_type, source_id, target_type, target_id, role)` — one edge per role.
- An edge carries only what is true of the **relationship** (`role`, `position`, `label`, sparse `metadata`). Endpoint properties live on the endpoint — never copied onto the edge.
- **Lineage/provenance is an edge**, not a metadata blob.
- A category belongs to an **entity**, never to an edge.

---

## 4. Columns vs Metadata

| Goes in a **root column**                                                        | Goes in **`metadata`**            |
|----------------------------------------------------------------------------------|-----------------------------------|
| Filtered / sorted / joined / constrained across rows, OR needs FK / CHECK / uniqueness | Sparse, per-combination payload only |

- If you query `metadata` globally, it's a column.

---

## 5. Controlled Vocabularies & Categories

- A **growing** controlled list is a **registry you FK into** — never a `CHECK` array or enum. `CHECK`/enum is allowed only for tiny, near-static integrity boundaries.
- `category`, `role`, and `type` are **one primitive: hierarchical labels.** Canonical home `platform.categories`, namespaced by `dimension`, hierarchy via `parent_id` (or `a:b` paths).
- A label's **second** classification axis (e.g. `placement_type`) is a top-level column; the long tail stays in `metadata`.

---

## 6. Access Model

### 6a. Visibility — "Who can discover this item?"
`platform.visibility` enum, low → high openness. "Make public" = `visibility='public'`. **Kill:** free-text visibility, or an `is_public` boolean as the access driver.

| Tier        | Who can discover                                                        | Examples                                              |
|-------------|-------------------------------------------------------------------------|-------------------------------------------------------|
| `private`   | Only users explicitly granted access                                    | AI conversations, personal notes, drafts              |
| `internal`  | Your org + explicitly authorized projects/collaborators                 | Internal docs, confidential/HIPAA data, comp reports  |
| `link`      | Anyone with the link (access may still be restricted)                   | Shared-by-link content, marketplace items, applets    |
| `public`    | Anyone can discover and access                                          | Blog posts, podcasts, public templates                |

### 6b. Access — "What can an authorized user do?"

| Role        | Capabilities                                                                       |
|-------------|------------------------------------------------------------------------------------|
| Viewer      | View only                                                                          |
| Commenter   | View + comment; cannot modify content                                              |
| Editor      | Create, edit, delete, comment; cannot manage ownership or permissions              |
| Owner       | Full control: permissions, sharing, ownership transfer, deletion, admin (may be a user or an organization) |

### 6c. Sharing (grants)
Grants are **ROWS in `iam.permissions`** (`resource_type`, `resource_id`, `granted_to_user_id` / `granted_to_organization_id`, `permission_level`, `status`, `expires_at`).
- **ONE TOKEN:** `resource_type` MUST equal the entity token — *identical* across `platform.entity_types.token`, `platform.shareable_resource_registry.resource_type`, and `iam.permissions.resource_type`. Registry `table_name` is routing only, **never** the grant token. *(Mismatch → `has_access` silently ignores the grant.)*
- Register in `shareable_resource_registry` (`owner_column='created_by'`).
- **Kill:** any per-feature `<x>_permissions` / `_shares` / `_collaborators` / `_acl` table or `shared_with` jsonb → migrate rows into `iam.permissions`, then graveyard.

### 6d. Access enforcement (RLS)
- Generate with `iam.apply_rls('<schema>','<table>','<token>','<variant>')` — **NEVER hand-write.**
- **Variants:** `entity` (owner+org), `component` (defers to parent), `ledger` (append-only, read-only).
- Emits exactly: `svc_all`, `std_select`, `std_insert`, `std_update`, `std_delete`, plus `pub_read` (anon, `visibility='public'`) when a `visibility` column exists.
- `std_select` / `std_update` LEAD with `created_by = (select auth.uid())` then `iam.has_access('<token>', id, level)` — a `has_access`-only policy breaks `INSERT…RETURNING` (**42501**).
- **Components:** declare the parent in `platform.entity_relationships` (`kind='composition'`, `child_type`, `parent_type`, `fk_column`).
- RLS gates rows, but API roles still need table `GRANT`s or nothing reads.
- **Kill:** bespoke "can-I-see-this" funcs, blanket org-member reads, owner-only checks hard-wired to `user_id`.

### 6e. System vs org scope (orthogonal to visibility)
- `is_system` = global / everyone; otherwise org-scoped via `organization_id` + `has_org_access`.

### 6f. Secrets (NOT a visibility tier)
- Sensitive values (API keys, GitHub/OAuth tokens, env vars, encryption keys) are handled by the **secrets layer**, not `visibility`.

---

## 7. Lifecycle & Migration

- **Retire, don't drop.** Legacy tables → `graveyard` (renamed), recoverable.
- **Soft-delete** via `deleted_at` (NULL = live); active/inactive **toggle** via `is_active`.
- **Migrated rows carry provenance:** `metadata.legacy_table` + `metadata.legacy_id`.

---

## 8. Mechanics That Bite

- `SET SCHEMA` is **metadata-only**: FKs, RLS, indexes, and triggers follow by OID — only **function bodies** break and must be repointed.
- **Planner stats lie** (`reltuples`, `n_live_tup`). Use real `count(*)` for any keep/drop/migrate decision.

---

## Conformance

- **Gate:** `iam.verify_canonical_ok('<schema>','<table>','<token>')` → `true`, zero WARN.
- **One-line test:** "`created_by` + `deleted_at` + `visibility` enum, shares via `iam.permissions` keyed on the entity token, reads via `iam.has_access` generated by `apply_rls`, history via `_history` → `row_versions`? If no to any → fix it."