// Sub-registry of area "tables" (tables-trash). Entries: see ../checks.mjs and common-docs v5/SAFETY-NET-LANE-BRIEF.md.
// SN-TRASH lane (2026-10-01). T47 tables, T48 records, T49 views: trashtables_green.sql (T1/T4/T5, T6, T8).
// T50 fields, T51 rules, T52 links, T53 templates, T54 dashboards, T55 mandates: storerestoredoors_green.sql.
export default [
  { id: "tables.sql-trash-tables", area: "tables", kind: "sql", file: "scripts/campaign-tests/trashtables_green.sql", items: ["T47", "T48", "T49"], targets: ["clone"] },
  { id: "tables.sql-trash-store-doors", area: "tables", kind: "sql", file: "scripts/campaign-tests/storerestoredoors_green.sql", items: ["T50", "T51", "T52", "T53", "T54", "T55"], targets: ["clone"] },
];
