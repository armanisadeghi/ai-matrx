// INTERCEPT plant for tables.walk-bulk (T30): the Grid's cell paste is applied through
// record_change_many; here that write claims success without being sent. T30 must go RED.
export default {
  id: "t2-walk-grid-paste-fake",
  check: "tables.walk-bulk",
  items: ["T30"],
  description: "record_change_many claims success without being sent (test browser only)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/record_change_many", method: "POST", action: "fake-ok", body: "null" }],
};
