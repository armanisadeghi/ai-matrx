#!/usr/bin/env node
// Guard: two real-test runs must NEVER drive each other's browser.
//
// 2026-10-03: several real-test runs, all signed in as admin@admin.com, saw
// "another session's" notes appear under their cursor, their typing land in a
// note they never opened, and their page go to /dashboard by itself. The app
// was not syncing anything: pw.mjs picked its debug port at random from 600
// ports and trusted whatever answered on 127.0.0.1:<port>. Chrome launched on a
// port another run's Chrome already held binds [::1]:<port> instead and keeps
// running, so the second run's commands went to the FIRST run's browser.
//
// This test forces exactly that collision (run B launched on run A's port, and
// a stale port file pointing at A) and asserts each run still drives only its
// own page. Run: node pw.isolation.test.mjs   (exit 0 = isolated)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const pw = path.join(here, "pw.mjs");
const tag = `iso-${process.pid}`;
const A = `${tag}-a`, B = `${tag}-b`, C = `${tag}-c`;
const runsDir = path.join(os.tmpdir(), "matrx-real-test-browsers");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pw-iso-"));

const run = (name, args, env = {}) =>
  execFileSync("node", [pw, name, ...args], { encoding: "utf8", env: { ...process.env, ...env } }).trim();
const page = (label) => `data:text/html,<title>${label}</title>`;

// Preload that pins Math.random so a run's `start` picks a chosen port (the
// old picker was 9300 + floor(random * 600)); harmless for a picker that no
// longer uses Math.random.
function pinPortPreload(port) {
  const f = path.join(scratch, `pin-${port}.mjs`);
  fs.writeFileSync(f, `Math.random = () => ${(port - 9300 + 0.5) / 600};\n`);
  return { NODE_OPTIONS: `--import=${f}` };
}

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };

try {
  run(A, ["start"]);
  run(A, ["goto", page("RUN-A")]);
  const portA = Number(fs.readFileSync(path.join(runsDir, A, "port"), "utf8"));
  check(Number.isInteger(portA) && portA > 0, `run A reports its port (${portA})`);

  // Collision 1: B's launcher lands on A's port.
  run(B, ["start"], pinPortPreload(portA));
  run(B, ["goto", page("RUN-B")]);
  check(run(A, ["title"]) === "RUN-A", "run A still shows its own page after run B started on the same port");
  check(run(B, ["title"]) === "RUN-B", "run B drives its own browser, not run A's");

  // Collision 2: a stale port file (C's Chrome died) that now names A's port.
  const cDir = path.join(runsDir, C);
  fs.mkdirSync(cDir, { recursive: true });
  fs.writeFileSync(path.join(cDir, "port"), String(portA));
  run(C, ["start"]);
  run(C, ["goto", page("RUN-C")]);
  check(run(A, ["title"]) === "RUN-A", "a stale port file never attaches run C to run A's browser");
  check(run(C, ["title"]) === "RUN-C", "run C drives its own browser");
} catch (e) {
  failures++;
  console.log(`FAIL ${String(e.message).split("\n")[0]}`);
} finally {
  for (const r of [A, B, C]) {
    try { run(r, ["stop"]); } catch {}
    fs.rmSync(path.join(runsDir, r), { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log(failures ? `${failures} failure(s): runs are NOT isolated` : "runs are isolated");
process.exit(failures ? 1 : 0);
