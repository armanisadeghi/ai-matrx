/**
 * FD-T01 canary. It is deliberately inert without --run, --cleanup, or the
 * post-retirement --negative-probe. Positive writes use syncOneFeatureDoc;
 * the negative probe is raw by design so it can prove DB NOT NULL enforcement.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import {
  buildFeatureDocInsert,
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
    : args.includes("--negative-probe")
      ? "negative-probe"
      : null;
if (!mode)
  throw new Error(
    "Use --run, --cleanup <id> <path>, or post-retirement --negative-probe.",
  );
if (
  args.filter((arg) => ["--run", "--cleanup", "--negative-probe"].includes(arg))
    .length !== 1
)
  throw new Error("Use exactly one canary mode.");
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Missing Supabase admin credentials.");
const supabase = createClient<Database>(url, key);
const store = createFeatureDocsStore(supabase);
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
} else if (mode === "cleanup") {
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
} else {
  // This deliberately bypasses the production admission guard only to prove
  // the post-retirement database NOT NULL constraint. Never run it before the
  // default-retirement migration: it would otherwise create a system-org row.
  const path = `__org_canary__/fd-t01-negative-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}/FEATURE.md`;
  const content = readFileSync(
    resolve("features/feature-docs/FEATURE.md"),
    "utf8",
  );
  const { organization_id: _omittedOrganizationId, ...payload } =
    buildFeatureDocInsert(operation, path, content);
  const insert = await supabase
    .schema("admin")
    .from("feature_docs")
    .insert(payload)
    .select("id,path,organization_id");
  if (insert.error?.code !== "23502")
    throw new Error(
      `--negative-probe expected PostgreSQL 23502 after default retirement, received ${insert.error?.code ?? "no error"}: ${insert.error?.message ?? ""}`,
    );
  const check = await supabase
    .schema("admin")
    .from("feature_docs")
    .select("id")
    .eq("path", path);
  if (check.error)
    throw new Error(`--negative-probe verification: ${check.error.message}`);
  if ((check.data?.length ?? 0) !== 0)
    throw new Error("--negative-probe unexpectedly left a row behind");
  console.log(JSON.stringify({ path, expected_error_code: "23502", rows: 0 }));
}
