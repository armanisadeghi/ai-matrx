-- ENTITY-FIELDS 5 — INVERSE. Hands back a grant that could never work: an INVOKER body whose
-- first line calls custom.caller_role(), which authenticated may not execute. It exists so the
-- pair is reversible, not because anybody should run it.
GRANT EXECUTE ON FUNCTION custom.assert_client_may_reach(uuid, text) TO authenticated;
