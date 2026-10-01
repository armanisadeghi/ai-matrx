// Lane SN-TAGS (2026-10-01): the scope-tag write (rpc/assoc_set_targets, the one door a note, a project and a
// chat all tag through) answers "ok" in the test browser WITHOUT reaching the server — nothing is tagged. The
// walk reopens each surface and must not find the tag: S05, S07 and S08 go RED. Nothing on any server changes.
export default {
  id: "tags-write-faked",
  check: "scopes.walk-tags",
  items: ["S05", "S07", "S08"],
  description: "rpc/assoc_set_targets claims success without being sent (a note, a project and a chat are never tagged)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/assoc_set_targets(\\?|$)", method: "POST", action: "fake-ok", body: "[]" }],
};
