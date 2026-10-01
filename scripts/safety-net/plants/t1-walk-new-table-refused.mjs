// SN-T1 plant (2026-10-01): New table on the data home is refused (rpc/table_declare answers 500).
// Planted at the network boundary of the walk's own test browser only (mode intercept): nothing on
// any server changes, so it runs on live and on the clone. The walk's JSON lists every interception.
export default {
  id: "t1-walk-new-table-refused",
  check: "tables.walk-life",
  items: ["T01"],
  description: "New table is refused (rpc/table_declare answers 500), so no table is made",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/table_declare(\\?|$)", method: "POST", action: "status", status: 500 }],
};
