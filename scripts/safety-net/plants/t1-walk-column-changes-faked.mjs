// SN-T1 plant (2026-10-01): a change to a column (its name, its choices' colours, its place) answers ok without being sent (rpc/field_update)
// Planted at the network boundary of the walk's own test browser only (mode intercept): nothing on
// any server changes, so it runs on live and on the clone. The walk's JSON lists every interception.
export default {
  id: "t1-walk-column-changes-faked",
  check: "tables.walk-life",
  items: ["T06","T09","T08"],
  description: "a change to a column (its name, its choices' colours, its place) answers ok without being sent (rpc/field_update)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/field_update(\\?|$)", method: "POST", action: "fake-ok", body: "null" }],
};
