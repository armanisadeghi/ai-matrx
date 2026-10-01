// Lane SN-SCOPES (2026-10-01): the real break put back — the inverse migration of the fix that
// scopes.sql-homes proves, executed inside the suite's own rolled-back transaction. S01, S02, S03 must go RED.
export default {
  id: "scopes-homes-inverse",
  check: "scopes.sql-homes",
  items: ['S01', 'S02', 'S03'],
  description: "a type's, a field's and a scope's own words lose their homes in the store (SCOPES-STORE-HOMES' inverse)",
  mode: "in-transaction",
  apply: "\\i migrations/inverse/scopeshomes_every_column_a_scope_reader_uses_has_a_home_in_the_store_down.sql",
};
