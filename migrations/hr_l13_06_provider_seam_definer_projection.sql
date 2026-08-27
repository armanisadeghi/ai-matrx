-- HR L13 — migration 6 (register item HRB-025, lane lane-l13-export). Defect D269.
--
-- THE CLIENT-EXCLUDED COLUMN CONVENTION IS ENFORCED AT THE TABLE AND WAS BYPASSED ONE RPC AWAY.
--
-- `platform.entity_types.client_excluded_columns` for `hr_provider_binding` is
-- ARRAY['credential_ref','webhook_secret_ref','connector'], and `scripts/strip-client-excluded-
-- columns.ts` removes all three from the generated Row/Insert/Update shapes. But that stripper
-- walks `Tables:` and `Views:` ONLY — never `Functions:` — so a SECURITY DEFINER function that
-- re-projects the same columns re-exposes them, invisibly:
--
--   * the column is absent exactly where a reader greps to check the convention, and
--   * SECURITY DEFINER means the base table's RLS does not re-gate the read, and
--   * EXECUTE was granted to `authenticated`, i.e. any signed-in user via PostgREST.
--
-- Three functions in this lane were in that state. All three read `hr.provider_binding`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE FIX IS THE GRANT, NOT ONLY THE PROJECTION — AND `webhook_secret_ref` STAYS.
--    The obvious reading of "never return a secret reference" would delete `webhook_secret_ref`
--    from `provider_webhook_candidates`. That would break HMAC webhook verification outright: the
--    ONE caller (aidream `services/hr/providers/engine.py::verify_webhook`) reads exactly that
--    column to resolve the signing secret and compare it against the presented signature. A seam
--    that cannot verify a signature does not fail closed, it fails *open* — every webhook is then
--    either rejected or, worse, accepted unverified.
--    So the column stays and the REACH is removed: these are server-side seams, and no browser has
--    ever had a legitimate reason to call them. The client's own door to bindings is E-27
--    (`GET /hr/providers/{seam}/bindings` → `hr.provider_bindings_list`), whose projection is
--    already secret-free and already guarded in `hr_l13_05`. `authenticated`, `anon` and `PUBLIC`
--    lose EXECUTE here; `service_role` keeps it.
--    The guard below therefore asserts `webhook_secret_ref` is STILL PRESENT — deliberately, so
--    that a future reader who "tidies" it away has to argue with this comment first.
--
-- 2. `connector` IS DROPPED from `provider_webhook_candidates`, because it is dead weight there.
--    The caller unmarshals it into `Binding.connector` and neither `verify_webhook` nor
--    `consume_webhook` ever reads it (traced 2026-08-27). Python reads it as
--    `dict(row.get("connector") or {})`, so an absent key yields `{}` — no KeyError, no behaviour
--    change. Removing a registry-excluded column that nothing consumes costs nothing and shrinks
--    the projection to what the seam actually needs.
--    It is NOT dropped from `provider_binding_resolve` / `provider_sync_targets`: those feed the
--    REST and MCP adapters, which genuinely read `connector.routes` / `connector.tool_map` to know
--    where to send a dispatch. There the grant is the whole fix.
--    (All three already strip `- 'credentials'`, so token VALUES were never in any projection;
--    what leaked was the route/tool map, and the secret POINTER.)
--
-- 3. RETURN TYPE CHANGES MEAN DROP + CREATE. `CREATE OR REPLACE FUNCTION` cannot change a
--    function's OUT columns ("cannot change return type of existing function"), so the webhook
--    function is dropped and recreated. Nothing in the database depends on it — the only caller
--    resolves it by name at runtime — so the drop is safe without CASCADE, and CASCADE is
--    deliberately not used so that an unexpected dependency raises instead of being deleted.
--
-- Authority: SPEC-CONTRACTS §3.6, SPEC-UI-IA §4.2, D19, D269.
-- Applied live as `hr_l13_06_provider_seam_definer_projection`. Idempotent.
-- ===================================================================================

SET lock_timeout = '8s';

-- ── 1. Narrow the webhook projection (decision 2 + 3) ──────────────────────────────
DROP FUNCTION IF EXISTS hr.provider_webhook_candidates(text, text);

CREATE FUNCTION hr.provider_webhook_candidates(
  p_seam         text,
  p_provider_key text)
RETURNS TABLE (
  binding_id         uuid,
  organization_id    uuid,
  seam               text,
  provider_key       text,
  display_name       text,
  connector_kind     text,
  is_active          boolean,
  capabilities       text[],
  server_version_pin text,
  -- 🚨 STAYS. See recorded decision 1: the caller resolves the HMAC signing secret from this
  -- pointer. It is a `secret://…` REFERENCE, never a token value, and this function is no longer
  -- reachable by `authenticated`.
  webhook_secret_ref text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'hr', 'public'
AS $function$
  -- §3.6 MCP rule 3: "No webhook lane. E-33 does not accept MCP traffic." An MCP binding is
  -- excluded here rather than merely refused later, so its secret is never even a candidate.
  select pb.id, pb.organization_id, pb.seam, pb.provider_key, pb.display_name,
         pb.connector_kind, pb.is_active, pb.capabilities, pb.server_version_pin,
         pb.webhook_secret_ref
    from hr.provider_binding pb
   where pb.seam = p_seam
     and pb.provider_key = p_provider_key
     and pb.is_active
     and pb.deleted_at is null
     and pb.connector_kind <> 'mcp'
     and pb.webhook_secret_ref is not null
   order by pb.bound_at desc;
$function$;

-- ── 2. Remove client reach from every provider-seam DEFINER that re-projects an
--       excluded column of hr.provider_binding (decision 1) ──────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'hr.provider_webhook_candidates(text,text)',
    'hr.provider_binding_resolve(uuid,text,text)',
    'hr.provider_sync_targets(uuid,text,uuid,uuid[])'] LOOP
    IF to_regprocedure(f) IS NULL THEN
      RAISE EXCEPTION 'hr_l13_06: % does not exist', f;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- ── 3. The guard. Every claim above, asserted. ─────────────────────────────────────
DO $$
DECLARE f text; v_res text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'hr.provider_webhook_candidates(text,text)',
    'hr.provider_binding_resolve(uuid,text,text)',
    'hr.provider_sync_targets(uuid,text,uuid,uuid[])'] LOOP

    -- DECISION 1 — no client role may reach a DEFINER that re-projects an excluded column.
    IF has_function_privilege('authenticated', f, 'execute') THEN
      RAISE EXCEPTION 'hr_l13_06: authenticated can still execute %', f;
    END IF;
    IF has_function_privilege('anon', f, 'execute') THEN
      RAISE EXCEPTION 'hr_l13_06: anon can still execute %', f;
    END IF;
    -- ...and the server must not have lost it, or the seam is dead rather than secured.
    IF NOT has_function_privilege('service_role', f, 'execute') THEN
      RAISE EXCEPTION 'hr_l13_06: service_role lost execute on % — the seam is broken', f;
    END IF;
  END LOOP;

  v_res := pg_get_function_result(
             to_regprocedure('hr.provider_webhook_candidates(text,text)'));

  -- DECISION 2 — `connector` is gone. Matched as a `<name> <type>` pair, not a bare substring,
  -- because `connector_kind text` is a legitimate column in this same projection and a naive
  -- LIKE '%connector%' would flag it. A guard that cries wolf gets loosened by the next person.
  IF v_res LIKE '%connector jsonb%' THEN
    RAISE EXCEPTION 'hr_l13_06: the webhook projection still names connector';
  END IF;
  IF v_res LIKE '%credential_ref text%' THEN
    RAISE EXCEPTION 'hr_l13_06: the webhook projection names credential_ref';
  END IF;

  -- DECISION 1, the other direction — the secret POINTER must still be there. Deleting it would
  -- silently disable HMAC verification, which is a worse outcome than the leak this fixes.
  IF v_res NOT LIKE '%webhook_secret_ref text%' THEN
    RAISE EXCEPTION
      'hr_l13_06: webhook_secret_ref was removed — verify_webhook cannot resolve a signing secret';
  END IF;

  -- The E-27 client door must remain the secret-free one, and must remain reachable.
  IF NOT has_function_privilege('authenticated', 'hr.provider_bindings_list(uuid,text)', 'execute')
  THEN
    RAISE EXCEPTION 'hr_l13_06: E-27 lost its client grant — the client has no door to bindings';
  END IF;
END $$;
