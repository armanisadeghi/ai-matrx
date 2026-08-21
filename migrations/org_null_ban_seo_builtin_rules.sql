-- NO NULL ORG — seo.gsc_dig_rule + seo.keyword_class_rule
-- =====================================================================
-- Owner ruling, 2026-08-21 (db-rules FEATURE.md §2 / §6e):
--
--   "If something belongs to the system, that CANNOT EVER be represented
--    by a NULL org! ... NO NULL ORG. the system has an org and this is
--    well-established."
--
-- These two tables were the last live holdouts of the "NULL organization_id
-- means usable by anyone" lane, born in `seo_gsc_dig_watch_launch.sql`
-- ("Templates are the ONLY ownerless rows"). This migration ends that lane.
--
-- WHAT IS ACTUALLY WRONG HERE — and it is worse than the doctrine breach.
-- Both tables are registered as rls_variant='component' with ONE composition
-- parent (`web_site:site_id`). Every one of their 19 rows is a builtin with
-- site_id IS NULL *and* created_by IS NULL. That is exactly the failure db-rules
-- §10 names: "A NULL FK can never match an IN — a parent-less component row is
-- invisible FOREVER." Measured live before this migration: all 19 builtin rows
-- are DARK to every non-admin caller. The rule engine's own templates cannot be
-- read by the users they exist for.
--
-- §10 also gives the verdict: "If a parent-less row is a NORMAL case for a
-- table, it is not a component — builtins belong on the platform-global tier
-- (§6e)." Parent-less is not an edge case here; it is 100% of both tables. So
-- the variant is re-judged from `component` to `entity`, and the builtins move
-- onto the platform-global tier: system org 'matrx-system'
-- (39c38960-d30c-4840-b0c1-c9960de95582), which `iam.system_orgs` marks
-- global_readable.
--
-- VISIBILITY (§6a-1 requires the choice to be justified here):
--   * column DEFAULT 'internal' — a user-authored rule is ORG WORK PRODUCT.
--     It is deliberately NOT 'public': the pub_read policy is an anon lane and
--     a user's own thresholds do not belong on the open internet.
--   * the seeded builtins are set 'public' — they are platform templates and
--     were world-readable by design in the launch migration. 'public' also
--     makes them readable through has_access's public lane independently of
--     the system-org lane, so a builtin can never go dark again for a
--     global_readable registry reason.
--   Neither is 'personal': §6a-1 reserves that for a user's own personal
--   artifacts, and choosing it here is the exact reflex that caused the
--   marketing-platform access-denial incident.
--
-- FULL-CHANGE CONTRACT (changeover doctrine §8a) + BIVALENT SEQUENCING (§8a-1):
-- deployed writers still send `organization_id: null` (matrx-frontend
-- features/marketing/search-console/data-class-rules.ts + data-dig.ts pass a
-- nullable organizationId straight through). The NOT NULL flip and the
-- `public._stamp_org_default` BEFORE-INSERT backstop are attached in THIS ONE
-- transaction — db-rules §2 law — so an org-forgetting write is filled from the
-- creator's personal org instead of becoming a 23502. Old and new writers both
-- work across the deploy window.

BEGIN;

-- ── 1. visibility column (positive add; closed default, no row loses reach) ──
ALTER TABLE seo.gsc_dig_rule
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'internal';
ALTER TABLE seo.keyword_class_rule
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'internal';

-- ── 2. Move the ownerless builtins onto the platform-global tier ─────────────
UPDATE seo.gsc_dig_rule
   SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
       visibility      = 'public'::platform.visibility
 WHERE organization_id IS NULL;

UPDATE seo.keyword_class_rule
   SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
       visibility      = 'public'::platform.visibility
 WHERE organization_id IS NULL;

-- ── 3. NOT NULL + the backstop, in the SAME migration (db-rules §2) ──────────
ALTER TABLE seo.gsc_dig_rule       ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE seo.keyword_class_rule ALTER COLUMN organization_id SET NOT NULL;

-- The FK was never declared on either table (hand-rolled DDL, 2026-08-13).
-- Qualified by conrelid, never by name alone — db-rules §10.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'seo.gsc_dig_rule'::regclass
                    AND conname = 'gsc_dig_rule_organization_id_fkey') THEN
    ALTER TABLE seo.gsc_dig_rule
      ADD CONSTRAINT gsc_dig_rule_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES iam.organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'seo.keyword_class_rule'::regclass
                    AND conname = 'keyword_class_rule_organization_id_fkey') THEN
    ALTER TABLE seo.keyword_class_rule
      ADD CONSTRAINT keyword_class_rule_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES iam.organizations(id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS _stamp_org_default ON seo.gsc_dig_rule;
CREATE TRIGGER _stamp_org_default BEFORE INSERT ON seo.gsc_dig_rule
  FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default();

DROP TRIGGER IF EXISTS _stamp_org_default ON seo.keyword_class_rule;
CREATE TRIGGER _stamp_org_default BEFORE INSERT ON seo.keyword_class_rule
  FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default();

-- ── 4. Re-judge the variant: component → entity (db-rules §10) ───────────────
-- The composition rows in platform.entity_relationships STAY. They are no
-- longer the RLS authority, but iam.has_access_for_base still walks
-- composition/containment parents at the end of its ladder, so a site-pinned
-- user rule keeps resolving through the site the way it does today.
UPDATE platform.entity_types
   SET is_component = false,
       rls_variant  = 'entity',
       default_visibility = 'internal'::platform.visibility
 WHERE token IN ('seo_gsc_dig_rule', 'seo_keyword_class_rule');

-- A component's created_by is stamped from its parent (THE COMPONENT OWNERSHIP
-- LAW, §6d-1). On an entity, created_by IS the owner and MUST be the real
-- creator — `zzz_component_created_by` would overwrite it with the site's owner
-- and hand that user owner-rights over another user's rule.
DROP TRIGGER IF EXISTS zzz_component_created_by ON seo.gsc_dig_rule;
DROP TRIGGER IF EXISTS zzz_component_created_by ON seo.keyword_class_rule;

-- ── 5. Regenerate the policies from the generator, never by hand ─────────────
SELECT iam.apply_rls('seo', 'gsc_dig_rule',       'seo_gsc_dig_rule',       'entity');
SELECT iam.apply_rls('seo', 'keyword_class_rule', 'seo_keyword_class_rule', 'entity');

-- ── 6. Assertions — this migration proves itself or it does not land ─────────
DO $$
DECLARE v_n integer; v_bad integer;
BEGIN
  SELECT count(*) INTO v_n FROM seo.gsc_dig_rule WHERE organization_id IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'gsc_dig_rule still has % NULL-org rows', v_n; END IF;
  SELECT count(*) INTO v_n FROM seo.keyword_class_rule WHERE organization_id IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'keyword_class_rule still has % NULL-org rows', v_n; END IF;

  SELECT count(*) INTO v_n
    FROM information_schema.columns
   WHERE table_schema='seo' AND table_name IN ('gsc_dig_rule','keyword_class_rule')
     AND column_name='organization_id' AND is_nullable='YES';
  IF v_n <> 0 THEN RAISE EXCEPTION 'organization_id still nullable on % table(s)', v_n; END IF;

  -- The backstop is what makes the NOT NULL flip survivable (db-rules §2).
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE t.tgrelid IN ('seo.gsc_dig_rule'::regclass, 'seo.keyword_class_rule'::regclass)
     AND NOT t.tgisinternal AND t.tgfoid = 'public._stamp_org_default'::regproc;
  IF v_n <> 2 THEN RAISE EXCEPTION 'org backstop missing (found % of 2)', v_n; END IF;

  -- Every builtin must sit on the global-readable system org.
  SELECT count(*) INTO v_bad FROM (
    SELECT organization_id FROM seo.gsc_dig_rule WHERE is_template
    UNION ALL
    SELECT organization_id FROM seo.keyword_class_rule WHERE is_template
  ) s WHERE organization_id NOT IN (
    SELECT organization_id FROM iam.system_orgs WHERE global_readable);
  IF v_bad <> 0 THEN RAISE EXCEPTION '% builtin row(s) are not on a global_readable system org', v_bad; END IF;

  -- And the policy set must no longer be the component set.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='seo' AND tablename IN ('gsc_dig_rule','keyword_class_rule')
     AND policyname='std_insert' AND with_check LIKE '%accessible_entity_ids%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'component INSERT policy survived on % table(s)', v_n; END IF;
END $$;

COMMIT;
