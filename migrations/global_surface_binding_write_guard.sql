-- global_surface_binding_write_guard.sql
--
-- Adversarial-review fix on the agent_surface → associations cutover.
--
-- A `binding:global` agent→surface edge is shown to EVERY viewer of
-- `agent.menu_surface` (including anon), but `assoc_add` only checks
-- `iam.has_org_access` on the caller-supplied access org — so any
-- authenticated user could publish a platform-wide binding. Global-tier
-- binding writes are a super-admin capability.
--
-- Guard trigger (loud, DB-edge): allows service_role / no-JWT server paths
-- (auth.uid() is null) and super admins; everyone else gets 42501.
-- Idempotent.

CREATE OR REPLACE FUNCTION agent.guard_global_surface_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.source_type = 'agent' AND NEW.target_type = 'surface'
     AND NEW.role = 'binding:global' THEN
    IF (SELECT auth.uid()) IS NOT NULL AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'global-tier agent↔surface bindings are super-admin only (agent=%, surface target=%)',
        NEW.source_id, NEW.target_id
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_global_surface_binding ON platform.associations;
CREATE TRIGGER trg_guard_global_surface_binding
  BEFORE INSERT OR UPDATE ON platform.associations
  FOR EACH ROW EXECUTE FUNCTION agent.guard_global_surface_binding();
