#!/usr/bin/env tsx
/**
 * check:settings — run all five Unified Settings Platform guards and exit with
 * the WORST result. `a; b; c` would report only the last guard's exit code,
 * which is exactly the "green over an unread source" this family forbids.
 *
 * Exit: 0 all clean · 1 any findings · 2 any UNMEASURED (2 wins over 1).
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const GUARDS = [
  "check:settings-orphans",
  "check:settings-unregistered",
  "check:settings-hardcoded",
  "check:settings-env-toggles",
  "check:settings-ladder-ui",
];

let worst = 0;
const summary: string[] = [];
for (const g of GUARDS) {
  const r = spawnSync("pnpm", ["--silent", g, ...process.argv.slice(2)], { stdio: "inherit" });
  const code = r.status ?? 2;
  worst = Math.max(worst, code);
  summary.push(`${code === 0 ? "✓" : code === 1 ? "✗" : "?"} ${g} (exit ${code}${code === 2 ? " UNMEASURED" : ""})`);
}
console.log(`\n\x1b[1mcheck:settings\x1b[0m\n  ${summary.join("\n  ")}\n`);
process.exit(worst);
