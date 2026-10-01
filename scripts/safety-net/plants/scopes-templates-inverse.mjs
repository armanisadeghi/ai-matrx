// Lane SN-SCOPES (2026-10-01): the real break put back — the inverse migration of the fix that
// scopes.sql-templates proves, executed inside the suite's own rolled-back transaction. S04 must go RED.
export default {
  id: "scopes-templates-inverse",
  check: "scopes.sql-templates",
  items: ['S04'],
  description: "a template is applied by writing the old context tables again, not through the store's doors",
  mode: "in-transaction",
  apply: "\\i migrations/inverse/scopestails_a_template_is_applied_through_the_store_doors_down.sql",
};
