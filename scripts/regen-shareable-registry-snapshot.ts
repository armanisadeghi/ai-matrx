/**
 * regen-shareable-registry-snapshot.ts
 *
 * Re-pulls the live shareable_resource_registry from the production Supabase
 * project and rewrites the snapshot used by the parity test
 * (utils/permissions/__tests__/registry.db-snapshot.json).
 *
 * Workflow when adding a new shareable resource type:
 *   1. Apply the DB migration (one INSERT into shareable_resource_registry).
 *   2. Mirror the new row in utils/permissions/registry.ts.
 *   3. Run: pnpm tsx scripts/regen-shareable-registry-snapshot.ts
 *   4. Commit the diff (migration + registry.ts + snapshot.json).
 *   5. Tests will fail in CI if any of the three are out of sync.
 *
 * DRIFT GUARD: `pnpm check:shareable-registry` (this script with `--check`)
 * pulls the LIVE registry and screams if it no longer equals the committed
 * snapshot. The parity test alone only compares the TS mirror to the committed
 * snapshot — a live-DB row nobody snapshotted is invisible to it (that gap
 * shipped the assessment enum bug). Run `--check` on any registry migration.
 *
 * Why a script instead of a live test query? Tests must run offline, in
 * preview deploys, in pre-commit hooks, on PR forks. The committed snapshot
 * gives reviewers a visible diff (e.g. "this PR adds 'task' to the registry")
 * and survives DB downtime.
 *
 * Required environment variables (loaded from .env.local automatically):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY (read-only access to the registry table is enough)
 *   — or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY if the table is readable to anon.
 *
 * API keys: ONLY sb_publishable_* / sb_secret_*. The legacy JWT-based
 * SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY are DEPRECATED
 * and BANNED — do not reintroduce them (ESLint will block it).
 * Docs: https://supabase.com/docs/guides/getting-started/api-keys
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const SNAPSHOT_PATH = join(
  __dirname,
  "..",
  "utils",
  "permissions",
  "__tests__",
  "registry.db-snapshot.json",
);

// `--check` verifies the committed snapshot still equals the LIVE DB registry
// and screams (non-zero) on drift instead of writing. This closes the gap that
// let the assessment enum bug ship: the parity test only diffs the TS mirror
// against the COMMITTED snapshot — so a live-DB change nobody snapshotted was
// invisible. Run it on any DB registry migration and in release gates.
const CHECK_ONLY = process.argv.includes("--check");

async function fetchRegistryJson(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY / " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .schema("platform").from("shareable_resource_registry")
    .select(
      "resource_type, table_name, id_column, owner_column, is_public_column, display_label, url_path_template, rls_uses_has_permission, is_active",
    )
    .order("resource_type");

  if (error) {
    console.error("Failed to load shareable_resource_registry:", error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error("shareable_resource_registry returned no rows — aborting.");
    process.exit(1);
  }

  return JSON.stringify(data, null, 2) + "\n";
}

async function main() {
  const live = await fetchRegistryJson();

  if (CHECK_ONLY) {
    let committed = "";
    try {
      committed = readFileSync(SNAPSHOT_PATH, "utf-8");
    } catch {
      committed = "";
    }
    if (committed !== live) {
      console.error(
        "\n╔══════════════════════════════════════════════════════════════════╗\n" +
          "║  SHAREABLE-REGISTRY SNAPSHOT DRIFT — live DB ≠ committed snapshot  ║\n" +
          "╚══════════════════════════════════════════════════════════════════╝\n" +
          "The live platform.shareable_resource_registry no longer matches\n" +
          "utils/permissions/__tests__/registry.db-snapshot.json. The parity test\n" +
          "only checks the TS mirror against the COMMITTED snapshot, so this drift\n" +
          "is otherwise INVISIBLE (this is exactly how the assessment enum bug\n" +
          "shipped). Fix:\n" +
          "  1. pnpm tsx scripts/regen-shareable-registry-snapshot.ts\n" +
          "  2. Sync utils/permissions/registry.ts to match the new rows\n" +
          "  3. pnpm test:unit utils/permissions   (must be green)\n" +
          "  4. Commit the migration + registry.ts + snapshot together\n",
      );
      process.exit(1);
    }
    console.log("Shareable-registry snapshot is in sync with the live DB.");
    return;
  }

  writeFileSync(SNAPSHOT_PATH, live, "utf-8");
  console.log(
    `Wrote ${JSON.parse(live).length} rows to ${SNAPSHOT_PATH}.\n` +
      `Run \`pnpm test:unit utils/permissions\` to verify the TS mirror is in sync.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
