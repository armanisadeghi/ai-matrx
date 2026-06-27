-- Make iam.memberships.organization_id cascade on org delete.
--
-- The FK was NO ACTION, which blocked deleting an organization while membership
-- rows referenced it. Soft-deleting members (mbr_remove sets deleted_at) does
-- NOT release the FK, so org deletion was impossible after the
-- organization_members -> iam.memberships cutover. Deleting an org should remove
-- its membership rows.
--
-- Idempotent: drop-if-exists then re-add with ON DELETE CASCADE.

ALTER TABLE iam.memberships
  DROP CONSTRAINT IF EXISTS memberships_organization_id_fkey;

ALTER TABLE iam.memberships
  ADD CONSTRAINT memberships_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
