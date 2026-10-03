// EXT01–EXT06 (lane 5 VISION-REACH, wave 3, 2026-10-03): `external-visibility` — a table synced from an outside
// Postgres (scratch.appointments on the clone, read through a SELECT-only role the probe provisions itself) is
// connected by admin@admin.com through the server, refused every client-side write in one sentence, pointed at by a
// Visits relation, kept "Only me" — and test@test.com meets it nowhere: data home, search, picker doors,
// read_records_page, REST v1, the MCP. Control: the owner reads every row through REST v1 and the MCP. Every response
// body is scanned for the connection string. Self-test: SN_EXT_PLANT=grant (a share through the store's own door;
// every EXT04 step goes RED). Clone only: the outside source is a scratch schema on the clone, never a customer's.
// EXT07: `no-secret-to-client` — the server's own guard (aidream/services/external_databases/tests): the connection
// string is in no response body, header, forensic diagnostic or log line, whatever fails; red on a planted echo.
export default [
  {
    id: "external.visibility",
    area: "external",
    kind: "cmd",
    cmd: "uv",
    args: ["run", "--project", "../aidream", "python", "scripts/safety-net/probes/external_tables.py"],
    items: ["EXT01", "EXT02", "EXT03", "EXT04", "EXT05", "EXT06"],
    targets: ["clone"],
    stepsJson: "external-tables.json",
    timeoutMs: 10 * 60 * 1000,
  },
  {
    id: "external.no-secret-to-client",
    area: "external",
    kind: "cmd",
    cmd: "uv",
    cwd: "../aidream",
    args: ["run", "pytest", "-q", "aidream/services/external_databases/tests"],
    items: ["EXT07"],
    targets: ["live", "clone"],
    timeoutMs: 5 * 60 * 1000,
  },
];
