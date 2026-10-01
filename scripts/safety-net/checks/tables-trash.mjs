// Sub-registry of area "tables" (tables-trash). Entries: see ../checks.mjs and common-docs v5/SAFETY-NET-LANE-BRIEF.md.
// SN-TRASH lane (2026-10-01). T47 tables, T48 records, T49 views: sntrash_tables_green.sql, a Cedar-Ridge-pinned copy of trashtables_green.sql (T1/T4/T5, T6, T8).
// T56 meetings: doorsdecidelast_green.sql part 5. T57 terms: sntrash_terms_green.sql (written by this lane).
// T50 fields, T51 rules, T52 links, T53 templates, T54 dashboards, T55 mandates: storerestoredoors_green.sql.
export default [
  { id: "tables.sql-trash-tables", area: "tables", kind: "sql", file: "scripts/campaign-tests/sntrash_tables_green.sql", items: ["T47", "T48", "T49"], targets: ["clone"] },
  { id: "tables.sql-trash-store-doors", area: "tables", kind: "sql", file: "scripts/campaign-tests/storerestoredoors_green.sql", items: ["T50", "T51", "T52", "T53", "T54", "T55"], targets: ["clone"] },
  { id: "tables.sql-trash-meetings", area: "tables", kind: "sql", file: "scripts/campaign-tests/doorsdecidelast_green.sql", items: ["T56"], targets: ["clone"] },
  { id: "tables.sql-trash-terms", area: "tables", kind: "sql", file: "scripts/campaign-tests/sntrash_terms_green.sql", items: ["T57"], targets: ["clone"] },
  { id: "tables.walk-trash", area: "tables", kind: "walk", file: "scripts/safety-net/walks/trash.mjs", walkName: "trash", items: ["T47", "T48", "T49", "T50", "T54"], targets: ["live", "clone"] },
];
