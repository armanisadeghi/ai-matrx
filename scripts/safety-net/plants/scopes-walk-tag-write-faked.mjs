// Lane SN-SCOPES (2026-10-01): the task's scope tag write (rpc/assoc_set_targets) answers "ok" in the
// test browser WITHOUT reaching the server — the new task is saved but never tagged. The walk reopens
// the task and must not find "ACL Rehab <stamp>" on it: S06 RED. Nothing on any server changes.
export default {
  id: "scopes-walk-tag-write-faked",
  check: "scopes.walk-seat",
  items: ["S06"],
  description: "rpc/assoc_set_targets claims success without being sent (the task is never tagged)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/assoc_set_targets(\\?|$)", method: "POST", action: "fake-ok", body: "[]" }],
};
