// Sub-registry of area "tables" (tables-bulk). Entries: see ../checks.mjs and common-docs v5/SAFETY-NET-LANE-BRIEF.md.
export default [
  {
    id: "sql.import-green",
    area: "tables",
    kind: "sql",
    file: "scripts/campaign-tests/import_green.sql",
    items: ["T33"],
    targets: ["clone"],
  },
  {
    id: "sql.export-green",
    area: "tables",
    kind: "sql",
    file: "scripts/campaign-tests/exportfix_green.sql",
    items: ["T34"],
    targets: ["clone"],
  },
];
