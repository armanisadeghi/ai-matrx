// INTERCEPT plant for tables.walk-bulk (T43): the record panel's Save claims success but the write
// is never sent (record_update answered 200 null in the test browser). The Grid must not show the
// edit: T43 RED (and T58 RED: no second version exists).
export default {
  id: "t2-walk-record-save-fake",
  check: "tables.walk-bulk",
  items: ["T43", "T58"],
  description: "record_update claims success without being sent (test browser only)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/record_update", method: "POST", action: "fake-ok", body: "null" }],
};
