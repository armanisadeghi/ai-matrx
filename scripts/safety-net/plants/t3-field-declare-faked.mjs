// SN-T3 intercept plant (the test browser's own network boundary only; nothing on any server changes).
export default {
  id: "t3-field-declare-faked",
  check: "tables.walk-views-share",
  items: ["T41"],
  description: "the column door (rpc/field_declare) answers ok without being sent: Make it work claims it made the column (setup columns too, so later steps fail with it)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/field_declare(\\\\?|$)", action: "fake-ok" }],
};
