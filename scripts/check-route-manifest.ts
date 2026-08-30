#!/usr/bin/env tsx
/**
 * check-route-manifest.ts — the checked-in manifest must match a fresh walk.
 *
 *   pnpm check:route-manifest            warn (yellow), exit 0
 *   pnpm check:route-manifest --strict   fail on any drift, exit 1
 *
 * 🚨 A STALE MANIFEST IS WORSE THAN NO MANIFEST. The Python notification spine
 * degrades a link whose route is not live; if this file says a placeholder is
 * live, the spine believes it and the link goes out. So the lockfile is checked
 * the way a lockfile is: regenerate, diff, and say so.
 *
 * It also fails on a page that hands a `promiseKey` to a shell
 * `PLACEHOLDER_SHELLS` does not name — the one way a placeholder route can
 * still look live to the walk.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  generateRouteManifest,
  unclassifiedPromisePages,
  type RouteManifest,
} from "../lib/route-manifest/generate";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const REPO_ROOT = path.resolve(__dirname, "..");
const OUT = path.join(REPO_ROOT, "lib", "route-manifest", "manifest.generated.json");

async function main() {
  const strict = process.argv.includes("--strict");
  const fresh = await generateRouteManifest(REPO_ROOT);

  let checkedIn: RouteManifest | null = null;
  try {
    checkedIn = JSON.parse(readFileSync(OUT, "utf8")) as RouteManifest;
  } catch {
    checkedIn = null;
  }

  const problems: string[] = [];

  if (checkedIn === null) {
    problems.push("lib/route-manifest/manifest.generated.json is missing or unparseable");
  } else {
    const a = new Map(checkedIn.routes.map((r) => [r.pattern, r]));
    const b = new Map(fresh.routes.map((r) => [r.pattern, r]));
    for (const [pattern, r] of b) {
      const was = a.get(pattern);
      if (!was) problems.push(`route not in the manifest: ${pattern} (${r.status})`);
      else if (was.status !== r.status)
        problems.push(`status drift: ${pattern} — manifest says ${was.status}, app says ${r.status}`);
      else if ((was.promiseKey ?? null) !== (r.promiseKey ?? null))
        problems.push(`promise drift: ${pattern} — ${was.promiseKey ?? "none"} → ${r.promiseKey ?? "none"}`);
    }
    for (const pattern of a.keys()) {
      if (!b.has(pattern)) problems.push(`manifest claims a route the app no longer has: ${pattern}`);
    }
  }

  for (const file of await unclassifiedPromisePages(REPO_ROOT)) {
    problems.push(
      `${file} renders a registered promise through a shell PLACEHOLDER_SHELLS does not name — ` +
        `this route is being reported LIVE and a notification link will trust it`,
    );
  }

  if (problems.length === 0) {
    const ph = fresh.routes.filter((r) => r.status === "placeholder").length;
    console.log(
      `${GREEN}✓ route manifest current — ${fresh.routeCount} routes, ${ph} placeholder${RESET}`,
    );
    return;
  }

  const color = strict ? RED : YELLOW;
  console.log("");
  console.log(`${color}${BOLD}ROUTE MANIFEST DRIFT (${problems.length})${RESET}`);
  console.log(
    `${color}The notification spine reads this manifest to decide whether a deep link` +
      ` can be sent. Stale here means a dead link reaches a phone.${RESET}`,
  );
  for (const p of problems) console.log(`${color}  • ${p}${RESET}`);
  console.log(`${color}  Fix: pnpm route-manifest:generate${RESET}`);
  console.log("");
  if (strict) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
