// The data home's one door answers 500 for this test browser only (intercept at the network
// boundary). The platform walk must catch it: P03 (a response >= 500) and P04 (the console error the
// page logs) go RED. Nothing on any server changes.
export default {
  id: "plat-data-home-500",
  check: "platform.walk-platform",
  items: ["P03", "P04"],
  description: "the data home's door (rpc/data_home) answers 500 in the test browser",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/data_home(\\?|$)", action: "status", status: 500 }],
};
