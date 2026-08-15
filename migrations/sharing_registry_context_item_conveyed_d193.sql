-- sharing_registry_context_item_conveyed_d193.sql
--
-- FOUND_DEFECTS D193 (context_item half) — the sharing registry declared a
-- column that does not exist, on an entity that is not independently shareable.
--
-- ── The lie ─────────────────────────────────────────────────────────────────
-- `platform.shareable_resource_registry.context_item` carried
-- `is_public_column = 'visibility'`, but `context.context_items` has NO
-- `visibility` column (41 columns, verified live 2026-08-15). This is the exact
-- class of D117 (`content_ir_kind_instance`, fixed 2026-08-12): a non-null
-- `is_public_column` is the registry saying "this table has a legacy BOOLEAN
-- public flag", which routes ShareModal's public toggle through
-- `make_resource_public` instead of the canonical `setVisibilityColumn` enum
-- path — a write at a column that isn't there, and a read that finds nothing.
--
-- ── Why the fix is NULL, not a new visibility column ─────────────────────────
-- A context item is a COLUMN DEFINITION on a scope type (features/scopes/
-- FEATURE.md: context items are "the columns" of a dimension; the CELLS live in
-- `context.context_item_values`, per scope). Access to it conveys entirely from
-- its parent scope type. Measured live, all four facts agree:
--
--   1. `context.context_items` has NO `organization_id`. Its org is reached
--      only through `context.scope_types.organization_id`. The row cannot exist
--      independently of a parent, and cannot name an owner org by itself.
--   2. Every one of its four RLS policies keys on the PARENT, and none of them
--      calls `has_permission()` / `iam.has_access()`:
--        SELECT  scope_type_id IN (scope_types of iam.my_orgs())
--        INSERT  iam.has_org_admin(parent scope type's org)
--        UPDATE  iam.has_org_admin(parent scope type's org)
--        DELETE  iam.has_org_admin(parent scope type's org)
--      So an `iam.permissions` grant on a context_item grants LITERALLY
--      NOTHING — which is what `rls_uses_has_permission = false` already says.
--   3. `iam.permissions` holds ZERO rows with `resource_type='context_item'`.
--      Across 203 live rows it has never once been shared in its own right.
--   4. The row's own note says it was "Registered as shareable from the
--      Relationship Manager drift report" — an automated drift sweep guessed
--      the column from a naming convention. It was never a sharing decision.
--
-- Arman's ruling 2026-08-15 ("everything in our database should be the same
-- unless it's truly a private personal thing") is satisfied ALREADY, and by the
-- parent: every member of the owning organization sees every context item on
-- that org's scope types. That IS the canonical org-wide model. Bolting a
-- per-item `visibility` enum onto the child would create a SECOND access
-- authority that no RLS policy reads — the "two competing relationship
-- authorities" pattern this codebase forbids — and would contradict THE
-- COMPONENT OWNERSHIP LAW (Arman 2026-08-14): on a component the owner is the
-- PARENT, and `created_by` is an audit stamp, never an access key. A component
-- with no independent owner column is CORRECT. `context_items` is a component
-- of `scope_type`, so it stays one.
--
-- The parent token `scope` is already registered exactly this way
-- (`is_public_column = null`, `rls_uses_has_permission = false`). This puts the
-- child in the same, honest shape as the rest of its family.
--
-- ── What "non-independently-shareable" is, in this registry ──────────────────
-- The row STAYS `is_active = true`. Deactivating it would make
-- `public.get_share_capabilities('context_item')` RAISE "Unknown shareable
-- resource token", and would force the row out of the TS mirror that resolves
-- `context_item` → `context.context_items` for label/detail lookups — a louder
-- break than the bug. "Not independently shareable" is spelled by the three
-- flags together, and after this migration all three agree:
--     is_public_column        = null   (no public toggle)
--     is_link_shareable       = false  (no anonymous share link)
--     rls_uses_has_permission = false  (a permission grant conveys nothing)
--
-- ── url_path_template stays '' (D138) ───────────────────────────────────────
-- It is already empty and that is the CORRECT value, not an oversight. The only
-- id-addressable context-item route in `app/` is
-- `app/(core)/organizations/[orgId]/scopes/[typeId]/context-items/[itemId]`,
-- which needs THREE ids; a `{id}`-only template cannot build it, and
-- `/context-items` is an un-parameterized hub with no focus param. Per D138 an
-- empty template means "no signed-in destination" and the sharing surfaces
-- render no link rather than a 404. `entityRegistry` correctly carries no
-- `hrefFor` for `context_item` for the same reason; the door a user actually
-- gets is the generic detail window (`features/item-presentation`, `open: {
-- kind: "context_item" }`). No route is invented here.
--
-- Idempotent: value-set UPDATE keyed on resource_type.

begin;

update platform.shareable_resource_registry
set is_public_column = null,
    notes = 'Component of scope_type: access conveys from the parent (RLS keys '
            || 'on scope_types.organization_id via iam.my_orgs()/has_org_admin '
            || 'and never calls has_permission). Not independently shareable — '
            || 'is_public_column must stay NULL: context.context_items has no '
            || 'visibility column and must not grow one (D193 / D117 class). '
            || 'Row stays active so the token still resolves to its table.',
    updated_at = now()
where resource_type = 'context_item'
  and (is_public_column is not null
       or notes is distinct from
          'Component of scope_type: access conveys from the parent (RLS keys '
          || 'on scope_types.organization_id via iam.my_orgs()/has_org_admin '
          || 'and never calls has_permission). Not independently shareable — '
          || 'is_public_column must stay NULL: context.context_items has no '
          || 'visibility column and must not grow one (D193 / D117 class). '
          || 'Row stays active so the token still resolves to its table.');

commit;
