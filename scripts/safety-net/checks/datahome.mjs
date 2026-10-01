// Checks for area "datahome" — lane SN-DH (2026-10-01), items D01–D06.
// Each: { id, area, kind: "walk"|"sql"|"cmd", file|cmd/args, items: [ids], targets: ["live","clone"], liveReadOnly? }
export default [
  {
    id: "datahome.sql-honors-org",
    area: "datahome",
    kind: "sql",
    file: "scripts/campaign-tests/datahome2_the_data_home_honors_its_organization.sql",
    items: ["D01", "D02"],
    targets: ["clone"],
  },
  // D01 "Mine": every table she MADE across all her organizations (not 0 because the home opened on one).
  {
    id: "datahome.sql-knows-whose",
    area: "datahome",
    kind: "sql",
    file: "scripts/campaign-tests/datahome1_the_data_home_knows_whose_each_table_is.sql",
    items: ["D01", "D04"],
    targets: ["clone"],
  },
  // D01/D02 quiet: the checklist doors answer under All organizations (no 400 in a red box; B4-02).
  {
    id: "datahome.sql-checklists-all-orgs",
    area: "datahome",
    kind: "sql",
    file: "scripts/campaign-tests/datahome2_checklists_answer_under_all_organizations.sql",
    items: ["D01", "D02"],
    targets: ["clone"],
  },
  // D03: the data home's door searches titles, descriptions and fields; never a table she may not open.
  {
    id: "datahome.sql-search",
    area: "datahome",
    kind: "sql",
    file: "scripts/campaign-tests/datahome3b_the_data_home_searches_titles_descriptions_and_fields.sql",
    items: ["D03"],
    targets: ["clone"],
  },
  // The data home walked as admin@admin.com, then test@test.com: fresh visits on All organizations, every lane,
  // the filter through its control and through ?org_filter=, kinds, quiet page (no red sentence, no 4xx/5xx),
  // and New table made while working in Cedar Ridge with the filter on another organization.
  // Title search (D03) and saved views (D05) SKIP with a reason until the page offers them (DATA-HOME-3).
  {
    id: "datahome.walk-home",
    area: "datahome",
    kind: "walk",
    file: "scripts/safety-net/walks/data-home.mjs",
    walkName: "data-home",
    items: ["D01", "D02", "D03", "D04", "D05", "D06"],
    targets: ["live", "clone"],
  },
];
