-- A soft-deleted site must not squat its domain: the plain unique
-- (organization_id, domain) constraint counted trashed rows, so deleting a
-- site and re-adding the same domain failed with 23505. Uniqueness now
-- applies to LIVE rows only. (Safe: nothing upserts sites ON CONFLICT
-- (organization_id, domain) — web.create_site does a plain INSERT.)

alter table web.site drop constraint if exists site_organization_id_domain_key;
create unique index if not exists site_org_domain_live_unique
  on web.site (organization_id, domain)
  where deleted_at is null;

notify pgrst, 'reload schema';
