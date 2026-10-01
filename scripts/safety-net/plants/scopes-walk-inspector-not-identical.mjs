// Lane SN-SCOPES (2026-10-01): the context inspector's compare (POST /ai/context/preview) comes back to
// the test browser with every "identical":true turned false — as if the two systems handed the agent
// different bytes. The walk's deciding marker ("Byte-identical") must be absent: S09/S10 RED.
// Nothing on any server changes.
export default {
  id: "scopes-walk-inspector-not-identical",
  check: "scopes.walk-seat",
  items: ["S09", "S10"],
  description: "the inspector's compare answer says the two systems are not identical (test browser only)",
  mode: "intercept",
  rules: [{ match: "/ai/context/preview(\\?|$)", method: "POST", action: "rewrite", from: "\"identical\":true", to: "\"identical\":false" }],
};
