// Checks for area "drill" (owner SAFETY-NET). The SQL suites carry their own built-in plants
// (`-v plant=…`); the safety-net plants switch those on (mode "vars").
export default [
  {
    id: "drill.walk-drill",
    area: "drill",
    kind: "walk",
    file: "scripts/safety-net/walks/drill.mjs",
    walkName: "drill",
    items: ["R01", "R02", "R03", "R04", "R05"],
    targets: ["live", "clone"],
  },
  // One door answers every table: standard sources AND custom Tables (describe / ask / rows), seats.
  { id: "drill.sql-one-door", area: "drill", kind: "sql", file: "scripts/campaign-tests/drillstd_green.sql", items: ["R01", "R02", "R03", "R05"], targets: ["clone"] },
  // The custom-table kind: drill_describe / drill_ask on Cedar Ridge's own Visits table = the store's own answer.
  { id: "drill.sql-custom-parity", area: "drill", kind: "sql", file: "scripts/campaign-tests/drillcustom_parity_green.sql", items: ["R01", "R02"], targets: ["clone"] },
  // The records behind a usage number (drill_rows) and the seat guards.
  { id: "drill.sql-ledger-records", area: "drill", kind: "sql", file: "scripts/campaign-tests/drillledger_records_green.sql", items: ["R03", "R05"], targets: ["clone"] },
  // The usage page's numbers = the Spend Explorer's, to the cent.
  { id: "drill.sql-usage-parity", area: "drill", kind: "sql", file: "scripts/campaign-tests/drillusage_parity_green.sql", items: ["R04"], targets: ["clone"] },
  // The leak class: a member shared one Home of a Table is never handed the other Homes' records.
  { id: "drill.sql-leak-t10", area: "drill", kind: "sql", file: "scripts/campaign-tests/leakt10_green.sql", items: ["R05"], targets: ["clone"] },
];
