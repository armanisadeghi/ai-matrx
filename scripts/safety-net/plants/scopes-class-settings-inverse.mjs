// Lane SN-SCOPES (2026-10-01): the real break put back — the inverse migration of the fix that
// scopes.sql-class-settings proves, executed inside the suite's own rolled-back transaction. S15, S16 must go RED.
export default {
  id: "scopes-class-settings-inverse",
  check: "scopes.sql-class-settings",
  items: ['S15', 'S16'],
  description: "a class's disabled join code stays in the store (a removed setting is never cleared)",
  mode: "in-transaction",
  apply: "\\i migrations/inverse/scopesaccess_a_removed_scope_setting_leaves_the_store_down.sql",
};
