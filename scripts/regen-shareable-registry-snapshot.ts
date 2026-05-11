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
import { writeFileSync } from "node:fs";
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

async function main() {
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
    .from("shareable_resource_registry")
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

  const formatted = JSON.stringify(data, null, 2) + "\n";
  writeFileSync(SNAPSHOT_PATH, formatted, "utf-8");

  console.log(
    `Wrote ${data.length} rows to ${SNAPSHOT_PATH}.\n` +
      `Run \`pnpm test:unit utils/permissions\` to verify the TS mirror is in sync.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
