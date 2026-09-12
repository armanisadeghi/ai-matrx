// scripts/preview-install-guard.test.mjs
//
// Forcing test for the shared-checkout install guard.
//
// WHY THIS EXISTS (incident 2026-09-12): a `pnpm install` run in this shared
// checkout while the managed preview on :3001 was live removed the
// `node_modules/@ai-matrx/design-system` symlink for a few seconds. 1,268 files
// import that package — including the root layout — so Turbopack emitted a
// module-not-found issue for every one of them, each carrying its full import
// traces. One compile's issue set reached 3.5 MILLION trace lines / ~460 MB,
// and the dev HMR `JSON.stringify` of that payload blew V8's ~512 MB max string
// length: `RangeError: Invalid string length` -> uncaughtException -> the dev
// server exited, taking every agent's signed-in surface with it.
//
// The guard refuses an install while THIS checkout owns a live preview lease.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GUARD = join(REPO_ROOT, "scripts/agent-harness/preview-install-guard.sh");

/** Run the guard against a fake lease directory. Returns its exit status. */
function runGuard({ meta, env = {} } = {}) {
  const stateDir = mkdtempSync(join(tmpdir(), "preview-guard-test-"));
  try {
    if (meta) {
      writeFileSync(join(stateDir, "shared-next-dev.meta"), meta);
    }
    try {
      execFileSync("bash", [GUARD], {
        env: {
          ...process.env,
          MATRX_PREVIEW_STATE_DIR: stateDir,
          MATRX_ALLOW_INSTALL_WITH_PREVIEW: "",
          ...env,
        },
        stdio: "pipe",
      });
      return 0;
    } catch (error) {
      return typeof error.status === "number" ? error.status : 1;
    }
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
}

// A live lease owned by THIS checkout is the exact incident condition.
const liveLeaseHere = `SESSION_ID=shared-next-dev\nPORT=3001\nPID=${process.pid}\nROOT=${REPO_ROOT}\n`;

test("refuses an install while this checkout owns a live preview lease", () => {
  assert.equal(
    runGuard({ meta: liveLeaseHere }),
    1,
    "the guard must stop the install that removes node_modules under a live dev server",
  );
});

test("allows an install when no preview lease exists", () => {
  assert.equal(runGuard(), 0, "a fresh clone or CI has no lease and must install normally");
});

test("allows an install when the lease belongs to a different checkout", () => {
  const meta = `PID=${process.pid}\nROOT=/definitely/not/this/checkout\n`;
  assert.equal(runGuard({ meta }), 0, "another checkout's node_modules is not ours to protect");
});

test("allows an install when the lease is stale (pid is dead)", () => {
  // PID 1 is init; a lease claiming it plus this ROOT is still "alive" by
  // kill -0, so use a pid that cannot exist instead.
  const meta = `PID=2147483646\nROOT=${REPO_ROOT}\n`;
  assert.equal(runGuard({ meta }), 0, "a dead lease must never block an install forever");
});

test("honours the explicit override, loudly", () => {
  assert.equal(
    runGuard({ meta: liveLeaseHere, env: { MATRX_ALLOW_INSTALL_WITH_PREVIEW: "1" } }),
    0,
    "an operator who knowingly accepts the crash must be able to proceed",
  );
});

// ---------------------------------------------------------------------------
// The second half of the same bound: an error storm must not fill the volume.
// The 2026-09-12 incident wrote a 1.46 GB dev log in minutes.
// ---------------------------------------------------------------------------

const DEV_SERVER = join(REPO_ROOT, "scripts/agent-dev-server.sh");

/** Source agent-dev-server.sh and call rotate_oversized_log against a fake log. */
function rotateWith({ logBytes, capGb }) {
  const stateDir = mkdtempSync(join(tmpdir(), "preview-log-test-"));
  try {
    const logPath = join(stateDir, "shared-next-dev.log");
    writeFileSync(logPath, "MODULE_NOT_FOUND STORM\n".repeat(Math.ceil(logBytes / 23)));
    execFileSync(
      "bash",
      ["-c", `source "${DEV_SERVER}"; rotate_oversized_log`],
      {
        env: {
          ...process.env,
          MATRX_PREVIEW_STATE_DIR: stateDir,
          MATRX_PREVIEW_MAX_LOG_GB: String(capGb),
          MATRX_PREVIEW_LOG_TAIL_KB: "1",
        },
        stdio: "pipe",
      },
    );
    return readFileSync(logPath, "utf8");
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
}

test("rotates the dev log once an error storm pushes it past the cap", () => {
  // cap ~1 KB, log ~64 KB.
  const after = rotateWith({ logBytes: 64 * 1024, capGb: 0.000001 });
  assert.ok(
    after.includes("LOG ROTATED"),
    "rotation must announce itself in the log, never silently discard output",
  );
  assert.ok(
    after.length < 64 * 1024,
    `the log must actually shrink; it is ${after.length} bytes`,
  );
});

test("leaves a normal-sized dev log completely alone", () => {
  const after = rotateWith({ logBytes: 64 * 1024, capGb: 2 });
  assert.ok(!after.includes("LOG ROTATED"), "ordinary logs must never be touched");
  assert.ok(after.length >= 64 * 1024, "ordinary logs must keep every line");
});
