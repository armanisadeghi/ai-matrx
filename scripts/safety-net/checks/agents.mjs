// Checks for area "agents" — lane SAFETY-NET-B (2026-10-01). Items A01, A02, A06–A11.
// Each: { id, area, kind: "walk"|"sql"|"cmd", file|cmd/args, items: [ids], targets: ["live","clone"], liveReadOnly? }
//
// AFTER the press: SN_B_BEFORE_API=<before run dir>/b-api-mcp.json makes the probe compare every signature (A11).
export default [
  {
    // REST v1 + a personal key (made and revoked in the run), the AI Matrx MCP with the key and with the person's
    // sign-in token, idempotency, member/outsider/revoked refusals, the cross-organization binding preview, read
    // parity on admin's Workspace's older-table copies. Fixtures in Cedar Ridge + admin's Workspace, archived.
    id: "agents.api-mcp",
    area: "agents",
    kind: "cmd",
    cmd: "uv",
    args: ["run", "--project", "../aidream", "python", "scripts/safety-net/probes/b_api_mcp.py"],
    stepsJson: "b-api-mcp.json",
    items: ["A01", "A06", "A07", "A08", "A09", "A10", "A11"],
    targets: ["live", "clone"],
    timeoutMs: 20 * 60 * 1000,
  },
  {
    // Save to a table from a note, a Read-mode selection and a chat answer → a custom table with the right columns.
    id: "agents.walk-save-as-table",
    area: "agents",
    kind: "walk",
    file: "scripts/safety-net/walks/b-save-as-table.mjs",
    walkName: "b-save-as-table",
    items: ["A03", "A04", "A05"],
    targets: ["live", "clone"],
    timeoutMs: 30 * 60 * 1000,
  },
  // NOT REGISTERED by default (it would read FAIL on every clone run before a press):
  //   {
  //     // AFTER-THE-PRESS ONLY: it SKIPS (= FAIL here, honestly) until admin's Workspace is moved; run it on a clone that
  //     // has been pressed (rehearsal / PRESS-AT-SIZE window). Before the press A02 is proven by probes/b_switch_chain.sql
  //     // (custom.where_tables_live: older before, store after — the door the dataset tool asks).
  //     // The agents' dataset tool on a moved table reads and writes the store (aidream clone test; `-m red` is its red twin).
  //     id: "agents.dataset-tool",
  //     area: "agents",
  //     kind: "cmd",
  //     cmd: "uv",
  //     args: ["run", "pytest", "-q", "packages/matrx-records/tests/test_dataset_tool_on_a_moved_table.py", "--records-target", "clone"],
  //     cwd: "../aidream",
  //     items: ["A02"],
  //     targets: ["clone"],
  //     passWhen: "passed",
  //     failWhen: "\\d+ (failed|errors?|skipped)",
  //     timeoutMs: 15 * 60 * 1000,
  //   },

];
