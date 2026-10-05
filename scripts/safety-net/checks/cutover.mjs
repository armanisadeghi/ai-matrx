// Checks for area "cutover" — lane SAFETY-NET-B (2026-10-01); store-only since the switch's soak (lane ONE-HOME wave 4:
// the press, undo and Copy again checks retired with the machinery they judged).
// Each: { id, area, kind: "walk"|"sql"|"cmd", file|cmd/args, items: [ids], targets: ["live","clone"], liveReadOnly? }
//
// C11: with SN_B_FREEZE_FROM=<freeze-start dir>/b-release-state.json the release check judges movement.
export default [
  {
    // Store only (lane ONE-HOME wave 4, after the soak; read-only, live or clone): the older data tables live only in
    // `deprecated`, no client role reaches them, no older write door answers a signed-in caller, the context follow
    // backlog is 0. The probe that judged the switch's hour (readiness, the plan, the undo) retired with the press.
    id: "cutover.state",
    area: "cutover",
    kind: "cmd",
    // uv/aidream for psycopg: every read through probes/b_db.py (session pooler, client-side rollback, 6543 refused).
    cmd: "uv",
    args: ["run", "--project", "../aidream", "python", "scripts/safety-net/probes/b_cutover_state.py"],
    stepsJson: "b-cutover-state.json",
    items: ["C04", "C05", "C08"],
    targets: ["live", "clone"],
    timeoutMs: 10 * 60 * 1000,
  },
  {
    // Its red, one rule at a time: planted facts judged in memory (each turns exactly its own step red).
    id: "cutover.state-self-test",
    area: "cutover",
    kind: "cmd",
    cmd: "uv",
    args: ["run", "--project", "../aidream", "python", "scripts/safety-net/probes/b_cutover_state.py", "--self-test"],
    items: ["C04", "C05", "C08"],
    targets: ["live", "clone"],
    passWhen: "self-test: GREEN",
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
