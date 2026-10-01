// INTERCEPT plant for tables.walk-bulk (T58): the history door answers an empty list in the test
// browser. The panel's History must list the edit: T58 RED.
export default {
  id: "t2-walk-history-empty",
  check: "tables.walk-bulk",
  items: ["T58"],
  description: "record_history answers [] in the test browser (nothing on any server changes)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/record_history", method: "POST", action: "drop", keep: 0 }],
};
