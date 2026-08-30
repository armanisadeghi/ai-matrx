#!/usr/bin/env tsx
/**
 * sync-route-manifest.ts — push this app's route manifest to the platform DB.
 *
 *   pnpm route-manifest:sync
 *
 * 🚨 THE APP THAT SERVES THE ROUTES IS THE ONE THAT REGISTERS THEM. The Python
 * notification spine cannot see this repo at runtime; it asks
 * `platform.route_manifest` whether a route can answer a link before it puts
 * that link in a text message. This script is the only thing that puts truth
 * there, and it runs from the deploy that changes the routes — so the manifest
 * describes the frontend that is actually serving, not the one in somebody's
 * checkout.
 *
 * `source_sha` is this repo's HEAD, stamped on every row: the spine logs it, so
 * "the manifest disagrees with the app" is answerable without guessing.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getAdminSupabaseClient } from "../utils/supabase/getScriptClient";
import type { RouteManifest } from "../lib/route-manifest/generate";

const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(REPO_ROOT, "lib", "route-manifest", "manifest.generated.json");

function headSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT }).toString().trim();
  } catch {
    // A deploy from a tarball has no git. Better an honest marker than a lie.
    return `no-git-${new Date().toISOString().slice(0, 10)}`;
  }
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as RouteManifest;
  if (manifest.version !== 1) {
    throw new Error(`route manifest version ${manifest.version} — this script writes version 1`);
  }
  if (manifest.routes.length !== manifest.routeCount) {
    throw new Error(
      `route manifest is truncated: routeCount=${manifest.routeCount}, routes=${manifest.routes.length}`,
    );
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase.schema("platform").rpc("sync_route_manifest", {
    p_app: manifest.app,
    p_routes: manifest.routes,
    p_source_sha: headSha(),
  });
  if (error) throw new Error(`sync_route_manifest failed: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;
  console.log(
    `route manifest synced (${manifest.app} @ ${headSha().slice(0, 8)}): ` +
      `+${row?.inserted ?? 0} inserted, ~${row?.updated ?? 0} updated, -${row?.removed ?? 0} removed`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
