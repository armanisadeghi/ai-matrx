#!/usr/bin/env tsx
/**
 * check-route-manifest-live.ts — THE REGISTERED MANIFEST IS THE ONE THAT DECIDES.
 *
 *   pnpm check:route-manifest:live              # fail on any drift, exit 1
 *   pnpm check:route-manifest:live --self-test  # plant findings, prove it fails
 *
 * 🚨 WHY THIS EXISTS, MEASURED. `platform.route_manifest` was last synced on
 * 2026-09-13 and was still eight days stale on 2026-09-21: **63 routes built in
 * that window had no row at all** — among them `/notifications` (the deep link
 * every `agent.*` digest declares), the whole `/data-v2/**` store, `/approvals`,
 * `/decisions`, `/capture/**`, `/libraries/**` and the archived-organization
 * pages. A route with no row is `unbuilt` to
 * `aidream/services/routes/liveness.py`, so for eight days
 * `services/notifications/link_honesty.py` silently rewrote every one of those
 * links to its nearest live ancestor on the email and in-app legs, and refused
 * the SMS leg outright as `deep_link_not_live`. Nothing failed. Nothing was
 * red. The sync is a command a human has to remember, and for eight days nobody
 * did.
 *
 * `pnpm check:route-manifest` already guards the LOCKFILE against the app. It
 * cannot see this defect at all, because the lockfile was fine — it was the
 * DATABASE the spine reads that was stale. This guard closes that half: it
 * compares, in one pass,
 *
 *     app/**\/page.tsx  →  lib/route-manifest/manifest.generated.json  →  platform.route_manifest
 *
 * and fails on a break at EITHER arrow, naming every route and the one command
 * that fixes it.
 *
 * UNREACHABLE DATABASE IS `UNMEASURED` (exit 2), NEVER A QUIET GREEN. A guard
 * that passes for want of an input is the thing this guard exists to end.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { exitAfterDrain } from "./lib/exit-after-drain";
import { connectDirect, DB_VARS, loadDbEnv } from "./lib/direct-db";
import {
  generateRouteManifest,
  type RouteManifest,
  type RouteManifestEntry,
} from "../lib/route-manifest/generate";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const REPO_ROOT = path.resolve(__dirname, "..");
const LOCKFILE = path.join(REPO_ROOT, "lib", "route-manifest", "manifest.generated.json");

/** The two commands that close each half. Printed verbatim with every finding. */
export const GENERATE_COMMAND = "pnpm route-manifest:generate";
export const SYNC_COMMAND = "pnpm route-manifest:sync";

/** One route's identity as far as the notification spine is concerned. */
interface RouteRow {
  pattern: string;
  status: string;
  promiseKey: string | null;
}

export interface Finding {
  /** The route. Always named — a count is not a finding. */
  pattern: string;
  /** What a notification link to this route does to a reader RIGHT NOW. */
  consequence: string;
  /** The exact command that fixes it. */
  remedy: string;
}

const key = (r: RouteRow) => `${r.status}|${r.promiseKey ?? ""}`;

/**
 * The whole verdict, as a pure function of the three lists — so `--self-test`
 * can plant each finding shape without a database or a checkout.
 */
export function compareManifests(
  app: RouteRow[],
  lockfile: RouteRow[],
  db: RouteRow[],
): Finding[] {
  const findings: Finding[] = [];
  const byPattern = (rows: RouteRow[]) => new Map(rows.map((r) => [r.pattern, r]));
  const a = byPattern(app);
  const l = byPattern(lockfile);
  const d = byPattern(db);

  // ── Arrow 1: the app → the lockfile ───────────────────────────────────────
  for (const [pattern, row] of a) {
    const was = l.get(pattern);
    if (!was) {
      findings.push({
        pattern,
        consequence:
          `this route is served by app/ and is in NO manifest at all, so the notification ` +
          `spine answers \`unbuilt\` for it: every email and in-app link to it is rewritten ` +
          `to its nearest live ancestor, and every SMS leg naming it is refused as ` +
          `deep_link_not_live`,
        remedy: `${GENERATE_COMMAND} && ${SYNC_COMMAND}`,
      });
    } else if (key(was) !== key(row)) {
      findings.push({
        pattern,
        consequence:
          `the lockfile says ${was.status}${was.promiseKey ? ` (${was.promiseKey})` : ""} and ` +
          `the app serves ${row.status}${row.promiseKey ? ` (${row.promiseKey})` : ""} — a link ` +
          `to it is judged against the wrong answer`,
        remedy: `${GENERATE_COMMAND} && ${SYNC_COMMAND}`,
      });
    }
  }
  for (const pattern of l.keys()) {
    if (!a.has(pattern)) {
      findings.push({
        pattern,
        consequence:
          `the lockfile claims a route the app no longer serves, so the spine reports it ` +
          `\`live\` and a link to it reaches a 404`,
        remedy: `${GENERATE_COMMAND} && ${SYNC_COMMAND}`,
      });
    }
  }

  // ── Arrow 2: the lockfile → platform.route_manifest ───────────────────────
  // This is the arrow that broke for eight days, and the only one that decides
  // anything at send time: the spine never reads the lockfile.
  for (const [pattern, row] of l) {
    const registered = d.get(pattern);
    if (!registered) {
      findings.push({
        pattern,
        consequence:
          `built and in the lockfile, but NOT registered in platform.route_manifest — the ` +
          `notification spine reads only the database, so it answers \`unbuilt\` and ` +
          `link_honesty.py is rewriting every link to this route right now`,
        remedy: SYNC_COMMAND,
      });
    } else if (key(registered) !== key(row)) {
      findings.push({
        pattern,
        consequence:
          `platform.route_manifest says ${registered.status}` +
          `${registered.promiseKey ? ` (${registered.promiseKey})` : ""} and the app serves ` +
          `${row.status}${row.promiseKey ? ` (${row.promiseKey})` : ""} — the spine is judging ` +
          `links against a stale row`,
        remedy: SYNC_COMMAND,
      });
    }
  }
  for (const pattern of d.keys()) {
    if (!l.has(pattern)) {
      findings.push({
        pattern,
        consequence:
          `registered in platform.route_manifest but gone from the app — the spine reports it ` +
          `\`live\` and a link to it reaches a 404`,
        remedy: SYNC_COMMAND,
      });
    }
  }

  return findings;
}

function entryRows(m: RouteManifest): RouteRow[] {
  return m.routes.map((r: RouteManifestEntry) => ({
    pattern: r.pattern,
    status: r.status,
    promiseKey: r.promiseKey ?? null,
  }));
}

async function readDbRows(app: string): Promise<RouteRow[]> {
  const env = loadDbEnv();
  if ("missing" in env) {
    throw new Error(
      `the five database variables are not set (${DB_VARS.join(", ")}); looked in ` +
        `${env.looked.join(", ") || "no env file"}`,
    );
  }
  const client: pg.Client = await connectDirect(env, "check-route-manifest-live");
  try {
    const { rows } = await client.query<{
      pattern: string;
      status: string;
      promise_key: string | null;
    }>(
      `select pattern, status, promise_key
         from platform.route_manifest
        where app = $1`,
      [app],
    );
    return rows.map((r) => ({
      pattern: r.pattern,
      status: r.status,
      promiseKey: r.promise_key ?? null,
    }));
  } finally {
    await client.end();
  }
}

/** Three planted findings, one per shape. Proves the guard can still fail. */
function selfTest(): number {
  const base: RouteRow[] = [
    { pattern: "/hr/me", status: "live", promiseKey: null },
    { pattern: "/hr/me/schedule", status: "placeholder", promiseKey: "hr.me.schedule" },
  ];
  const cases: Array<[string, RouteRow[], RouteRow[], RouteRow[], string]> = [
    [
      "a route served by app/ that no manifest names",
      [...base, { pattern: "/planted/new-surface", status: "live", promiseKey: null }],
      base,
      base,
      "/planted/new-surface",
    ],
    [
      "a route in the lockfile that platform.route_manifest never received",
      [...base, { pattern: "/planted/unsynced", status: "live", promiseKey: null }],
      [...base, { pattern: "/planted/unsynced", status: "live", promiseKey: null }],
      base,
      "/planted/unsynced",
    ],
    [
      "a route the database still calls a placeholder after its lane shipped",
      [...base, { pattern: "/planted/shipped", status: "live", promiseKey: null }],
      [...base, { pattern: "/planted/shipped", status: "live", promiseKey: null }],
      [...base, { pattern: "/planted/shipped", status: "placeholder", promiseKey: "x.y" }],
      "/planted/shipped",
    ],
  ];

  let failed = 0;
  for (const [what, app, lockfile, db, expected] of cases) {
    const findings = compareManifests(app, lockfile, db);
    const hit = findings.find((f) => f.pattern === expected);
    if (!hit) {
      console.log(`${RED}  NOT CAUGHT  ${what} — planted ${expected}, guard said nothing${RESET}`);
      failed += 1;
    } else {
      console.log(`${GREEN}  RED as it must be  ${what} → ${hit.pattern}${RESET}`);
    }
  }
  // …and a clean tree must be silent, or the guard is noise rather than a gate.
  const clean = compareManifests(base, base, base);
  if (clean.length !== 0) {
    console.log(`${RED}  FALSE POSITIVE  an aligned tree produced ${clean.length} findings${RESET}`);
    failed += 1;
  } else {
    console.log(`${GREEN}  GREEN on an aligned tree${RESET}`);
  }

  if (failed) {
    console.log(`${RED}${BOLD}route-manifest:live self-test FAILED (${failed})${RESET}`);
    return 1;
  }
  console.log(`${GREEN}✓ route-manifest:live self-test: 3 planted REDs caught, no false positive${RESET}`);
  return 0;
}

async function main() {
  if (process.argv.includes("--self-test")) return exitAfterDrain(selfTest());

  const fresh = await generateRouteManifest(REPO_ROOT);
  let lockfile: RouteManifest | null = null;
  try {
    lockfile = JSON.parse(readFileSync(LOCKFILE, "utf8")) as RouteManifest;
  } catch {
    lockfile = null;
  }
  if (lockfile === null) {
    console.log(`${RED}lib/route-manifest/manifest.generated.json is missing or unparseable${RESET}`);
    console.log(`  Fix: ${GENERATE_COMMAND}`);
    return exitAfterDrain(1);
  }

  let db: RouteRow[];
  try {
    db = await readDbRows(fresh.app);
  } catch (err) {
    // UNMEASURED, exit 2. Never a pass — see the header.
    console.log("");
    console.log(`${RED}${BOLD}ROUTE MANIFEST UNMEASURED${RESET}`);
    console.log(
      `${RED}platform.route_manifest could not be read, so this guard checked NOTHING about ` +
        `the manifest the notification spine actually uses.${RESET}`,
    );
    console.log(`${RED}  ${err instanceof Error ? err.message : String(err)}${RESET}`);
    console.log("");
    return exitAfterDrain(2);
  }

  const findings = compareManifests(entryRows(fresh), entryRows(lockfile), db);

  if (findings.length === 0) {
    console.log(
      `${GREEN}✓ route manifest live — ${fresh.routeCount} routes served, in the lockfile, ` +
        `and registered in platform.route_manifest${RESET}`,
    );
    return exitAfterDrain(0);
  }

  console.log("");
  console.log(`${RED}${BOLD}ROUTE MANIFEST DRIFT (${findings.length})${RESET}`);
  console.log(
    `${RED}aidream/services/notifications/link_honesty.py asks platform.route_manifest whether ` +
      `a link can answer before it sends one. A route missing from it is \`unbuilt\`: the link ` +
      `is rewritten to an ancestor on email and in-app, and the SMS leg is refused.${RESET}`,
  );
  for (const f of findings) {
    console.log(`${RED}  • ${f.pattern} — ${f.consequence}${RESET}`);
    console.log(`${RED}      Fix: ${f.remedy}${RESET}`);
  }
  console.log("");
  return exitAfterDrain(1);
}

main().catch((err) => {
  console.error(err);
  exitAfterDrain(1);
});
