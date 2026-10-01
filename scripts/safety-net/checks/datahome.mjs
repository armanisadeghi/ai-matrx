// Checks for area "datahome". Each: { id, area, kind: "walk"|"sql"|"cmd", file|cmd/args, items: [ids], targets: ["live","clone"], liveReadOnly? }
export default [
  {
    id: "datahome.sql-honors-org",
    area: "datahome",
    kind: "sql",
    file: "scripts/campaign-tests/datahome2_the_data_home_honors_its_organization.sql",
    items: ["D01", "D02"],
    targets: ["clone"],
  },
];
