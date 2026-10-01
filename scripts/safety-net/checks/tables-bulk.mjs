// Sub-registry of area "tables" (tables-bulk). Entries: see ../checks.mjs and common-docs v5/SAFETY-NET-LANE-BRIEF.md.
export default [
  {
    id: "tables.walk-bulk",
    area: "tables",
    kind: "walk",
    file: "scripts/safety-net/walks/tables-bulk.mjs",
    walkName: "tables-bulk",
    items: ["T30", "T31", "T32", "T33", "T34", "T35", "T43", "T58", "T59"],
    targets: ["live", "clone"],
    timeoutMs: 25 * 60 * 1000,
  },
  {
    // The export door's own parity suite (rows, withheld columns, the Choice) — the SQL half of T34.
    id: "sql.export-green",
    area: "tables",
    kind: "sql",
    file: "scripts/campaign-tests/exportfix_green.sql",
    items: ["T34"],
    targets: ["clone"],
  },
  {
    // The record history door: who changed this, when, and "put it back" — the SQL half of T58.
    id: "sql.history-screens",
    area: "tables",
    kind: "sql",
    file: "scripts/campaign-tests/histscreens_green.sql",
    items: ["T58"],
    targets: ["clone"],
  },
];
