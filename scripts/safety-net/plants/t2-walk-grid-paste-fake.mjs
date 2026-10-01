// INTERCEPT plant for tables.walk-bulk (T30): the Grid's cell paste is applied through
// record_change_many; here that write claims success without being sent. T30 and T31 must go RED (T34 follows: the pasted rows never reached the export).
export default {
  id: "t2-walk-grid-paste-fake",
  check: "tables.walk-bulk",
  items: ["T30", "T31"], // the Sheet's Paste dialog writes through the same door; T34 then reads fewer rows,
  description: "record_change_many claims success without being sent (test browser only)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/record_change_many", method: "POST", action: "fake-ok", body: "null" }],
};
