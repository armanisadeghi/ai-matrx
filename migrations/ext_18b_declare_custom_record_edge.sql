-- ext_18b_declare_custom_record_edge.sql
-- HRB-010 / C6 -- RD-1's "custom_record -> <core token>" edges, corrected.
--
-- 🚨 RD-1's PREMISE WAS WRONG ABOUT THE MECHANISM, verified live. ext_03's header claimed
-- an ABSENT association_types row already means "no conveyance". It does not:
-- platform.enforce_known_association is a trigger on platform.associations that REFUSES an
-- edge whose (source_type, target_type) pair is not declared at all. So RD-1's edges must
-- be declared -- and declaring all 433 live tokens is precisely the unbounded registry RD-1
-- refuses. Resolution: one declaration helper a module calls for its own token (the same
-- shape as adopt_custom_fields), plus seeds for the five HR v1 tokens (ext_18c).
-- SPEC-EXTENSIBILITY RD-1 owes this correction.
--
-- The declaration is ALWAYS container_side = 'none'. Conveyance for a custom edge would let
-- a tenant grant access by drawing a line in a form; if a future case needs it, that is a
-- new declared row and a NEW DECISION, never a default.

CREATE OR REPLACE FUNCTION platform.declare_custom_record_edge(p_target_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE v_note constant text :=
  'RD-1 custom-record edge, declared by platform.declare_custom_record_edge. container_side=none in BOTH directions: a custom relationship is never an access grant. label is NULL so the type accepts any role-carrying edge (platform.enforce_known_association reads a non-NULL label as an exact-match pin).';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = p_target_token AND is_active) THEN
    RAISE EXCEPTION 'declare_custom_record_edge: % is not an active entity token', p_target_token
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_target_token = 'custom_record' THEN
    RAISE EXCEPTION 'declare_custom_record_edge: the custom_record self-edge is seeded at build'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ONE statement: every write to association_types fires a STATEMENT-level trigger that
  -- runs a FULL platform.rebuild_reachability().
  INSERT INTO platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
  VALUES ('custom_record', p_target_token, NULL, 'none', 'viewer', true, v_note),
         (p_target_token, 'custom_record', NULL, 'none', 'viewer', true, v_note)
  ON CONFLICT (source_type, target_type) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'token', p_target_token);
END $fn$;

GRANT EXECUTE ON FUNCTION platform.declare_custom_record_edge(text) TO service_role;
