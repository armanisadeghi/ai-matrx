// SN-T3 intercept plant (the test browser's own network boundary only; nothing on any server changes).
export default {
  id: "t3-approval-decide-faked",
  check: "tables.walk-views-share",
  items: ["T42"],
  description: "the approval door (rpc/work_approval_decide) answers ok without being sent: Approve claims applied and the record never lands",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/work_approval_decide(\\\\?|$)", action: "fake-ok" }],
};
