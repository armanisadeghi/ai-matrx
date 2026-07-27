-- A kind slug is a GLOBAL identifier, so it must be globally unique.
--
-- Uniqueness used to be (organization_id, kind). That let a user create a kind
-- in their own org whose slug already belonged to a platform kind. Nothing
-- rejected it: aidream's kind_create only checked "my org or my rows", and the
-- DB index was per-org. The frontend then loaded both rows for one slug and
-- `reconstructKindRegistry` THREW ("duplicate kind slug"), taking down the
-- whole warm registry — every kind stopped rendering for anyone who could see
-- both rows. The cold-tier read failed the same way via PGRST116.
--
-- The slug is global everywhere else already: `__kind` on the wire, fence
-- languages and XML tags in `content_ir.kind_surface` (globally unique token),
-- and the slug-keyed render registry. Per-org slugs were never coherent with
-- that. Verified zero live duplicates before applying.
--
-- Soft-deleted rows are excluded, so retiring a kind frees its slug.
create unique index if not exists kind_definition_global_slug_unique
  on content_ir.kind_definition (kind)
  where deleted_at is null;

-- Subsumed by the global index above. It is backed by a UNIQUE CONSTRAINT, so
-- it has to be dropped as a constraint — `drop index` is refused.
alter table content_ir.kind_definition
  drop constraint if exists kind_definition_org_kind_key;
