-- NO NULL ORG — ui.ui_surface_agent_pref + ui.ui_surface_config
-- =====================================================================
-- Owner ruling, 2026-08-21 (db-rules FEATURE.md §2 "NO NULL ORG" / §6e):
--
--   "If something belongs to the system, that CANNOT EVER be represented
--    by a NULL org! ... NO NULL ORG. the system has an org and this is
--    well-established."
--
-- Sibling of org_null_ban_seo_builtin_rules.sql. Same ruling, HARDER SHAPE —
-- and the shape is the whole story, so read this header before the DDL.
--
-- ── WHAT IS ACTUALLY WRONG HERE ──────────────────────────────────────────
-- These two tables did not merely *allow* a NULL org. They made NULL a
-- LOAD-BEARING SCOPE TIER. From the launch migration (ui_surface_roles_and_config.sql):
--
--     -- scope tier: exactly one non-null, or all null = global (platform override)
--     CONSTRAINT ..._one_scope CHECK (
--       (user_id IS NOT NULL)::int + (organization_id IS NOT NULL)::int
--                                  + (scope_id IS NOT NULL)::int <= 1)
--
-- Four tiers — global / org / scope / user — encoded as "which column is
-- non-NULL", with all-NULL meaning global. Every partial unique index, every
-- RLS policy, and the client resolver (`tierOf` in
-- features/surfaces/services/surface-config.service.ts) read NULL as a value.
-- That is precisely what §2 bans: NULL is never a scope.
--
-- The `one_scope` CHECK is also why this could not be a copy of the seo
-- migration. `organization_id SET NOT NULL` against that CHECK is
-- UNSATISFIABLE: every user-tier row would have two non-NULL scope columns and
-- fail instantly. The constraint has to be re-founded, not patched.
--
-- ── THE RE-FOUNDING ──────────────────────────────────────────────────────
-- `organization_id` stops being a tier flag and becomes what it is on every
-- other canonical table: THE OWNING ORG OF THE ROW, present on all four tiers.
-- The tier discriminator is what remains:
--
--     global tier  →  organization_id = matrx-system, user_id/scope_id NULL
--     org tier     →  organization_id = <that org>,   user_id/scope_id NULL
--     scope tier   →  scope_id  = <scope>   (org = the scope's owning org)
--     user tier    →  user_id   = <user>    (org = the user's personal org)
--
-- "Global" is now literally "the org tier, for the system org" — which is the
-- ruling's point restated: the system HAS an org, so system-scoped content is
-- ordinary org-scoped content that happens to be owned by matrx-system
-- (39c38960-d30c-4840-b0c1-c9960de95582, `iam.system_orgs.global_readable`).
-- No tier is lost and no discriminator column is invented.
--
-- This is not a new pattern in this codebase — it is the one
-- platform.associations already settled. See the comment in
-- features/surfaces/services/bind-agent-to-surface.service.ts:81 — "assoc_add
-- stamps an access org on EVERY edge, so `organization_id` alone cannot
-- identify [the tier]". Same conclusion, reached there first.
--
-- `one_scope` therefore becomes a two-column CHECK over (user_id, scope_id).
-- It still forbids the nonsense state (a row that is both user-tier and
-- scope-tier); it simply stops counting the ownership column as a tier.
--
-- ── LIVE CENSUS BEFORE THIS MIGRATION ────────────────────────────────────
--   ui.ui_surface_config          0 rows.
--   ui.ui_surface_agent_pref      4 rows — 3 user-tier (all with
--                                 created_by = user_id), 1 already on the
--                                 system org (a zz_fixture_role_probe row).
-- ZERO global-tier rows exist. So step 1 of the standard recipe ("move the
-- global rows onto the system org") is a genuine no-op here, and this
-- migration's real work is the SCHEMA that was still teaching NULL-as-a-scope
-- to every future writer. The backfill below fills the 3 user-tier rows'
-- ownership from their creator's personal org.
--
-- ── TWO DEFECTS FOUND WHILE MEASURING (both fixed here) ──────────────────
-- (1) THE BACKSTOP ON ui_surface_agent_pref WAS MIS-AIMED, and NOT NULL would
--     have weaponized it. Live:
--         trg_inherit_org BEFORE INSERT ... EXECUTE FUNCTION
--           platform.inherit_org_from_parent('agent','definition','agent_id')
--     It stamps the org of the AGENT the pref points at. A pref row is not
--     owned by the agent's author — it is "user U picked agent A for role R".
--     Today the column is nullable and the app always sends the tier
--     explicitly, so the trigger effectively never fires. Under NOT NULL it
--     fires on every org-forgetting write and stamps the AGENT AUTHOR'S org
--     onto a private user preference. With the org read lane live (below),
--     that is not a mis-label, it is a LEAK: pick a platform agent and your
--     personal preference row becomes org work product of the agent's org.
--     Replaced with `public._stamp_org_default`, which resolves the org from
--     created_by / user_id / auth.uid() — the row's actual owner. This is the
--     same backstop ui_surface_config already carries.
--
-- (2) BOTH TABLES ARE REGISTERED `rls_variant='entity'` BUT HAVE NEVER HAD
--     iam.apply_rls RUN ON THEM. The live policies are still the hand-written
--     set from the launch migration, and every one of their read lanes is
--     keyed on `organization_id IS NULL`. Hand-edited policies are banned
--     (db-rules §6d) and these could not survive the flip anyway. Regenerated
--     from the generator below.
--
-- ── VISIBILITY (§6a-1 requires the choice to be justified here) ──────────
-- The `visibility` column is NOT decoration on this migration — without it the
-- flip would go DARK, which is the §10 failure the seo migration was written
-- to end. `platform.entity_row_access_attrs` falls back to 'personal' for a
-- table with no visibility column, and BOTH lanes that would have to carry
-- these rows are gated on `v_vis >= 'internal'`:
--     * the global-readable system-org lane  (iam.has_access_for_base)
--     * the org-member lane                  (same function, `has_org_access`)
-- So on a visibility-less table, moving a row to the system org makes it
-- readable by NOBODY except its creator and org admins. Measured, not assumed.
-- Therefore:
--   * column DEFAULT 'internal' — a surface preference is ORG WORK PRODUCT.
--     Deliberately not 'public': `pub_read` is an anon lane and one user's
--     choice of assistant does not belong on the open internet.
--   * system-org (global-tier) rows are set 'public'. Today's hand-written
--     `*_read_anon` policies DO serve all-NULL global rows to anon, so
--     'public' is what preserves the reach these rows already have — and it
--     makes them readable through the public lane independently of the
--     global_readable registry lane, so a global pref can never go dark for a
--     registry reason.
--   * NOT 'personal' on either: §6a-1 reserves that for a user's own personal
--     artifacts, and reaching for it here is the exact reflex behind the
--     marketing-platform access-denial incident.
--
-- ── ONE DELIBERATE CONTRACT CHANGE, STATED PLAINLY ──────────────────────
-- The hand-written INSERT policies required `is_org_admin(organization_id)` to
-- write an org-tier row. The generated `entity` INSERT lane requires
-- `iam.has_org_access(organization_id)` — org MEMBERSHIP. So an ordinary org
-- member can now create an org-tier row (UPDATE/DELETE of a row they did not
-- create still needs editor, i.e. org admin, via iam.has_access). This is a
-- loosening, and it is intentional: it is the canonical entity contract, and
-- moving TOWARD the contract is never an occasion to ask (canonical-contract
-- supremacy). The UI already only offers org-tier writes to owner/admin
-- (SurfaceHubDetailPage `realOrgs`), so no shipped surface changes behavior.
--
-- ── FULL-CHANGE CONTRACT (§8a) + BIVALENT SEQUENCING (§8a-1) ────────────
-- Deployed writers still send `organization_id: null` for user- and
-- global-tier writes. The NOT NULL flip and the `_stamp_org_default` backstop
-- land in THIS ONE TRANSACTION — db-rules §2 law — so an org-forgetting write
-- from an old bundle is filled from the creator's personal org instead of
-- becoming a 23502. Old and new writers both work across the deploy window.
-- The one case the backstop cannot rescue is an OLD bundle writing the GLOBAL
-- tier (all-NULL): it lands on the admin's personal org instead of the system
-- org. That is a super-admin-only action on an admin screen, it is visible and
-- correctable, and it fails toward "too private" rather than toward a leak.

BEGIN;

-- ── 1. visibility (positive add; closed default, no row loses reach) ────────
ALTER TABLE ui.ui_surface_agent_pref
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'internal';
ALTER TABLE ui.ui_surface_config
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'internal';

-- ── 2. Re-found the tier model: org is ownership, not a tier ────────────────
-- Drop FIRST: the backfill in step 3 would violate the old CHECK the moment a
-- user-tier row gains an organization_id.
ALTER TABLE ui.ui_surface_agent_pref DROP CONSTRAINT IF EXISTS ui_surface_agent_pref_one_scope;
ALTER TABLE ui.ui_surface_config     DROP CONSTRAINT IF EXISTS ui_surface_config_one_scope;

ALTER TABLE ui.ui_surface_agent_pref ADD CONSTRAINT ui_surface_agent_pref_one_scope CHECK (
  (CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN scope_id IS NOT NULL THEN 1 ELSE 0 END) <= 1);
ALTER TABLE ui.ui_surface_config ADD CONSTRAINT ui_surface_config_one_scope CHECK (
  (CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN scope_id IS NOT NULL THEN 1 ELSE 0 END) <= 1);

-- ── 3. Give every row its owning org ───────────────────────────────────────
-- (a) Global tier -> the system org. No such row exists live; this is the
--     lane's definition, written so a row created between measurement and
--     apply is carried correctly rather than falling into (b).
UPDATE ui.ui_surface_agent_pref
   SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
       visibility      = 'public'::platform.visibility
 WHERE organization_id IS NULL AND user_id IS NULL AND scope_id IS NULL;
UPDATE ui.ui_surface_config
   SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
       visibility      = 'public'::platform.visibility
 WHERE organization_id IS NULL AND user_id IS NULL AND scope_id IS NULL;

-- Any row already sitting on the system org IS the global tier, whether it got
-- there through (a) or was written that way (the live zz_fixture_role_probe
-- row was). It must carry the global tier's visibility either way.
UPDATE ui.ui_surface_agent_pref SET visibility = 'public'::platform.visibility
 WHERE organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   AND user_id IS NULL AND scope_id IS NULL AND visibility <> 'public';
UPDATE ui.ui_surface_config SET visibility = 'public'::platform.visibility
 WHERE organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   AND user_id IS NULL AND scope_id IS NULL AND visibility <> 'public';

-- (b) User tier -> the owner's personal org. `ensure_personal_organization`
--     is the canonical resolver and is idempotent; it is the same function
--     `_stamp_org_default` calls, so backfilled rows and future rows land on
--     the identical org.
UPDATE ui.ui_surface_agent_pref
   SET organization_id = public.ensure_personal_organization(COALESCE(created_by, user_id))
 WHERE organization_id IS NULL AND COALESCE(created_by, user_id) IS NOT NULL;
UPDATE ui.ui_surface_config
   SET organization_id = public.ensure_personal_organization(COALESCE(created_by, user_id))
 WHERE organization_id IS NULL AND COALESCE(created_by, user_id) IS NOT NULL;

-- (c) Scope tier -> the org that owns the ctx scope.
UPDATE ui.ui_surface_agent_pref p
   SET organization_id = st.organization_id
  FROM context.scopes s JOIN context.scope_types st ON st.id = s.scope_type_id
 WHERE p.organization_id IS NULL AND p.scope_id IS NOT NULL AND s.id = p.scope_id;
UPDATE ui.ui_surface_config c
   SET organization_id = st.organization_id
  FROM context.scopes s JOIN context.scope_types st ON st.id = s.scope_type_id
 WHERE c.organization_id IS NULL AND c.scope_id IS NOT NULL AND s.id = c.scope_id;

-- ── 4. Tier uniqueness, rebuilt for the new shape ──────────────────────────
-- THE INDEX THAT WOULD HAVE BROKEN USER PREFS: the `_org` indexes are
-- predicated only on `organization_id IS NOT NULL`. After the flip that is
-- EVERY row, so two colleagues in one org each setting their own user-tier
-- selection for the same (surface, role, position) would collide on a unique
-- index meant for the org tier. Every `_org` index gains the tier predicate
-- `user_id IS NULL AND scope_id IS NULL`, which is what "org tier" now means.
-- The `_global` indexes are predicated on all-three-NULL, which the NOT NULL
-- flip makes unsatisfiable — they are dead weight, and the global tier is now
-- covered by the `_org` index (matrx-system is an org like any other).
DROP INDEX IF EXISTS ui.ui_surface_agent_pref_sel_global;
DROP INDEX IF EXISTS ui.ui_surface_agent_pref_roster_global;
DROP INDEX IF EXISTS ui.ui_surface_config_unique_global;

DROP INDEX IF EXISTS ui.ui_surface_agent_pref_sel_org;
CREATE UNIQUE INDEX ui_surface_agent_pref_sel_org
  ON ui.ui_surface_agent_pref (surface_name, role_name, "position", organization_id)
  WHERE kind = 'selection' AND user_id IS NULL AND scope_id IS NULL;

DROP INDEX IF EXISTS ui.ui_surface_agent_pref_roster_org;
CREATE UNIQUE INDEX ui_surface_agent_pref_roster_org
  ON ui.ui_surface_agent_pref (surface_name, role_name, agent_id, organization_id)
  WHERE kind = 'roster_item' AND user_id IS NULL AND scope_id IS NULL;

DROP INDEX IF EXISTS ui.ui_surface_config_unique_org;
CREATE UNIQUE INDEX ui_surface_config_unique_org
  ON ui.ui_surface_config (surface_name, namespace, organization_id)
  WHERE user_id IS NULL AND scope_id IS NULL;

-- The `_user` and `_scope` indexes stay exactly as they are: their predicates
-- were always keyed on their own tier column being NOT NULL, never on
-- organization_id being NULL, so the flip does not reach them.

-- ── 5. NOT NULL + the backstop, in the SAME migration (db-rules §2) ─────────
-- Defect (1) from the header: this trigger stamps the *agent's* org onto a
-- user's private preference. It must die in the same statement group that
-- makes the column mandatory, or NOT NULL turns a dormant bug into a leak.
DROP TRIGGER IF EXISTS trg_inherit_org ON ui.ui_surface_agent_pref;

-- The SCOPE tier owns its org structurally: a ctx-scope row belongs to the org
-- that owns the scope (`context.scopes.organization_id`), never to whoever
-- happened to write it. So it gets a parent-inherit backstop of its own —
-- pointed at the scope, which is the parent that actually confers ownership,
-- unlike the agent FK the dropped trigger was aimed at.
--
-- NAME ORDER IS THE MECHANISM: triggers fire alphabetically, and both of these
-- are BEFORE INSERT. `_inherit_org_from_scope` sorts before `_stamp_org_default`
-- ('i' < 's'), so the scope's org is resolved FIRST and the personal-org
-- backstop then no-ops (it returns immediately when organization_id is set).
-- Reverse the names and every scope-tier row would silently land on the
-- writer's personal org instead.
DROP TRIGGER IF EXISTS _inherit_org_from_scope ON ui.ui_surface_agent_pref;
CREATE TRIGGER _inherit_org_from_scope BEFORE INSERT ON ui.ui_surface_agent_pref
  FOR EACH ROW EXECUTE FUNCTION platform.inherit_org_from_parent('context', 'scopes', 'scope_id');

DROP TRIGGER IF EXISTS _inherit_org_from_scope ON ui.ui_surface_config;
CREATE TRIGGER _inherit_org_from_scope BEFORE INSERT ON ui.ui_surface_config
  FOR EACH ROW EXECUTE FUNCTION platform.inherit_org_from_parent('context', 'scopes', 'scope_id');

DROP TRIGGER IF EXISTS _stamp_org_default ON ui.ui_surface_agent_pref;
CREATE TRIGGER _stamp_org_default BEFORE INSERT ON ui.ui_surface_agent_pref
  FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default();

DROP TRIGGER IF EXISTS _stamp_org_default ON ui.ui_surface_config;
CREATE TRIGGER _stamp_org_default BEFORE INSERT ON ui.ui_surface_config
  FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default();

ALTER TABLE ui.ui_surface_agent_pref ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE ui.ui_surface_config     ALTER COLUMN organization_id SET NOT NULL;

-- ── 6. Registry: declare the visibility the tables now carry ───────────────
UPDATE platform.entity_types
   SET default_visibility = 'internal'::platform.visibility
 WHERE token IN ('ui_surface_agent_pref', 'ui_surface_config');

-- ── 7. Regenerate the policies from the generator, never by hand ───────────
-- Defect (2) from the header. apply_rls drops the whole hand-written set —
-- including the `*_read_anon` policies, whose reach is preserved by
-- visibility='public' on the global tier through the generated `pub_read`.
SELECT iam.apply_rls('ui', 'ui_surface_agent_pref', 'ui_surface_agent_pref', 'entity');
SELECT iam.apply_rls('ui', 'ui_surface_config',     'ui_surface_config',     'entity');

-- ── 8. Assertions — this migration proves itself or it does not land ───────
DO $$
DECLARE v_n integer; v_sys uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
BEGIN
  -- No NULL org survives, and the column can never accept one again.
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='ui' AND table_name IN ('ui_surface_agent_pref','ui_surface_config')
     AND column_name='organization_id' AND is_nullable='YES';
  IF v_n <> 0 THEN RAISE EXCEPTION 'organization_id still nullable on % ui table(s)', v_n; END IF;

  -- The backstop is what makes the NOT NULL flip survivable (db-rules §2)...
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE t.tgrelid IN ('ui.ui_surface_agent_pref'::regclass,'ui.ui_surface_config'::regclass)
     AND NOT t.tgisinternal AND t.tgfoid = 'public._stamp_org_default'::regproc;
  IF v_n <> 2 THEN RAISE EXCEPTION 'org backstop missing (found % of 2)', v_n; END IF;

  -- ...and the mis-aimed inherit must be gone, not merely outvoted. The only
  -- inherit trigger allowed on these tables now is the scope one, and it must
  -- sort BEFORE the personal-org backstop or the scope tier loses its owner.
  IF EXISTS (SELECT 1 FROM pg_trigger
              WHERE tgrelid='ui.ui_surface_agent_pref'::regclass AND NOT tgisinternal
                AND tgfoid='platform.inherit_org_from_parent'::regproc
                AND tgname <> '_inherit_org_from_scope') THEN
    RAISE EXCEPTION 'agent-org inherit trigger survived on ui_surface_agent_pref';
  END IF;
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE t.tgrelid IN ('ui.ui_surface_agent_pref'::regclass,'ui.ui_surface_config'::regclass)
     AND NOT t.tgisinternal AND t.tgname = '_inherit_org_from_scope'
     AND t.tgname < '_stamp_org_default';
  IF v_n <> 2 THEN RAISE EXCEPTION 'scope-org inherit missing or mis-ordered (found % of 2)', v_n; END IF;

  -- The tier CHECK must no longer count the ownership column, or the user
  -- tier is unreachable. Asserted by BEHAVIOUR, not by reading the text.
  BEGIN
    INSERT INTO ui.ui_surface_agent_pref (surface_name, role_name, agent_id, kind, "position",
                                          user_id, organization_id)
    SELECT p.surface_name, p.role_name, p.agent_id, 'selection', 9999,
           p.created_by, p.organization_id
      FROM ui.ui_surface_agent_pref p WHERE p.user_id IS NOT NULL LIMIT 1;
    DELETE FROM ui.ui_surface_agent_pref WHERE "position" = 9999;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'one_scope still rejects a user-tier row that carries its owning org';
  END;

  -- Every global-tier row must be readable: on the system org AND visible
  -- enough for the global_readable lane (which is gated at >= internal).
  SELECT count(*) INTO v_n FROM (
    SELECT organization_id, visibility FROM ui.ui_surface_agent_pref
     WHERE user_id IS NULL AND scope_id IS NULL AND organization_id = v_sys
    UNION ALL
    SELECT organization_id, visibility FROM ui.ui_surface_config
     WHERE user_id IS NULL AND scope_id IS NULL AND organization_id = v_sys
  ) s WHERE visibility < 'internal'::platform.visibility;
  IF v_n <> 0 THEN RAISE EXCEPTION '% global-tier row(s) are below internal visibility — they would be DARK', v_n; END IF;

  -- The system org must actually be the global-readable one.
  IF NOT EXISTS (SELECT 1 FROM iam.system_orgs WHERE organization_id = v_sys AND global_readable) THEN
    RAISE EXCEPTION 'matrx-system is not global_readable — the global tier has no read lane';
  END IF;

  -- The generated policy set replaced the hand-written one.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='ui' AND tablename IN ('ui_surface_agent_pref','ui_surface_config')
     AND policyname NOT IN ('svc_all','std_select','std_insert','std_update','std_delete','pub_read');
  IF v_n <> 0 THEN RAISE EXCEPTION '% hand-written policy/policies survived apply_rls', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='ui' AND tablename IN ('ui_surface_agent_pref','ui_surface_config')
     AND policyname='pub_read';
  IF v_n <> 2 THEN RAISE EXCEPTION 'anon lane not regenerated (found % of 2 pub_read)', v_n; END IF;

  -- NO READ LANE may key on a NULL org — that was the whole defect. Scoped to
  -- USING (the read/edit authority) on purpose: `iam.apply_rls` still emits a
  -- permissive `organization_id is null` arm inside the generated std_insert
  -- WITH CHECK. On a NOT NULL column that arm is an unsatisfiable dead branch,
  -- it is IDENTICAL on every entity table the generator has ever produced, and
  -- policies come from the generator — hand-editing it here is exactly what
  -- db-rules §6d forbids. Retiring that arm platform-wide belongs to
  -- iam.apply_rls, and is filed as its own item; it is not this table's drift.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='ui' AND tablename IN ('ui_surface_agent_pref','ui_surface_config')
     AND coalesce(qual,'') LIKE '%organization_id IS NULL%';
  IF v_n <> 0 THEN RAISE EXCEPTION '% policy USING clause(s) still test organization_id IS NULL', v_n; END IF;
END $$;

COMMIT;
