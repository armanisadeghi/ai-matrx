// Lane SN-SCOPES (2026-10-01): the real break put back — the inverse migration of the fix that
// scopes.sql-platform-tags-wall proves, executed inside the suite's own rolled-back transaction. S13 must go RED.
export default {
  id: "scopes-platform-tags-wall-inverse",
  check: "scopes.sql-platform-tags-wall",
  items: ['S13'],
  description: "a person of no organization can no longer read the platform's tags through the scopes door",
  mode: "in-transaction",
  apply: "\\i migrations/inverse/scopesaccess_platform_tags_are_read_through_the_scopes_door_down.sql",
};
