// scripts/preview-install-guard.test.mjs
//
// The dev log bound from the 2026-09-12 preview incident.
//
// The install guard itself is NOT tested here any more. It used to be wired as
// the root package.json "preinstall" script, and this file proved that script
// exits 1 — which it does, AFTER pnpm has already relinked node_modules, and
// never at all for `pnpm add` / `pnpm remove` / `--ignore-scripts`. The guard
// now lives in `.pnpmfile.cjs` -> scripts/agent-harness/install-gate.cjs, the
// mechanism pnpm loads before it moves a single symlink, and its forcing proof
// runs REAL pnpm in a throwaway checkout:
//
//   pnpm check:install-gate:self-test      (scripts/check-install-gate.mjs)
//
// What remains here is the other half of the same bound: an error storm must
// not fill the volume. The 2026-09-12 storm wrote a 1.46 GB dev log in minutes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
