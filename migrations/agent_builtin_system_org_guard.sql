-- Builtin agents are ALWAYS owned by the Matrx System org — enforced at the DB edge.
--
-- WHY: Under the canonical access model, "global/builtin" content is expressed by
-- OWNERSHIP (organization_id = the Matrx System tenant), not by NULLs. But every
-- creation path still encodes the dead "global = null org" model and writes
-- organization_id = NULL:
--   - lib/agents/actions.ts  createSystemAgentFromSeed        (admin "Create Manually")
--   - app/api/admin/agent-builtins/convert-from-agent/route.ts (convert user agent)
--   - public.agx_duplicate_agent / agx_duplicate_version (p_as_system=true)
-- and the convert route's UPDATE branch spreads the SOURCE user agent's snapshot,
-- which can even carry that user's org. Nothing backfills org on insert, so a freshly
-- created builtin is born with org=NULL and is INVISIBLE under iam.has_access's
-- platform-global tier (which keys on organization_id IN system_orgs). The 82 working
-- builtins were patched by a one-time sweep; the 55 broken ones got a user's org from
-- that same sweep (it keyed on user_id).
--
-- FIX: one invariant guard instead of N callsite patches. BEFORE INSERT/UPDATE on
-- agent.definition, any row with agent_type='builtin' is forced to organization_id =
-- system_org_id('system'). Silent on the normal null->system fill; LOUD (WARNING) when
-- it has to overwrite a non-null wrong org (a creation path or in-place flip leaked one
-- — that's a real bug to fix upstream); hard EXCEPTION if the system org isn't registered
-- (never silently mint an orphan builtin). This makes the whole class structurally
-- impossible across all current paths, future paths, and manual SQL.
--
-- Idempotent: CREATE OR REPLACE + DROP/CREATE TRIGGER + value-stable backfill.

CREATE OR REPLACE FUNCTION agent._enforce_builtin_system_org()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_sys uuid := public.system_org_id('system');
BEGIN
  IF NEW.agent_type = 'builtin' THEN
    IF v_sys IS NULL THEN
      RAISE EXCEPTION
        '[builtin-org-guard] system_org_id(''system'') is not registered; cannot create/update a builtin agent. Register the Matrx System tenant in public.system_orgs first.';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM v_sys THEN
      -- Loud recovery: a non-system org reached a builtin row. Correct it and scream,
      -- because a proactive path (a creation callsite, a snapshot spread, an in-place
      -- agent_type flip) let it through and should be fixed. Stay silent on the benign
      -- null->system fill (paths that simply don't set the org).
      IF NEW.organization_id IS NOT NULL THEN
        RAISE WARNING
          '[builtin-org-guard] agent % had organization_id % (expected system org %); corrected to system org. Fix the upstream write path.',
          NEW.id, NEW.organization_id, v_sys;
      END IF;
      NEW.organization_id := v_sys;
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS _enforce_builtin_system_org ON agent.definition;
CREATE TRIGGER _enforce_builtin_system_org
  BEFORE INSERT OR UPDATE ON agent.definition
  FOR EACH ROW EXECUTE FUNCTION agent._enforce_builtin_system_org();

-- Data: re-home every existing builtin not already on the system org (the 55 stranded
-- on a user's workspace). Value-stable: re-running changes nothing once converged.
UPDATE agent.definition
SET organization_id = public.system_org_id('system')
WHERE agent_type = 'builtin'
  AND organization_id IS DISTINCT FROM public.system_org_id('system');
