#!/usr/bin/env tsx
/**
 * generate-route-manifest.ts — write `lib/route-manifest/manifest.generated.json`.
 *
 *   pnpm route-manifest:generate
 *
 * The JSON is a LOCKFILE, not a second source: it is what CI in this repo and
 * in `aidream` can read without a database, and what the `platform.route_manifest`
 * sync pushes to the DB the notification spine reads at send time. It is never
 * edited by hand — `pnpm check:route-manifest` fails when it drifts from a fresh
 * walk of `app/`.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { generateRouteManifest } from "../lib/route-manifest/generate";

const REPO_ROOT = path.resolve(__dirname, "..");
const OUT = path.join(REPO_ROOT, "lib", "route-manifest", "manifest.generated.json");

async function main() {
  const manifest = await generateRouteManifest(REPO_ROOT);
  writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  const placeholders = manifest.routes.filter((r) => r.status === "placeholder");
  console.log(
    `route manifest: ${manifest.routeCount} routes — ` +
      `${manifest.routeCount - placeholders.length} live, ${placeholders.length} placeholder`,
  );
  for (const r of placeholders) console.log(`  placeholder  ${r.pattern}  (${r.promiseKey ?? "unregistered"})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
