// Lane SN-SCOPES (2026-10-01): the real break put back — the inverse migration of the fix that
// scopes.sql-restricted-field-agent proves, executed inside the suite's own rolled-back transaction. S14 must go RED.
export default {
  id: "scopes-restricted-field-agent-inverse",
  check: "scopes.sql-restricted-field-agent",
  items: ['S14'],
  description: "a column computed from a kept-out field is handed to the agent again",
  mode: "in-transaction",
  apply: "\\i migrations/inverse/storetails3_what_an_agent_may_see_follows_what_a_column_reads_down.sql",
};
