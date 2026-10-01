// Checks for area "cutover" — lane SAFETY-NET-B (2026-10-01). Items C01–C13 (+ A11 copy edits).
// Each: { id, area, kind: "walk"|"sql"|"cmd", file|cmd/args, items: [ids], targets: ["live","clone"], liveReadOnly? }
//
// AFTER the press (the switch hour): run with SN_B_BEFORE=<before run dir>/b-cutover-state.json so the state check
// compares the plan; with SN_B_FREEZE_FROM=<freeze-start dir>/b-release-state.json so C11 judges movement.
export default [
  {
    // Read-only on live: readiness truthful + in time, the plan, test edits the press puts back, doors/births state,
    // follow backlog, the window policy, the undo's reach, nothing in the graveyard. AFTER: exactly the plan switched.
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
    // One rolled-back transaction on the clone: readiness names 4 planted holds (P1 un-copied row, P2 stale copy,
    // P3 live fields under an archived Table, P4 a table born after Step 1) and the press agrees; the press switches
    // exactly the plan; old doors refuse in a person's words; lists follow; births in the store; the undo restores;
    // W10 outside FKs; W15 a cut press leaves all-old.
    id: "cutover.switch-chain",
    area: "cutover",
    // cmd, not sql: probes/b_clone_suite.py first runs the REAL Step 1 on the clone server when readiness asks for it.
    kind: "cmd",
    cmd: "uv",
    args: ["run", "--project", "../aidream", "python", "scripts/safety-net/probes/b_clone_suite.py", "scripts/safety-net/probes/b_switch_chain.sql"],
    items: ["C01", "C02", "C03", "C04", "C05", "C06", "C13", "A02"],
    targets: ["clone"],
    passWhen: "SWITCH CHAIN GREEN",
    timeoutMs: 25 * 60 * 1000,
  },
  {
    // W4: after the press, no older READ door answers a moved table with the old value and no mark (clone, rolled back).
    id: "cutover.old-reads-after-press",
    area: "cutover",
    // cmd, not sql: probes/b_clone_suite.py first runs the REAL Step 1 on the clone server when readiness asks for it.
    kind: "cmd",
    cmd: "uv",
    args: ["run", "--project", "../aidream", "python", "scripts/safety-net/probes/b_clone_suite.py", "scripts/safety-net/probes/b_old_reads_after_press.sql"],
    items: ["C14"],
    targets: ["clone"],
    passWhen: "W4 GREEN",
    timeoutMs: 25 * 60 * 1000,
  },
  {
    // W14: after the press a record-store-off organization (Ojai Branch d46f323b) can still make a table, or is told
    // the truth (clone, rolled back).
    id: "cutover.store-off-after-press",
    area: "cutover",
    // cmd, not sql: probes/b_clone_suite.py first runs the REAL Step 1 on the clone server when readiness asks for it.
    kind: "cmd",
    cmd: "uv",
    args: ["run", "--project", "../aidream", "python", "scripts/safety-net/probes/b_clone_suite.py", "scripts/safety-net/probes/b_store_off_after_press.sql"],
    items: ["C15"],
    targets: ["clone"],
    passWhen: "W14 GREEN",
    timeoutMs: 25 * 60 * 1000,
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
