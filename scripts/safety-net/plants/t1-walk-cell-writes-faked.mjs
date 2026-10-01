// SN-T1 plant (2026-10-01): a cell's save answers ok without being sent (rpc/record_update), so nothing a person types into a cell lands
// Planted at the network boundary of the walk's own test browser only (mode intercept): nothing on
// any server changes, so it runs on live and on the clone. The walk's JSON lists every interception.
export default {
  id: "t1-walk-cell-writes-faked",
  check: "tables.walk-life",
  items: ["T10","T11","T12","T13","T14","T16","T17","T18","T28"],
  description: "a cell's save answers ok without being sent (rpc/record_update), so nothing a person types into a cell lands",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/record_update(\\?|$)", method: "POST", action: "fake-ok", body: "1" }],
};
