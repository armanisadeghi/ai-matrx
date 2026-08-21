-- seo.site_vocabulary / seo.site_geo_area — attach the MISSING org backstop.
--
-- Closes the 4 unacknowledged `org_not_null_no_backstop` rows in
-- platform.ddl_guard_log (ids 1291–1294, fired 2026-08-21 19:56 UTC by the
-- CREATE TABLE + ALTER TABLE of `seo_keyword_value_system.sql`).
--
-- THE GUARD WAS RIGHT — this was not a within-transaction false positive.
-- Both tables were provisioned with `p_org_default => true`, so
-- `_stamp_org_default` IS attached. But db-rules §2 is explicit that a CHILD
-- takes its org from its PARENT: `_stamp_org_default` derives org from
-- created_by → user_id → auth.uid(), and a service-role (Python) insert has
-- none of those, so it leaves organization_id NULL and the NOT NULL constraint
-- turns the write into a 23502. Verified live on 2026-08-21 against
-- brsgrqvjdzwihsvnfqkf, in a rolled-back transaction, on BOTH tables:
--
--   insert into seo.site_geo_area (site_id, label, geo_band) values (<a real site>, …);
--   ERROR: null value in column "organization_id" … violates not-null constraint
--
-- Both are `component`-variant entities with exactly one composition parent
-- (`platform.entity_relationships`: child web_site ← site_id, and site_id is
-- itself NOT NULL), so the correct backstop is `inherit_org_from_parent`, not
-- the personal-org fallback. Precedent:
-- aidream/db/migrations/0394_browser_org_inherit_and_registration.sql.
--
-- The `_0_` prefix is LOAD-BEARING (db-rules §10): BEFORE-INSERT triggers fire
-- in ALPHABETICAL order per event, and this must run before `_stamp_org_default`
-- so the parent's org wins over the actor's personal org. `_stamp_org_default`
-- stays attached and becomes a true backstop — it no-ops the moment
-- organization_id is already set.
--
-- Idempotent, additive, no schema change. Both tables hold 0 rows today, so
-- there is nothing to backfill.

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_vocabulary','site_geo_area'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS _0_inherit_org ON seo.%I', t);
    EXECUTE format(
      'CREATE TRIGGER _0_inherit_org BEFORE INSERT ON seo.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION '
      || 'platform.inherit_org_from_parent(%L, %L, %L)',
      t, 'web', 'site', 'site_id');
  END LOOP;
END $do$;

-- Acknowledge the 4 firings through the ONE supported write path (db-rules §1;
-- `ack_reason` is CHECK-enforced ≥ 12 chars). Never UPDATE the log by hand.
SELECT platform.ddl_guard_ack(
  p_reason => 'Guard was correct: both tables 23502''d on an org-omitting insert (verified live, rolled back). Fixed forward by attaching platform.inherit_org_from_parent(web,site,site_id) as _0_inherit_org, firing before _stamp_org_default per db-rules 2/10. Migration: matrx-frontend/migrations/seo_site_vocabulary_geo_area_org_inherit_backstop.sql. Re-verified live: the same insert now succeeds and inherits the parent site''s org.',
  p_by     => 'claude-code (agent) for arman26@gmail.com',
  p_ids    => ARRAY[1291,1292,1293,1294]::bigint[],
  p_rule   => 'org_not_null_no_backstop');
