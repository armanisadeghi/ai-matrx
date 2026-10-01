// SN-T1 plant (2026-10-01): the column door that changes a column's type refuses (rpc/migrate_retype answers 500)
// Planted at the network boundary of the walk's own test browser only (mode intercept): nothing on
// any server changes, so it runs on live and on the clone. The walk's JSON lists every interception.
export default {
  id: "t1-walk-retype-refused",
  check: "tables.walk-life",
  items: ["T26"],
  description: "the column door that changes a column's type refuses (rpc/migrate_retype answers 500)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/migrate_retype(\\?|$)", method: "POST", action: "status", status: 500 }],
};
