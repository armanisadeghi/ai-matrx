// The usage page's answers lose every group for this test browser (the drill door's rows dropped
// at the network boundary): R04's twelve screens must go RED. Nothing on any server changes.
export default {
  id: "drill-usage-rows-dropped",
  check: "drill.walk-drill",
  items: ["R04"],
  description: "rpc/drill_ask answers an empty list in the test browser",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/drill_ask", action: "drop", keep: 0 }],
};
