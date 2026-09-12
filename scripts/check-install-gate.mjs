#!/usr/bin/env node
// scripts/check-install-gate.mjs --self-test
//
// Forcing proof that the shared-checkout install gate holds, run against REAL
// pnpm in a throwaway fixture — never by calling the guard script directly,
// because the bug this replaces was precisely that pnpm called the guard at the
// wrong moment. Each case proves the OLD mechanism failing and the NEW one
// passing, in the same fixture, in the same run.
//
// Cases:
//   1. preinstall is not a gate      — a root "preinstall" that exits 1 still
//                                      leaves node_modules fully linked.
//      the pnpmfile IS a gate        — the same refusal via .pnpmfile.cjs
//                                      leaves node_modules untouched.
//   2. concurrent installs serialise — two real `pnpm install` runs in one
//                                      checkout cannot hold the gate at once;
//                                      with the gate disabled they overlap.
//   3. the preview says why it died  — agent-dev-server.sh announces a changed
//                                      node_modules fingerprint, and stays
//                                      silent when nothing changed.
//
// Wired as `pnpm check:install-gate:self-test`.

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GATE_SRC = join(REPO_ROOT, "scripts/agent-harness/install-gate.cjs");
const DEV_SERVER = join(REPO_ROOT, "scripts/agent-dev-server.sh");

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`  FAIL  ${name}\n        ${error.message.split("\n")[0]}`);
  }
}

/**
 * A minimal real pnpm project that carries a copy of the real gate, so the gate
 * resolves the fixture as its own repo root. `mode` decides how the refusal is
 * wired: "pnpmfile" (what ships) or "preinstall" (what used to ship).
 */
function makeFixture({ mode, extraPnpmfile = "" }) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "install-gate-")));
  const stateDir = join(dir, "state");
  mkdirSync(join(dir, "scripts/agent-harness"), { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  copyFileSync(GATE_SRC, join(dir, "scripts/agent-harness/install-gate.cjs"));

  const pkg = {
    name: "install-gate-fixture",
    version: "1.0.0",
    private: true,
    scripts: {},
    dependencies: { "is-odd": "3.0.1" },
  };
  if (mode === "preinstall") {
    pkg.scripts.preinstall = "node scripts/agent-harness/install-gate.cjs --as-preinstall";
    writeFileSync(join(dir, ".pnpmfile.cjs"), `module.exports = { hooks: {} };\n`);
    // Same gate, invoked the way the retired guard was: as a lifecycle script.
    writeFileSync(
      join(dir, "scripts/agent-harness/install-gate.cjs"),
      readFileSync(GATE_SRC, "utf8") +
        `\n// fixture: run the gate as a lifecycle script, the retired wiring.\nprocess.argv = [process.argv[0], process.argv[1], "install"];\nmodule.exports.run();\n`,
    );
  } else {
    writeFileSync(
      join(dir, ".pnpmfile.cjs"),
      `require('./scripts/agent-harness/install-gate.cjs').run();\n${extraPnpmfile}\nmodule.exports = { hooks: {} };\n`,
    );
  }
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  return { dir, stateDir };
}

/** A lease file describing a preview that is alive and owns `root`. */
function writeLiveLease(stateDir, root, pid) {
  writeFileSync(
    join(stateDir, "shared-next-dev.meta"),
    `SESSION_ID=shared-next-dev\nPORT=3001\nPID=${pid}\nROOT=${root}\n`,
  );
}

function runInstall(dir, stateDir, extraEnv = {}, args = ["install", "--prefer-offline"]) {
  try {
    const stdout = execFileSync("pnpm", args, {
      cwd: dir,
      env: { ...process.env, MATRX_PREVIEW_STATE_DIR: stateDir, MATRX_ALLOW_INSTALL_WITH_PREVIEW: "", ...extraEnv },
      stdio: "pipe",
      encoding: "utf8",
    });
    return { status: 0, output: stdout };
  } catch (error) {
    return {
      status: typeof error.status === "number" ? error.status : 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

// A process that is genuinely alive for the duration of the test, standing in
// for the preview server so the lease is never dismissed as stale.
const holder = spawn("sleep", ["120"], { stdio: "ignore", detached: true });

// ---------------------------------------------------------------------------
console.log("\ninstall gate — forcing self-test\n");

check("FAILING BASELINE: a root preinstall refusal still leaves node_modules linked", () => {
  const { dir, stateDir } = makeFixture({ mode: "preinstall" });
  try {
    writeLiveLease(stateDir, dir, holder.pid);
    const { status } = runInstall(dir, stateDir);
    assert.equal(status, 1, "the retired guard does report failure");
    assert.ok(
      existsSync(join(dir, "node_modules")),
      "if this ever stops being true, pnpm changed and the comment in install-gate.cjs needs re-measuring",
    );
    const linked = existsSync(join(dir, "node_modules/is-odd"));
    assert.ok(linked, "pnpm links every dependency BEFORE it runs the root preinstall — that is why the old guard never held");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check("a live preview lease refuses a real pnpm install, before anything is linked", () => {
  const { dir, stateDir } = makeFixture({ mode: "pnpmfile" });
  try {
    writeLiveLease(stateDir, dir, holder.pid);
    const { status, output } = runInstall(dir, stateDir);
    assert.equal(status, 1, `the install must be refused; got:\n${output}`);
    assert.ok(output.includes("INSTALL REFUSED"), "the refusal must say so in plain words");
    assert.ok(output.includes("pnpm preview:stop"), "the refusal must carry the remedy");
    assert.ok(
      !existsSync(join(dir, "node_modules")),
      "the gate must refuse BEFORE pnpm links anything — node_modules must not exist",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check("the same refusal covers `pnpm add`, which never ran preinstall at all", () => {
  const { dir, stateDir } = makeFixture({ mode: "pnpmfile" });
  try {
    writeLiveLease(stateDir, dir, holder.pid);
    const { status, output } = runInstall(dir, stateDir, {}, ["add", "is-odd@3.0.1"]);
    assert.equal(status, 1, `pnpm add must be refused too; got:\n${output}`);
    assert.ok(!existsSync(join(dir, "node_modules")), "nothing may be linked");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check("--lockfile-only is allowed while the preview is live (it never touches node_modules)", () => {
  const { dir, stateDir } = makeFixture({ mode: "pnpmfile" });
  try {
    writeLiveLease(stateDir, dir, holder.pid);
    const { status, output } = runInstall(dir, stateDir, {}, ["install", "--lockfile-only", "--prefer-offline"]);
    assert.equal(status, 0, `refreshing the lockfile must stay possible; got:\n${output}`);
    assert.ok(!existsSync(join(dir, "node_modules")), "--lockfile-only must not link");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check("a dead lease never blocks an install", () => {
  const { dir, stateDir } = makeFixture({ mode: "pnpmfile" });
  try {
    writeLiveLease(stateDir, dir, 2147483646);
    const { status, output } = runInstall(dir, stateDir);
    assert.equal(status, 0, `a corpse must not hold the checkout hostage; got:\n${output}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Two real installs at once. The fixture's pnpmfile stamps the moment the gate
// let it through; if the gate serialises, the two stamps are at least the hold
// time apart. With MATRX_INSTALL_GATE_DISABLE they are not.
// ---------------------------------------------------------------------------
const HOLD_MS = 2000;

function concurrentEnters(env) {
  const { dir, stateDir } = makeFixture({
    mode: "pnpmfile",
    extraPnpmfile: `
const __fs = require('fs');
__fs.appendFileSync(process.env.GATE_STAMPS, 'ENTER ' + process.pid + ' ' + Date.now() + '\\n');
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${HOLD_MS});
`,
  });
  const stamps = join(dir, "stamps.txt");
  writeFileSync(stamps, "");
  // Both installs are launched and awaited by one shell: node's own spawned
  // children would be reaped only by an event loop this synchronous test never
  // yields to, and a zombie still answers `kill -0`.
  execFileSync(
    "bash",
    ["-c", 'cd "$1" && ( pnpm install --prefer-offline >/dev/null 2>&1 ) & ( cd "$1" && pnpm install --prefer-offline >/dev/null 2>&1 ) & wait', "bash", dir],
    {
      cwd: dir,
      env: { ...process.env, MATRX_PREVIEW_STATE_DIR: stateDir, GATE_STAMPS: stamps, ...env },
      stdio: "ignore",
      timeout: 300000,
    },
  );
  const times = readFileSync(stamps, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => Number(line.split(" ")[2]))
    .sort((x, y) => x - y);
  rmSync(dir, { recursive: true, force: true });
  return times;
}

check("FAILING BASELINE: with the gate disabled, two installs relink at the same time", () => {
  const times = concurrentEnters({ MATRX_INSTALL_GATE_DISABLE: "1" });
  assert.equal(times.length, 2, "both installs must have started");
  assert.ok(
    times[1] - times[0] < HOLD_MS,
    `ungated installs overlap; they were ${times[1] - times[0]}ms apart, which is not overlapping`,
  );
});

check("two concurrent installs are serialised by the gate", () => {
  const times = concurrentEnters({});
  assert.equal(times.length, 2, "both installs must eventually run — the second waits, it is not lost");
  assert.ok(
    times[1] - times[0] >= HOLD_MS,
    `the second install must wait for the first: they were only ${times[1] - times[0]}ms apart`,
  );
});

// pnpm's version-manager launcher loads the pnpmfile and then starts its core
// CLI as a child. The child must be allowed through the parent's lock: it is
// the same synchronous install, while a sibling pnpm process must still wait
// (the preceding test proves that). This is a real nested pnpm invocation, not
// a direct call to the gate and not an environment-variable bypass.
check("a pnpm child can re-enter its parent's install lock", () => {
  const { dir, stateDir } = makeFixture({
    mode: "pnpmfile",
    extraPnpmfile: `
if (!process.env.GATE_NESTED_INSTALL) {
  const __fs = require('fs');
  const { spawnSync } = require('child_process');
  const __child = spawnSync('pnpm', ['install', '--prefer-offline'], {
    cwd: __dirname,
    env: { ...process.env, GATE_NESTED_INSTALL: '1', MATRX_INSTALL_LOCK_WAIT_SEC: '2' },
    encoding: 'utf8',
  });
  __fs.writeFileSync(process.env.GATE_NESTED_RESULT, JSON.stringify({
    status: __child.status,
    output: String(__child.stdout || '') + String(__child.stderr || ''),
  }));
}
`,
  });
  const result = join(dir, "nested-result.json");
  try {
    const { status, output } = runInstall(dir, stateDir, { GATE_NESTED_RESULT: result });
    assert.equal(status, 0, `the outer install must complete; got:\n${output}`);
    assert.ok(existsSync(result), "the fixture must record the nested pnpm result");
    const nested = JSON.parse(readFileSync(result, "utf8"));
    assert.equal(nested.status, 0, `the child must not wait on its own parent lock; got:\n${nested.output}`);
    assert.ok(nested.output.includes("RE-ENTERING"), "the child must report that it recognised its parent-held lock");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// The preview must name its own killer.
// ---------------------------------------------------------------------------
function announceWith(recordedFingerprint) {
  const stateDir = mkdtempSync(join(tmpdir(), "preview-announce-"));
  const meta = join(stateDir, "shared-next-dev.meta");
  const log = join(stateDir, "shared-next-dev.log");
  writeFileSync(log, "");
  writeFileSync(meta, `PORT=3001\nPID=${holder.pid}\nROOT=${REPO_ROOT}\nNM_FINGERPRINT=${recordedFingerprint}\n`);
  execFileSync("bash", ["-c", `source "${DEV_SERVER}"; announce_node_modules_change ${holder.pid}`], {
    env: { ...process.env, MATRX_PREVIEW_STATE_DIR: stateDir },
    stdio: "pipe",
  });
  const out = { log: readFileSync(log, "utf8"), meta: readFileSync(meta, "utf8") };
  rmSync(stateDir, { recursive: true, force: true });
  return out;
}

function currentFingerprint() {
  return execFileSync("bash", ["-c", `source "${DEV_SERVER}"; nm_fingerprint`], { encoding: "utf8" }).trim();
}

check("the preview announces that node_modules changed under it", () => {
  const { log, meta } = announceWith("stale:fingerprint:from:start|");
  assert.ok(
    log.includes("node_modules changed under the running server at"),
    `the log must carry the one-line cause; it reads:\n${log}`,
  );
  assert.ok(log.includes("an install ran while the preview was live"), "it must name the cause in plain words");
  assert.ok(meta.includes("NODE_MODULES_CHANGED="), "the lease file must carry it too, for preview:status");
});

check("the preview stays silent when node_modules did not change", () => {
  const { log, meta } = announceWith(currentFingerprint());
  assert.equal(log, "", `an ordinary shutdown must not accuse anyone; log reads:\n${log}`);
  assert.ok(!meta.includes("NODE_MODULES_CHANGED="), "no false accusation in the lease file either");
});

// ---------------------------------------------------------------------------
try {
  process.kill(holder.pid);
} catch {
  /* already gone */
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
if (failed.length) {
  for (const f of failed) console.error(f.error);
  process.exit(1);
}
