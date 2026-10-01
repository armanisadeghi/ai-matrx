// Lane SN-SCOPES (2026-10-01): the real break put back — the inverse migration of the fix that
// scopes.sql-handoff-references proves, executed inside the suite's own rolled-back transaction. S10 must go RED.
export default {
  id: "scopes-handoff-references-inverse",
  check: "scopes.sql-handoff-references",
  items: ['S10'],
  description: "a reference reaches the agent as a bare id from the store (CONTEXT-PARITY's inverse)",
  mode: "in-transaction",
  apply: "\\i migrations/inverse/contextparity_a_reference_reaches_the_agent_as_the_reference_the_current_system_hands_down.sql",
};
