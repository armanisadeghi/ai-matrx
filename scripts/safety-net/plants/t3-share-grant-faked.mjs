// SN-T3 intercept plant (the test browser's own network boundary only; nothing on any server changes).
export default {
  id: "t3-share-grant-faked",
  check: "tables.walk-views-share",
  items: ["T44"],
  description: "the share door (rpc/share_resource_with_user) answers ok without being sent: the share looks made and is not",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/share_resource_with_user(\\\\?|$)", action: "fake-ok" }],
};
