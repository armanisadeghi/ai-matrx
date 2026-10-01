// SN-T3 intercept plant (the test browser's own network boundary only; nothing on any server changes).
export default {
  id: "t3-share-level-faked",
  check: "tables.walk-views-share",
  items: ["T44","T45"],
  description: "the share level door (rpc/update_permission_level) answers ok without being sent: Editor looks granted, the colleague stays Viewer",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/update_permission_level(\\\\?|$)", action: "fake-ok" }],
};
