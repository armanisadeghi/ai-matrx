// Checks for area "cutover" — lane SAFETY-NET-B (2026-10-01). Items C01–C13 (+ A11 copy edits).
// Each: { id, area, kind: "walk"|"sql"|"cmd", file|cmd/args, items: [ids], targets: ["live","clone"], liveReadOnly? }
//
// AFTER the press (the switch hour): run with SN_B_BEFORE=<before run dir>/b-cutover-state.json so the state check
// compares the plan; with SN_B_FREEZE_FROM=<freeze-start dir>/b-release-state.json so C11 judges movement.
export default [
  {
    // Read-only on live: readiness truthful + in time, the plan, test edits the press puts back, doors/births state,
    // follow backlog, the window policy, the undo's reach, nothing in the deprecated schema. AFTER: exactly the plan switched.
    id: "cutover.state",
    area: "cutover",
    kind: "cmd",
    // uv/aidream for psycopg: every read through probes/b_db.py (session pooler, client-side rollback, 6543 refused).
    cmd: "uv",
    args: ["run", "--project", "../aidream", "python", "scripts/safety-net/probes/b_cutover_state.py"],
    stepsJson: "b-cutover-state.json",
    items: ["C01", "C02", "C04", "C05", "C06", "C08", "C09", "C10", "C12", "A11"],
    // Live only: it judges the state the hour presses. Its red proof is the same script pointed at the clone
    // (SN_TARGET=clone python3 scripts/safety-net/probes/b_cutover_state.py), which reads the clone's real holds.
    targets: ["live"],
    timeoutMs: 10 * 60 * 1000,
  },
  {
    // The read path's own proof: 6543 refused for production, the session port used, an error inside a read-only
    // transaction leaves the connection IDLE after the client's rollback (chair 2026-10-01 ~03:20 PT, W27).
    id: "cutover.db-read-path-self-test",
    area: "cutover",
    kind: "cmd",
    cmd: "uv",
    args: ["run", "--project", "../aidream", "python", "scripts/safety-net/probes/b_db.py", "--self-test"],
    items: ["C12"],
    targets: ["live", "clone"],
    failWhen: "^FAIL",
  },
  {
    // The static census: nothing outside the baseline names an old door. Its own red: `pnpm check:old-system-unreachable:self-test`.
    id: "cutover.old-system-unreachable",
    area: "cutover",
    kind: "cmd",
    cmd: "pnpm",
    args: ["-s", "check:old-system-unreachable"],
    items: ["C07"],
    targets: ["live", "clone"],
  },
  {
    id: "cutover.old-system-unreachable-self-test",
    area: "cutover",
    kind: "cmd",
    cmd: "pnpm",
    args: ["-s", "check:old-system-unreachable:self-test"],
    items: ["C07"],
    targets: ["clone"],
  },
  {
    // The watched-window file on the clone through db:rehearse: sign-in freeze under 100 ms.
    id: "cutover.window-policy-freeze",
    area: "cutover",
    kind: "cmd",
    cmd: "zsh",
    args: ["scripts/safety-net/probes/b_policy_freeze.sh", "100"],
    items: ["C10"],
    targets: ["clone"],
    passWhen: "C10 PASS",
    timeoutMs: 15 * 60 * 1000,
  },
  {
    // Releases stopped: snapshot before the hour; in the hour SN_B_FREEZE_FROM=<snapshot> judges any movement.
    id: "cutover.release-stopped",
    area: "cutover",
    kind: "cmd",
    cmd: "python3",
    args: ["scripts/safety-net/probes/b_release_stopped.py"],
    stepsJson: "b-release-state.json",
    items: ["C11"],
    targets: ["live"],
  },
];
