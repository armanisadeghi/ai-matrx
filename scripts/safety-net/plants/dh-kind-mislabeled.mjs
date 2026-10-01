// Every plain table is told to the test browser as a "list": the Kind filter then has no tables to show.
// D04 (Kind narrows the tables to one kind) must go RED. Nothing on any server changes.
export default {
  id: "dh-kind-mislabeled",
  check: "datahome.walk-home",
  items: ["D04"],
  description: "the data home's door answers kind \"list\" where it says \"table\" (rewritten at the test browser)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/data_home(\\?|$)", action: "rewrite", from: "\"kind\": \"table\"", to: "\"kind\": \"list\"" }],
};
