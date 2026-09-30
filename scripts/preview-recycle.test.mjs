// scripts/preview-recycle.test.mjs
//
// OLD NEVER BLOCKS NEW (Arman, 2026-09-29: "sessions will leave them open and
// running — we need to allow new ones and kill old ones"). An abandoned shared
// preview grew to 50 GB of REAL memory in 2 h while `ps` RSS showed ~3 GB, and
// the only stop was a 192 GB RSS cap. These tests pin the stop decision, the
// "last used" clock, the monitor's idle stop, and preview:start's takeover —
// with fake processes and fake logs only. No Next server is ever started, and
// the real shared previews are never touched (every test gets its own state dir).
//
//   node --test scripts/preview-recycle.test.mjs
//
// MATRX_PREVIEW_SCRIPT_UNDER_TEST points the suite at another copy of the
// script (it must live in scripts/) — how the fail-before proof was run.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = process.env.MATRX_PREVIEW_SCRIPT_UNDER_TEST
  ? resolve(process.env.MATRX_PREVIEW_SCRIPT_UNDER_TEST)
  : join(REPO_ROOT, "scripts/agent-dev-server.sh");

const fakes = [];
after(() => {
  for (const pid of fakes) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
});

/** A fake "server": `sleep` in its own session, orphaned so init reaps it (no zombie). */
function fakeServer() {
  const pid = Number(
    execFileSync("/usr/bin/python3", [
      "-c",
      "import subprocess; D=subprocess.DEVNULL; print(subprocess.Popen(['sleep','600'], start_new_session=True, stdin=D, stdout=D, stderr=D).pid)",
    ])
      .toString()
      .trim(),
  );
  fakes.push(pid);
  return pid;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const now = () => Math.floor(Date.now() / 1000);

function stateDir() {
  return mkdtempSync(join(tmpdir(), "preview-recycle-test-"));
}

/** Source the script in a fresh state dir and run `body`; returns { out (stdout+stderr), code }. */
function sourced(dir, body, env = {}) {
  const res = spawnSync("bash", ["-c", `source "${SCRIPT}"; ${body}`], {
    env: { ...process.env, MATRX_PREVIEW_STATE_DIR: dir, ...env },
    encoding: "utf8",
  });
  return { out: `${res.stdout ?? ""}${res.stderr ?? ""}`, code: res.status ?? 1 };
}

function writeLease(dir, { pid, usedAgoSec, root = "/some/other/checkout", port = 1, ready = true }) {
  writeFileSync(
    join(dir, "shared-next-dev.meta"),
    `SESSION_ID=shared-next-dev\nPORT=${port}\nPID=${pid}\nDISTDIR=.next-preview\nROOT=${root}\nOWNER_SESSION=old-session\nSERVER=live\n`,
  );
  writeFileSync(join(dir, "shared-next-dev.log"), " GET /old 200 in 5ms\n");
  if (usedAgoSec !== undefined) writeFileSync(join(dir, "shared-next-dev.used"), `${now() - usedAgoSec}\n`);
  if (ready) writeFileSync(join(dir, "shared-next-dev.ready"), "");
}

const GB = 1048576; // KB

// ── the stop decision ────────────────────────────────────────────────────────

function reason(kb, idleSec, env) {
  const dir = stateDir();
  try {
    return sourced(dir, `preview_stop_reason ${kb} ${idleSec} footprint`, env).out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("stops a preview nobody used for 30 min, worded as a recycle", () => {
  const out = reason(1 * GB, 31 * 60);
  assert.match(out, /^RECYCLED: stopped after 31 min unused/);
  assert.match(out, /the next pnpm preview:start starts a fresh one/);
});

test("recycles a bloated preview once idle 5 min", () => {
  const out = reason(52 * GB, 6 * 60);
  assert.match(out, /^RECYCLED: recycled at 52\.0 GB real memory after 6 min idle/);
});

test("never recycles a bloated preview that is in use", () => {
  assert.equal(reason(52 * GB, 60), "");
});

test("leaves a small idle-for-10-min preview alone", () => {
  assert.equal(reason(10 * GB, 10 * 60), "");
});

test("hard cap is 128 GB of real memory, and is a watchdog stop, not a recycle", () => {
  const out = reason(130 * GB, 0);
  assert.match(out, /^preview stopped at 130\.0 GB real memory \(cap 128 GB\)/);
  assert.equal(reason(127 * GB, 0), "");
});

test("the idle limits are knobs", () => {
  assert.match(reason(1 * GB, 11 * 60, { MATRX_PREVIEW_IDLE_STOP_MIN: "10" }), /stopped after 11 min unused/);
  assert.equal(reason(52 * GB, 6 * 60, { MATRX_PREVIEW_RECYCLE_GB: "60" }), "");
});

// ── real memory ──────────────────────────────────────────────────────────────

test("measures real memory (phys_footprint) on macOS, RSS only as an announced fallback", () => {
  const dir = stateDir();
  const pid = fakeServer();
  try {
    const out = sourced(dir, `real_memory_kb ${pid}`).out.trim();
    const expected = process.platform === "darwin" ? "footprint" : "rss";
    assert.match(out, new RegExp(`^[0-9]+ ${expected}$`));
    assert.match(sourced(dir, `real_memory_kb ${pid}`, { MATRX_PREVIEW_MEMORY_SOURCE: "rss" }).out.trim(), /^[0-9]+ rss$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── the "last used" clock ────────────────────────────────────────────────────

test("only an HTTP request line counts as use — compile output does not", () => {
  const dir = stateDir();
  try {
    const log = join(dir, "shared-next-dev.log");
    const used = join(dir, "shared-next-dev.used");
    writeFileSync(log, " GET /before-monitor 200 in 5ms\n");
    const scan = (line) =>
      sourced(
        dir,
        `SCAN_OFFSET=$(stat_fmt %s %z "$LOG"); printf '%s\\n' ${JSON.stringify(line)} >>"$LOG"; note_requests`,
      );
    scan(" ✓ Compiled /notes in 3.2s");
    assert.ok(!existsSync(used), "compile output is not use");
    scan(" GET /notes 200 in 82ms (next.js: 1ms, application-code: 80ms)");
    assert.ok(existsSync(used), "a request line is use");
    assert.ok(Math.abs(Number(readFileSync(used, "utf8")) - now()) <= 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── the monitor stops an abandoned preview, loudly ───────────────────────────

test("the monitor stops a preview unused for 30 min and says so in log, FAILED and status", () => {
  const dir = stateDir();
  const pid = fakeServer();
  try {
    writeLease(dir, { pid, usedAgoSec: 31 * 60, root: REPO_ROOT, port: 3001 });
    execFileSync("bash", [SCRIPT, "monitor", String(pid), "--live"], {
      env: { ...process.env, MATRX_PREVIEW_STATE_DIR: dir },
      stdio: "pipe",
      timeout: 20000,
    });
    assert.ok(!isAlive(pid), "the abandoned server must be stopped");
    const failed = readFileSync(join(dir, "shared-next-dev.failed"), "utf8");
    assert.match(failed, /^RECYCLED: stopped after 31 min unused/);
    assert.match(readFileSync(join(dir, "shared-next-dev.log"), "utf8"), /\[preview\] RECYCLED: stopped after 31 min unused/);
    const status = sourced(dir, "cmd_status_one").out;
    assert.match(status, /recycled \(normal\)/);
    assert.doesNotMatch(status, /WATCHDOG STOPPED/, "a recycle must not print as a crash");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the monitor leaves a recently used preview running", async () => {
  const dir = stateDir();
  const pid = fakeServer();
  try {
    writeLease(dir, { pid, usedAgoSec: 0, root: REPO_ROOT, port: 3001 });
    const monitor = spawn("bash", [SCRIPT, "monitor", String(pid), "--live"], {
      env: { ...process.env, MATRX_PREVIEW_STATE_DIR: dir },
      stdio: "ignore",
    });
    await new Promise((r) => setTimeout(r, 5000));
    monitor.kill("SIGKILL");
    assert.ok(isAlive(pid), "a busy preview must never be stopped");
    assert.ok(!existsSync(join(dir, "shared-next-dev.failed")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── preview:start takes over from an old preview instead of refusing ────────

function takeover(lease, env) {
  const dir = stateDir();
  const pid = fakeServer();
  writeLease(dir, { pid, ...lease });
  const res = sourced(dir, "retire_stale_preview; echo rc=$?", env);
  const result = {
    out: res.out,
    alive: isAlive(pid),
    leaseKept: existsSync(join(dir, "shared-next-dev.meta")),
    failed: existsSync(join(dir, "shared-next-dev.failed"))
      ? readFileSync(join(dir, "shared-next-dev.failed"), "utf8")
      : "",
  };
  rmSync(dir, { recursive: true, force: true });
  return result;
}

test("start stops another checkout's preview idle 6 min and starts fresh", () => {
  const r = takeover({ usedAgoSec: 6 * 60 });
  assert.ok(!r.alive, "the idle preview must be stopped");
  assert.ok(!r.leaseKept, "its lease must be released so the new start proceeds");
  assert.match(r.out, /rc=0/);
  assert.match(r.failed, /^RECYCLED: replaced by a new pnpm preview:start .* unused for 6 min/);
});

test("start stops a preview that stopped answering once it has been idle past the busy guard", () => {
  const r = takeover({ usedAgoSec: 3 * 60, port: 1, ready: true });
  assert.ok(!r.alive);
  assert.match(r.failed, /not answering on port 1/);
});

test("start never kills a preview that served a request in the last few minutes", () => {
  const r = takeover({ usedAgoSec: 30, port: 1, ready: true });
  assert.ok(r.alive, "busy preview must be reused, not killed — even when its probe fails");
  assert.ok(r.leaseKept);
  assert.match(r.out, /rc=1/);
});

test("start leaves a still-compiling (never ready) preview alone", () => {
  const r = takeover({ usedAgoSec: 3 * 60, port: 1, ready: false });
  assert.ok(r.alive);
  assert.ok(r.leaseKept);
});

test("cmd_start runs the takeover before reuse", () => {
  const src = readFileSync(SCRIPT, "utf8");
  const start = src.slice(src.indexOf("cmd_start() {"));
  const retire = start.indexOf("retire_stale_preview");
  const reuse = start.indexOf("reuse_managed_meta && return 0");
  assert.ok(retire > 0 && retire < reuse, "cmd_start must retire a stale preview before reusing or refusing");
});

// ── the next start words a recycle as normal ─────────────────────────────────

test("report_previous_failure words a recycle as normal and a watchdog stop as a crash", () => {
  const dir = stateDir();
  try {
    writeFileSync(join(dir, "shared-next-dev.failed"), "RECYCLED: stopped after 30 min unused\n");
    const recycled = sourced(dir, "report_previous_failure").out;
    assert.match(recycled, /recycled \(normal\): stopped after 30 min unused/);
    assert.doesNotMatch(recycled, /WATCHDOG/);
    writeFileSync(join(dir, "shared-next-dev.failed"), "preview stopped at 130 GB real memory (cap 128 GB)\n");
    assert.match(sourced(dir, "report_previous_failure").out, /WATCHDOG STOPPED THE PREVIOUS PREVIEW/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
