// Sub-registry of area "tables" (tables-views). Entries: see ../checks.mjs and common-docs v5/SAFETY-NET-LANE-BRIEF.md.
// SN-T3 lane (2026-10-01): T36 grid, T37 sheet, T38 board (+drag), T39 calendar, T40 gallery, T41 Make it work,
// T42 Ask AI approval card, T44 share-owner, T45 share-editor, T46 share-viewer.
//
// NOT REGISTERED (red on today's clone, so they prove nothing but a defect — see the lane report):
//   share_green.sql, sharerevoke_green.sql  (their throwaway-organization cleanup fails on billing.org_plan FK)
//   sharetails_green.sql                    (B2: a member reads a Table its owner set to "mine")
//   sharepeople_green.sql                   (retired: iam._share_people_conversion dropped 2026-09-27)
export default [
  { id: "tables.walk-views-share", area: "tables", kind: "walk", file: "scripts/safety-net/walks/tables-views-share.mjs", walkName: "tables-views-share", items: ["T36", "T37", "T38", "T39", "T40", "T41", "T42", "T44", "T45", "T46"], targets: ["live", "clone"], timeoutMs: 25 * 60 * 1000 },
  { id: "tables.sql-saved-view-store", area: "tables", kind: "sql", file: "scripts/campaign-tests/oneview_green.sql", items: ["T38", "T39"], targets: ["clone"], passWhen: "S0 ONE-SAVED-VIEW GREEN" },
  { id: "tables.sql-saved-view-doors", area: "tables", kind: "sql", file: "scripts/campaign-tests/doorsonly5_saved_view_doors_work_from_a_seat.sql", items: ["T36", "T37", "T38", "T39", "T40"], targets: ["clone"], vars: { closed: "1" }, passWhen: "9/9 assertions green" },
  { id: "tables.sql-view-press-keeps-name", area: "tables", kind: "sql", file: "scripts/campaign-tests/datav2face2_view_declare_merges_red_green.sql", items: ["T38", "T39"], targets: ["clone"], passWhen: "GREEN on the current body" },
  { id: "tables.sql-dashboard-share-ladder", area: "tables", kind: "sql", file: "scripts/campaign-tests/dash_green.sql", items: ["T46"], targets: ["clone"], passWhen: "ALL PARTS PASSED" },
];
