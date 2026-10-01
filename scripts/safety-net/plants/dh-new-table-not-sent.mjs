// "New table" claims success but nothing is sent: the table is never born. D06 must go RED.
// Nothing on any server changes (the call is answered at the test browser's network boundary).
export default {
  id: "dh-new-table-not-sent",
  check: "datahome.walk-home",
  items: ["D06"],
  description: "the table-declare door answers 200 null without being sent (New table does nothing)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/table_declare(\\?|$)", action: "fake-ok", body: "null" }],
};
