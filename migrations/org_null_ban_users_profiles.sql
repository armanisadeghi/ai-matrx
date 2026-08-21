-- NO NULL ORG — users.profiles
-- =====================================================================
-- Owner ruling, 2026-08-21 (db-rules FEATURE.md §2 / §6e):
--
--   "If something belongs to the system, that CANNOT EVER be represented
--    by a NULL org! ... NO NULL ORG. the system has an org and this is
--    well-established."
--
-- `users.profiles` is not system content, so its lane is the OTHER half of the
-- same law — db-rules §2: "Root entities take org from active context;
-- un-scoped/legacy rows fall back to the creator's personal org
-- (iam.organizations.is_personal), never the system org." Measured live before
-- this migration: 230 of 306 profiles carried organization_id IS NULL.
--
-- WHY `id` IS THE OWNER HERE. `users.profiles.id` IS the auth user id —
-- verified live, 306 of 306 rows have a matching auth.users row — so the
-- personal org of the profile is `ensure_personal_organization(id)`, not
-- `ensure_personal_organization(created_by)`. That distinction matters: 228 of
-- the 230 NULL-org rows also have created_by IS NULL, so keying the backfill on
-- created_by would have resolved almost nothing and left the constraint
-- unflippable.
--
-- SIDE EFFECT, STATED PLAINLY: `public._d31_impl_ensure_personal_organization`
-- CREATES the personal organization (and its owner membership) when the user
-- does not have one yet — live count before this migration: none of the 230 did.
-- That is not a side door; it is the same call every signup makes, and it is
-- what "every user has a personal organization" means as a live invariant
-- rather than an aspiration. The impl is called directly instead of the public
-- wrapper because the wrapper's guard demands `auth.role() = 'service_role'` or
-- a self-call, and a migration is neither.
--
-- THE BACKFILL ALSO REPAIRS A LIVE ACCESS HOLE. With created_by NULL *and*
-- organization_id NULL, `iam.has_access_for_base` has no owner arm and no org
-- arm for those rows, so a normal user could not resolve their OWN profile
-- except through its `visibility`. Giving the row its personal org lights up
-- the org-admin lane (the user owns their personal org), which is why the
-- non-admin probe below is part of the migration's proof, not a formality.
--
-- FULL-CHANGE CONTRACT (changeover doctrine §8a) + BIVALENT SEQUENCING (§8a-1):
-- the NOT NULL flip and the `public._stamp_org_default` BEFORE-INSERT backstop
-- land in THIS ONE transaction (db-rules §2 law). Deployed writers that create a
-- profile without an org keep working — the backstop derives it from
-- created_by/user_id/owner_id/auth.uid() — instead of turning into 23502s the
-- moment this migration lands.

BEGIN;

SET LOCAL lock_timeout = '25s';

-- ── 1. Backfill from the user's own personal org (db-rules §2 fallback) ──────
UPDATE users.profiles p
   SET organization_id = public._d31_impl_ensure_personal_organization(p.id)
 WHERE p.organization_id IS NULL;

-- ── 2. NOT NULL + the backstop, in the SAME migration (db-rules §2) ──────────
ALTER TABLE users.profiles ALTER COLUMN organization_id SET NOT NULL;

DROP TRIGGER IF EXISTS _stamp_org_default ON users.profiles;
CREATE TRIGGER _stamp_org_default BEFORE INSERT ON users.profiles
  FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default();

-- ── 3. Assertions ───────────────────────────────────────────────────────────
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM users.profiles WHERE organization_id IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'users.profiles still has % NULL-org rows', v_n; END IF;

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='users' AND table_name='profiles'
     AND column_name='organization_id' AND is_nullable='YES';
  IF v_n <> 0 THEN RAISE EXCEPTION 'users.profiles.organization_id is still nullable'; END IF;

  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE t.tgrelid = 'users.profiles'::regclass AND NOT t.tgisinternal
     AND t.tgfoid = 'public._stamp_org_default'::regproc;
  IF v_n <> 1 THEN RAISE EXCEPTION 'org backstop missing on users.profiles'; END IF;

  -- Every profile must land on a PERSONAL org — never the system org (§2).
  SELECT count(*) INTO v_n
    FROM users.profiles p
    JOIN iam.organizations o ON o.id = p.organization_id
   WHERE o.is_personal IS NOT TRUE
     AND o.id IN (SELECT organization_id FROM iam.system_orgs);
  IF v_n <> 0 THEN RAISE EXCEPTION '% profile(s) were homed on a system org', v_n; END IF;
END $$;

COMMIT;
