#!/usr/bin/env node
// scripts/check-history-state-bypass.mjs
//
// THE HISTORY-STATE BYPASS (2026-10-04).
//
// Next 16 patches `history.pushState` / `history.replaceState`
// (next/dist/client/components/app-router.js). Called with a state object that
// carries Next's `__NA` marker, the patch assumes Next wrote it and SKIPS its
// router sync. `window.history.state` always carries `__NA`, so
//
//     window.history.replaceState(window.history.state, "", url)
//
// moves the address bar while the App Router keeps the OLD url: `useSearchParams`
// / `usePathname` never see the change, and the router's next state update writes
// the old url straight back (a stripped secret returned to the e-signature
// outsider page's address bar after one button press).
//
// The one writer is lib/url-state/addressWithoutNavigating.ts
// (`replaceAddressWithoutNavigating` / `pushAddressWithoutNavigating`), which
// passes `null`. A site that deliberately must not wake the router keeps the
// call and says why on the same or the line above:
//
//     // history-state-bypass: <why the router must not see this>
//
// Usage: node scripts/check-history-state-bypass.mjs [--self-test] [files…]
// Exits 1 on any finding.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const CALL = /\b(?:replaceState|pushState)\(\s*(?:window\.)?history\.state\b/g;
const REASON = /history-state-bypass:\s*\S/;
/** Tests and rule self-tests quote the bad shape on purpose (fixtures, models of Next's patch). */
const TEST_FILE = /(?:^|\/)__tests__\/|\.(?:test|spec|selftest)\.[cm]?[jt]sx?$/;

export function findingsForSource(src, file) {
  const out = [];
  const lines = src.split("\n");
  for (const m of src.matchAll(CALL)) {
    const i = src.slice(0, m.index).split("\n").length - 1;
    if (REASON.test(lines[i]) || (i > 0 && REASON.test(lines[i - 1]))) continue;
    out.push(
      `${file}:${i + 1}  history write forwards Next's own state (__NA), so the router never sees the new URL and later writes the old one back — use replaceAddressWithoutNavigating / pushAddressWithoutNavigating (lib/url-state/addressWithoutNavigating.ts), or add "// history-state-bypass: <why>"`,
    );
  }
  return out;
}

function trackedSources() {
  return execFileSync("git", ["ls-files", "-z", "--", "*.ts", "*.tsx", "*.mts", "*.mjs", "*.js"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1 << 28,
  })
    .split("\0")
    .filter((f) => f && !f.includes("node_modules/") && f !== "scripts/check-history-state-bypass.mjs" && !TEST_FILE.test(f));
}

function selfTest() {
  const cases = [
    ['window.history.replaceState(window.history.state, "", url);', 1],
    ['window.history.pushState(window.history.state, "", url);', 1],
    ['history.replaceState(history.state, "", url);', 1],
    ['window.history.replaceState(\n  window.history.state,\n  "",\n  url,\n);', 1],
    ['window.history.replaceState(null, "", url);', 0],
    ['replaceAddressWithoutNavigating(url);', 0],
    ['// history-state-bypass: a hash scroll must not re-render every useSearchParams reader\nwindow.history.replaceState(window.history.state, "", hash);', 0],
    ['window.history.replaceState(window.history.state, "", hash); // history-state-bypass: canvas camera, per pointer move', 0],
    ['// history-state-bypass:\nwindow.history.replaceState(window.history.state, "", hash);', 1], // a reason must say something
  ];
  let failed = 0;
  for (const [src, want] of cases) {
    const got = findingsForSource(src, "fixture.tsx").length;
    if (got !== want) {
      failed++;
      console.error(`SELF-TEST FAIL: expected ${want} finding(s), got ${got}:\n${src}\n`);
    }
  }
  if (failed) {
    console.error(`check:history-state-bypass self-test: ${failed} case(s) failed`);
    process.exit(1);
  }
  console.log(`check:history-state-bypass self-test: ${cases.length} cases passed`);
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) {
  selfTest();
} else {
  const files = args.length ? args : trackedSources();
  const findings = [];
  for (const f of files) {
    const path = f.startsWith("/") ? f : join(ROOT, f);
    if (!existsSync(path)) continue;
    findings.push(...findingsForSource(readFileSync(path, "utf8"), f));
  }
  if (findings.length) {
    console.error(findings.join("\n"));
    console.error(`\ncheck:history-state-bypass: ${findings.length} finding(s)`);
    process.exit(1);
  }
  console.log(`check:history-state-bypass: clean (${files.length} files)`);
}
