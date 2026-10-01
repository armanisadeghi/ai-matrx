// Lane SN-SCOPES (2026-10-01): the real break put back — the inverse migration of the fix that
// scopes.sql-member-edits proves, executed inside the suite's own rolled-back transaction. S11 must go RED.
export default {
  id: "scopes-member-edits-inverse",
  check: "scopes.sql-member-edits",
  items: ['S11'],
  description: "a member is only a viewer of a scope in the store (the member editor level removed)",
  mode: "in-transaction",
  apply: "set local lock_timeout = '180s';\n\\i migrations/inverse/scopesaccess_a_member_edits_a_scope_as_she_does_today_down.sql",
};
