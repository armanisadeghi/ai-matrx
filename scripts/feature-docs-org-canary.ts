/**
 * One-row FD-T01 canary. This is deliberately inert without --run or --cleanup.
 * It uses syncOneFeatureDoc, the exact production parser/payload/store path.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import {
  createFeatureDocsStore,
  syncOneFeatureDoc,
  type SyncOperation,
} from "./sync-feature-docs";
import type { Database } from "@/types/database.types";

const SYSTEM_ORG = "39c38960-d30c-4840-b0c1-c9960de95582";
const args = process.argv.slice(2);
const mode = args.includes("--run")
  ? "run"
  : args.includes("--cleanup")
    ? "cleanup"
    : null;
if (!mode)
  throw new Error(
    "Use --run to insert one canary or --cleanup <id> <path> to remove that exact canary.",
  );
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Missing Supabase admin credentials.");
const store = createFeatureDocsStore(createClient<Database>(url, key));
const operation: SyncOperation = {
  organizationId: SYSTEM_ORG,
  gitHead: "fd-t01-canary",
};
if (mode === "run") {
  const path = `__org_canary__/fd-t01-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}/FEATURE.md`;
  const content = readFileSync(
    resolve("features/feature-docs/FEATURE.md"),
    "utf8",
  );
  const row = await syncOneFeatureDoc(store, operation, path, content);
  console.log(
    JSON.stringify({
      id: row.id,
      path: row.path,
      organization_id: row.organization_id,
    }),
  );
} else {
  const [id, path] = args.filter((arg) => !arg.startsWith("--"));
  if (!id || !path || !path.startsWith("__org_canary__/"))
    throw new Error(
      "--cleanup requires the returned id and __org_canary__ path.",
    );
  const row = await store.delete(id, SYSTEM_ORG, path);
  console.log(
    JSON.stringify({
      id: row.id,
      path: row.path,
      organization_id: row.organization_id,
    }),
  );
}
