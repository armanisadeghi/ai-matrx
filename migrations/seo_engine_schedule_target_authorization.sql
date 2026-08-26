-- ============================================================================
-- D260 — A SCHEDULE MAY ONLY TARGET WHAT ITS OWNER OWNS (2026-08-25)
--
-- `seo.engine_schedule` has an OWNER column (`organization_id`) and TARGET
-- columns (`scope_organization_id`, `site_id`). Canonical RLS checks the owner
-- and nothing else, so an ordinary member of org A could insert a row they own
-- that points at org B's site — and the dispatcher, which runs as service_role
-- with no RLS, would faithfully spend org B's budget on it. Proven live as a
-- plain member: the insert was ALLOWED and `engine_schedules_due` then returned
-- the victim org's site at 2,000 keywords/run, hourly.
--
-- This is NOT a new security layer over an existing rule (db-rules §6). It is
-- the missing half of the rule already there: RLS says WHO MAY WRITE THE ROW;
-- nothing said WHAT THE ROW MAY POINT AT. A trigger is the only place that can
-- say it, because the answer depends on another table (`web.site`).
--
--   organization tier → the target org MUST be the owning org.
--   site tier         → the target site MUST belong to the owning org.
--   system tier       → governs every org, so it is platform-admin only.
--
-- Deliberately NOT over-tightened: a member may still schedule anything inside
-- their own organization, which is the whole point of the customer-facing
-- console. Existing rows are unaffected (all currently conform).
-- ============================================================================

CREATE OR REPLACE FUNCTION seo.fn_engine_schedule_target_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_site_org uuid;
BEGIN
  IF NEW.scope_tier = 'organization' THEN
    IF NEW.scope_organization_id IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION
        'engine_schedule: an organization schedule must target its own organization'
        USING ERRCODE = '42501';
    END IF;

  ELSIF NEW.scope_tier = 'site' THEN
    SELECT s.organization_id INTO v_site_org FROM web.site s WHERE s.id = NEW.site_id;
    IF v_site_org IS NULL THEN
      RAISE EXCEPTION 'engine_schedule: site % does not exist', NEW.site_id
        USING ERRCODE = '42501';
    END IF;
    IF v_site_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION
        'engine_schedule: that site belongs to another organization'
        USING ERRCODE = '42501';
    END IF;

  ELSIF NEW.scope_tier = 'system' THEN
    -- A system row governs every organization on the platform, so a PERSON must
    -- be a platform admin to set one. A background writer (the dispatcher
    -- stamping `last_dispatched_at`, a migration, the scheduler) has no JWT and
    -- therefore no `auth.uid()` — it is not a user escalating privilege, and
    -- blocking it would wedge the very automation these rows exist to drive.
    -- Caught live: the first claim against a system row failed on this check.
    IF (SELECT auth.uid()) IS NOT NULL AND NOT public.is_platform_admin() THEN
      RAISE EXCEPTION
        'engine_schedule: only a platform admin may set the system-wide schedule'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS engine_schedule_target_guard ON seo.engine_schedule;
CREATE TRIGGER engine_schedule_target_guard
  BEFORE INSERT OR UPDATE ON seo.engine_schedule
  FOR EACH ROW EXECUTE FUNCTION seo.fn_engine_schedule_target_guard();
