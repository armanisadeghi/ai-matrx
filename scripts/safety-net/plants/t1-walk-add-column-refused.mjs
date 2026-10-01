// SN-T1 plant (2026-10-01): adding a column is refused (rpc/field_declare answers 500)
// Planted at the network boundary of the walk's own test browser only (mode intercept): nothing on
// any server changes, so it runs on live and on the clone. The walk's JSON lists every interception.
export default {
  id: "t1-walk-add-column-refused",
  check: "tables.walk-life",
  items: ["T05"],
  description: "adding a column is refused (rpc/field_declare answers 500)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/field_declare(\\?|$)", method: "POST", action: "status", status: 500 }],
};
