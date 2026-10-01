// SN-TRASH plant for tables.walk-trash (intercept: this test browser only, nothing on a server changes,
// so it runs on live and on the clone). The Restore door the /trash screen calls (rpc/entity_undelete)
// answers "true" WITHOUT being sent: the screen says the thing is back, the thing is not. The walk must
// go RED on every kind it restores through that door — the record, the column, the saved view, the
// dashboard and the table are all still removed afterwards.
export default {
  id: "trash-walk-restore-door-fakes-ok",
  check: "tables.walk-trash",
  items: ["T47", "T48", "T49", "T50", "T54"],
  description: "the Trash screen's Restore door (rpc/entity_undelete) claims success without sending, for this test browser only",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/entity_undelete(\\?|$)", method: "POST", action: "fake-ok", body: "true" }],
};
