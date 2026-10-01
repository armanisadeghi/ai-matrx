// SN-T3 intercept plant (the test browser's own network boundary only; nothing on any server changes).
export default {
  id: "t3-views-answer-rewrites-a-patient",
  check: "tables.walk-views-share",
  items: ["T36","T37","T38","T39","T40"],
  description: "every record read answers Marcus Bell as Marcos Bell (a record read through the views no longer shows the patient that was stored)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/read_records", action: "rewrite", from: "Marcus Bell", to: "Marcos Bell" }],
};
