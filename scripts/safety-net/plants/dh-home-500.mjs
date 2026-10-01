// The data home's one door answers 500 to the test browser: "All organizations" lists nothing and says so.
// D01 (quiet page, lanes) and D02 (the filter) must go RED. Nothing on any server changes.
export default {
  id: "dh-home-500",
  check: "datahome.walk-home",
  items: ["D01", "D02"],
  description: "the data home's door (rpc/data_home) answers 500 in the test browser",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/data_home(\\?|$)", action: "status", status: 500 }],
};
