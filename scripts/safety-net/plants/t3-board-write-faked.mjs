// SN-T3 intercept plant (the test browser's own network boundary only; nothing on any server changes).
export default {
  id: "t3-board-write-faked",
  check: "tables.walk-views-share",
  items: ["T38","T45"],
  description: "the record write (rpc/record_update) answers ok without being sent: a board drop and a cell edit look saved and are not",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/record_update(\\\\?|$)", action: "fake-ok" }],
};
