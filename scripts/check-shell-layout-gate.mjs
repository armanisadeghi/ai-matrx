#!/usr/bin/env node
/**
 * `pnpm check:shell-layout` — the release-row face of `pnpm test:shell-layout`
 * (the real-Chromium layout gate in `features/shell/layout-gate/`).
 *
 * A SIGNAL, never a block: the after-phase runner (`scripts/checks/run.mjs`)
 * turns a non-zero exit or a scream token into a WARNING finding and always
 * exits 0 itself. Three outcomes, each announced:
 *
 *   exit 0  every layout case passed in a real engine
 *   exit 1  `[FAIL] SHELL LAYOUT GATE: …` — a stylesheet the app ships moved a
 *           measured box (the Playwright report is echoed above the line)
 *   exit 2  `[FAIL] UNMEASURED: …` — Chromium is not installed for this
 *           Playwright, so NOTHING was measured. Never a silent pass; the
 *           remedy is named: `pnpm exec playwright install chromium`.
 *
 * Needs no running app and no network (the specs read CSS off disk).
 */
import { spawnSync } from "node:child_process";
import { writeSync } from "node:fs";

const result = spawnSync("pnpm", ["exec", "playwright", "test", "-c", "playwright.shell-layout.config.ts"], {
  encoding: "utf8",
  env: process.env,
  maxBuffer: 64 * 1024 * 1024,
});
const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
// writeSync: a large report through an async pipe is truncated by an early exit
// (observed: the verdict line never reached the runner's log).
const say = (text) => writeSync(1, text.endsWith("\n") ? text : `${text}\n`);

const browserMissing = /Executable doesn't exist|Looks like Playwright .* was just installed or updated|playwright install/i.test(out);

if (result.status === 0) {
  say(out);
  say("shell layout gate: every case passed in a real browser");
  process.exitCode = 0;
} else if (browserMissing) {
  // The verdict goes FIRST: it is the finding's headline in the runner.
  say(
    "[FAIL] UNMEASURED: shell layout gate could not launch Chromium (browser not installed for this Playwright) — nothing was measured. Remedy: pnpm exec playwright install chromium",
  );
  say(out.split("\n").filter((l) => /Executable doesn't exist/.test(l)).slice(0, 1).join("\n"));
  process.exitCode = 2;
} else {
  say(
    `[FAIL] SHELL LAYOUT GATE: a shipped stylesheet moved a measured box (exit ${result.status ?? result.signal}). Reproduce: pnpm test:shell-layout — the failing case names the box, both sizes, and the CSS it loaded.`,
  );
  say(out);
  process.exitCode = 1;
}
