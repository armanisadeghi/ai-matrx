// INTERCEPT plant for tables.walk-bulk (T35): the paged read door tells the browser the table holds
// 100 rows, whatever it holds (live or clone, this browser only). Pages 2 and 3 of 300 vanish and the
// pager says "of 100": T35 must go RED. Nothing on any server changes.
export default {
  id: "t2-walk-paging-total-100",
  check: "tables.walk-bulk",
  items: ["T35"],
  description: "read_records_page answers total 100 for the 300-row table (test browser only)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/read_records_page", method: "POST", action: "rewrite", from: '"total": 300', to: '"total": 100' }],
};
