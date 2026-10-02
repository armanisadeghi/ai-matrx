// A table's drill answer loses all but one group for this test browser (drill_ask's rows cut to one at
// the network boundary): R01-R03's "the groups add up to the total" must go RED. Nothing on any server changes.
export default {
  id: "drill-table-groups-lose-a-row",
  check: "drill.walk-drill",
  items: ["R01", "R02", "R03"],
  description: "rpc/drill_ask answers one group only in the test browser, so groups no longer add up to the total",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/drill_ask", action: "drop", keep: 1 }],
};
