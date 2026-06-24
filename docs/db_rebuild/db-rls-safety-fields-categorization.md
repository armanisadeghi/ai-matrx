# Canonical RLS + Destructive-Push Safety + Common Fields + Categorization

## 1. Canonical RLS system — BUILT (live)
Generalized from the task-table model, org-first, reusing your existing `permissions` + `has_permission` grant engine. One applicator, three variants.

### Helper functions (in `iam`)
- `iam.has_org_access(org_id) → bool` — the org boundary (cached, STABLE SECURITY DEFINER).
- `iam.my_orgs() → setof uuid` — orgs I belong to.
- `iam.access_level(type, id, org, owner) → permission_level` — **the efficient resolver**: returns the highest level the current user has — owner ⇒ `admin`, org member ⇒ `editor`, else max grant via `has_permission`, else NULL. Use from client/server for "what can I do here."
- `iam.shared_with_me() → (resource_type, resource_id, level)` — what's shared with me (direct + via my orgs).
- `iam.shared_by_me() → (resource_type, resource_id, grantee user/org, level)` — what I've shared and at what level.
- (existing) `has_permission(type, id, level)` — the grant check (user + org grants, `viewer<editor<admin`, status-aware). Kept as the sharing engine.

### One applicator: `iam.apply_rls(schema, table, token, variant)`
Attaches the identical canonical policy set. Three variants:
- **`entity`** (Base 1): SELECT = `deleted_at IS NULL AND (owner OR org member OR has_permission viewer [OR assignee OR is_public])`; INSERT = org member AND `created_by=me`; UPDATE = owner/org/editor-grant; DELETE = owner OR admin-grant. Auto-detects `is_public`/`assignee_id`/`deleted_at` traits.
- **`join`** (Base 2): all ops gated on `iam.has_org_access(org_id)` (the edge carries org). Applied to `platform.associations`.
- **`ledger`** (Base 3): SELECT-only on `has_org_access(org_id)`; **no write policies** → users can't write; trigger/service writes bypass RLS as table owner. Applied to `history.row_versions` (fixes the hole).

### Coverage (your checklist) — all resolved by the above
What I own (`created_by`), what my org owns (`org_id` + membership), shared with me (`has_permission`/`shared_with_me`), my access level (`access_level`), read access (`viewer` grant), what I've shared and at what level (`shared_by_me`). Client/server just SELECT the table — RLS returns only permitted rows — and call `access_level`/`can` for explicit checks.

### Rollout
`apply_rls` is ready. During the base retrofit, call it per table once each has `org_id`/`created_by`. CI lint should fail any table without `std_*` policies. Special cases (per-user tables like favorites) use a `user_id = auth.uid()` policy instead.

## 2. Destructive-push safety (destructive ≠ data loss)
**Before the push:** (a) enable **PITR** in the Supabase dashboard (continuous recovery) or take an on-demand backup/restore point; optionally (b) create a **Supabase branch** as a point-in-time clone to diff against. (I can't click the dashboard — please trigger PITR/backup there.)

**The in-DB safety net — MOVE, don't DROP:** never `DROP TABLE` directly. `ALTER TABLE old SET SCHEMA graveyard` moves it out of the active schema while **preserving all data**, reversible instantly. Drop the `graveyard` schema only after a soak window. Column drops are already safe because their data is backfilled into `platform.associations`.

**Right order (nothing breaks):**
1. Backup/PITR + snapshot.
2. Finish additive: base-column retrofit, backfill `org_id`, then `NOT NULL`; attach `_stamp_actor`/`_touch_row`/`_version_capture` per table; `apply_rls` per table.
3. Repoint app/RPCs to the new systems (associations, `cld_files`, canonical RLS).
4. Verify: 10-agent internals audit + reconciliation + RLS smoke tests.
5. Destructive: `SET SCHEMA graveyard` the dead tables; drop the (already-backfilled) litter columns; retire compat.
6. Soak, then `DROP SCHEMA graveyard CASCADE`.

## 3. Common fields — where they belong
- **`is_active`** → do **not** add as a competing boolean. If it means "soft-deleted/disabled," use the standard **`deleted_at`**; if it means a lifecycle state, use a **`status`** enum. (It is NOT history — history is the audit log.)
- **`is_archived`** → **global** archive belongs on the entity as **`archived_at timestamptz`** (timestamp > boolean, same reasoning as `deleted_at`). A `_trait_archivable`.
- **`is_favorite`** → **per-user**, so it must NOT live on the shared entity row (one row can't hold every user's preference). It goes in a per-user polymorphic table.

**Proposed `platform.user_entity_state`** (per-user state about any entity): `(user_id, entity_type, entity_id)` PK + `is_favorite`, `is_pinned`, `is_hidden`, `last_viewed_at`, `metadata`. RLS: `user_id = auth.uid()`. One uniform home for favorites/pins/hide/recency across every feature.

## 4. Categorization — one uniform system
Best practice = a **definitions table** + a **polymorphic assignment**, with a **`dimension`** facet for cross-feature reuse (exactly your instinct).

**Proposed `platform.categories`** (Base 1): `id, org_id (null = system/global), dimension ('topic'|'status'|'priority'|…), name, slug, parent_id (hierarchy), is_system, color, icon, position` + standard columns. System categories ship global; users/orgs add their own. `dimension` is the key — it lets the same category set serve many tables/features and lets you run multiple independent axes.

**Assignment = `platform.associations`** with `target_type='category'` (source = the categorized entity). No new assignment table — categorization reuses the unified association system, so the same fetch/RLS/cascade apply. "One table" for definitions, the universal edge table for application.

One system, not two: a single `categories` table with `dimension` covers both "system-offered" and "user-defined," across all features.

## 5. To apply next (additive, safe)
`platform.user_entity_state` + `platform.categories` (+ register `category` token, widen association targets to include `category`, `apply_rls` to categories). Then the base-column retrofit + per-table `apply_rls` rollout.
