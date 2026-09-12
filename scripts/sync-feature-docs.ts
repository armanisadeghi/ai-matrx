#!/usr/bin/env npx tsx
/**
 * sync-feature-docs.ts — repo ↔ admin.feature_docs two-way sync.
 *
 *   pnpm sync:feature-docs -- --organization-id <UUID>              # bidirectional (conflicts reported)
 *   pnpm sync:feature-docs -- --organization-id <UUID> --push       # repo → DB
 *   pnpm sync:feature-docs -- --organization-id <UUID> --pull       # DB → repo
 *   pnpm sync:feature-docs -- --organization-id <UUID> --push --confirm-delete
 *     # soft-delete DB rows with no file
 *
 * The documented catalog is currently initiated against the Matrx System
 * organization (39c38960-d30c-4840-b0c1-c9960de95582). That is an explicit
 * initiating value, never a fallback: callers must always supply it themselves.
 *
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (sb_secret_*).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { globSync } from "glob";
import type { Database } from "@/types/database.types";
import {
  FEATURE_DOC_GLOBS,
  md5,
  parseFeatureDocFile,
} from "@/features/feature-docs/sync-utils";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FeatureDocRow = Database["admin"]["Tables"]["feature_docs"]["Row"];
type SyncMode = "bidirectional" | "push" | "pull";

interface CliOptions {
  mode: SyncMode;
  confirmDelete: boolean;
  organizationId: string;
}

interface SyncStats {
  pushed: number;
  pulled: number;
  inSync: number;
  inserted: number;
  softDeleted: number;
  conflicts: string[];
  skipped: number;
}

export function parseArgs(args: readonly string[]): CliOptions {
  const push = args.includes("--push");
  const pull = args.includes("--pull");
  if (push && pull) {
    throw new Error("Use only one of --push or --pull.");
  }
  const organizationIdIndexes = args.reduce<number[]>((indexes, arg, index) => {
    if (arg === "--organization-id") indexes.push(index);
    return indexes;
  }, []);
  if (organizationIdIndexes.length !== 1) {
    throw new Error(
      "Supply exactly one --organization-id <UUID> before the sync can read or write admin.feature_docs.",
    );
  }
  const organizationIdIndex = organizationIdIndexes[0];
  const organizationId =
    organizationIdIndex === -1 ? undefined : args[organizationIdIndex + 1];
  if (!organizationId || !UUID_PATTERN.test(organizationId)) {
    throw new Error(
      "--organization-id <UUID> is required before the sync can read or write admin.feature_docs.",
    );
  }

  return {
    mode: push ? "push" : pull ? "pull" : "bidirectional",
    confirmDelete: args.includes("--confirm-delete"),
    organizationId,
  };
}

function getGitHead(): string {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function createAdminClient(): SupabaseClient<Database> {
  loadEnv({ path: ".env.local" });
  loadEnv({ path: ".env" });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error(
      "[FAIL] Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY in .env.local",
    );
    process.exit(2);
  }
  return createClient<Database>(url, key);
}

function collectRepoDocs(): Map<string, string> {
  const paths = new Set<string>();
  for (const pattern of FEATURE_DOC_GLOBS) {
    for (const abs of globSync(pattern, {
      cwd: ROOT,
      nodir: true,
      dot: true,
      ignore: ["**/node_modules/**", "**/.next/**"],
    })) {
      paths.add(relative(ROOT, abs).split("\\").join("/"));
    }
  }
  const docs = new Map<string, string>();
  for (const path of paths) {
    docs.set(path, readFileSync(join(ROOT, path), "utf8"));
  }
  return docs;
}

async function fetchDbRows(
  supabase: SupabaseClient<Database>,
  organizationId: string,
): Promise<Map<string, FeatureDocRow>> {
  const map = new Map<string, FeatureDocRow>();
  const PAGE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .schema("admin")
      .from("feature_docs")
      // Select all columns so the result matches the full `FeatureDocRow`
      // (the map stores whole rows). An explicit subset drops columns the
      // Row type requires and fails assignment under strict checking.
      .select("*")
      .eq("organization_id", organizationId)
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[FAIL] Failed to load admin.feature_docs:", error.message);
      process.exit(2);
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      map.set(row.path, row);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return map;
}

function writeRepoFile(path: string, content: string): void {
  const abs = join(ROOT, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

async function batchUpsertDocs(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  items: Array<{ path: string; content: string }>,
  dbRows: Map<string, FeatureDocRow>,
  gitHead: string,
): Promise<number> {
  if (items.length === 0) return 0;

  const buildRow = (path: string, content: string) => {
    const parsed = parseFeatureDocFile(path, content);
    const fileHash = md5(content);
    return {
      organization_id: organizationId,
      path,
      slug: parsed.slug,
      title: parsed.title,
      area: parsed.area,
      content,
      sync_base_hash: fileHash,
      sync_base_commit: gitHead,
      synced_at: new Date().toISOString(),
      deleted_at: null,
      metadata: parsed.metadata,
    };
  };

  const toInsert = items.filter((i) => !dbRows.has(i.path));
  const toUpdate = items.filter((i) => dbRows.has(i.path));

  const INSERT_CHUNK = 100;
  let done = 0;

  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + INSERT_CHUNK);
    const rows = chunk.map(({ path, content }) => buildRow(path, content));
    const { error } = await supabase
      .schema("admin")
      .from("feature_docs")
      .insert(rows);
    if (error) throw new Error(`batch insert: ${error.message}`);
    done += chunk.length;
    process.stdout.write(`\r[INFO] Inserted ${done}/${items.length}…`);
  }

  const UPDATE_PARALLEL = 25;
  for (let i = 0; i < toUpdate.length; i += UPDATE_PARALLEL) {
    const chunk = toUpdate.slice(i, i + UPDATE_PARALLEL);
    const results = await Promise.all(
      chunk.map(({ path, content }) => {
        const existing = dbRows.get(path)!;
        return supabase
          .schema("admin")
          .from("feature_docs")
          .update(buildRow(path, content))
          .eq("id", existing.id)
          .eq("organization_id", organizationId);
      }),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(`batch update: ${failed.error.message}`);
    done += chunk.length;
    process.stdout.write(`\r[INFO] Upserted ${done}/${items.length}…`);
  }

  if (items.length > 0) process.stdout.write("\n");
  return items.length;
}

async function batchRefreshSyncMeta(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  rows: FeatureDocRow[],
  gitHead: string,
): Promise<void> {
  const CHUNK = 100;
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map((row) => {
        const hash = row.content_hash ?? md5(row.content);
        return supabase
          .schema("admin")
          .from("feature_docs")
          .update({
            sync_base_hash: hash,
            sync_base_commit: gitHead,
            synced_at: now,
          })
          .eq("id", row.id)
          .eq("organization_id", organizationId);
      }),
    );
  }
}

async function batchSoftDelete(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  rows: FeatureDocRow[],
): Promise<void> {
  const ids = rows.map((r) => r.id);
  const CHUNK = 100;
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error } = await supabase
      .schema("admin")
      .from("feature_docs")
      .update({ deleted_at: now })
      .in("id", chunk)
      .eq("organization_id", organizationId);
    if (error) throw new Error(`batch soft-delete: ${error.message}`);
  }
}

async function runSync(options: CliOptions): Promise<SyncStats> {
  // Capture the validated boundary value once. Every read and mutation below
  // receives this value; a later environment or selection change cannot retarget
  // an admitted sync operation.
  const organizationId = options.organizationId;
  const supabase = createAdminClient();
  const gitHead = getGitHead();
  console.log("[INFO] Collecting repo markdown…");
  const repoDocs = collectRepoDocs();
  console.log(`[INFO] Found ${repoDocs.size} repo .md files`);
  console.log("[INFO] Loading DB rows…");
  const dbRows = await fetchDbRows(supabase, organizationId);
  console.log(`[INFO] Found ${dbRows.size} DB rows`);
  const allPaths = new Set([...repoDocs.keys(), ...dbRows.keys()]);

  const stats: SyncStats = {
    pushed: 0,
    pulled: 0,
    inSync: 0,
    inserted: 0,
    softDeleted: 0,
    conflicts: [],
    skipped: 0,
  };

  const toPush: Array<{ path: string; content: string }> = [];
  const toPull: Array<{ path: string; row: FeatureDocRow }> = [];
  const toRefreshMeta: FeatureDocRow[] = [];
  const toSoftDelete: FeatureDocRow[] = [];
  const missingFileWarn: string[] = [];

  for (const path of allPaths) {
    const fileContent = repoDocs.get(path);
    const row = dbRows.get(path);
    const fileExists = fileContent !== undefined;
    const rowActive = row && row.deleted_at === null;
    const rowAny = row !== undefined;

    if (fileExists && !rowAny) {
      if (options.mode === "pull") {
        stats.skipped++;
        continue;
      }
      toPush.push({ path, content: fileContent! });
      stats.inserted++;
      continue;
    }

    if (!fileExists && rowAny && rowActive) {
      if (options.mode === "pull") {
        toPull.push({ path, row: row! });
        continue;
      }
      if (options.mode === "push") {
        if (!options.confirmDelete) {
          missingFileWarn.push(path);
          stats.skipped++;
          continue;
        }
        toSoftDelete.push(row!);
        continue;
      }
      stats.skipped++;
      continue;
    }

    if (!fileExists || !rowActive) {
      continue;
    }

    const fileHash = md5(fileContent!);
    const dbHash = row!.content_hash ?? md5(row!.content);
    const base = row!.sync_base_hash;

    if (fileHash === dbHash) {
      toRefreshMeta.push(row!);
      continue;
    }

    const fileChanged = base === null || fileHash !== base;
    const dbChanged = base === null || dbHash !== base;

    if (fileChanged && !dbChanged) {
      if (options.mode === "pull") {
        stats.skipped++;
        continue;
      }
      toPush.push({ path, content: fileContent! });
      continue;
    }

    if (dbChanged && !fileChanged) {
      if (options.mode === "push") {
        stats.skipped++;
        continue;
      }
      toPull.push({ path, row: row! });
      continue;
    }

    if (fileChanged && dbChanged && fileHash !== dbHash) {
      stats.conflicts.push(path);
      console.error(`[CONFLICT] ${path}`);
      console.error(
        `  file: ${fileHash}  db: ${dbHash}  base: ${base ?? "(none)"}`,
      );
      continue;
    }

    stats.skipped++;
  }

  if (missingFileWarn.length > 0) {
    console.warn(
      `[WARN] ${missingFileWarn.length} DB row(s) have no repo file (use --confirm-delete to soft-delete).`,
    );
    for (const p of missingFileWarn.slice(0, 10)) {
      console.warn(`  - ${p}`);
    }
    if (missingFileWarn.length > 10) {
      console.warn(`  … and ${missingFileWarn.length - 10} more`);
    }
  }

  if (toPush.length > 0) {
    stats.pushed = await batchUpsertDocs(
      supabase,
      organizationId,
      toPush,
      dbRows,
      gitHead,
    );
  }

  for (const { path, row } of toPull) {
    writeRepoFile(path, row.content);
    stats.pulled++;
  }
  if (toPull.length > 0) {
    await batchRefreshSyncMeta(
      supabase,
      organizationId,
      toPull.map((p) => p.row),
      gitHead,
    );
  }

  if (toRefreshMeta.length > 0) {
    await batchRefreshSyncMeta(
      supabase,
      organizationId,
      toRefreshMeta,
      gitHead,
    );
    stats.inSync = toRefreshMeta.length;
  }

  if (toSoftDelete.length > 0) {
    await batchSoftDelete(supabase, organizationId, toSoftDelete);
    stats.softDeleted = toSoftDelete.length;
  }

  return stats;
}

function printSummary(stats: SyncStats, mode: SyncMode): void {
  console.log("");
  console.log(`Mode: ${mode}`);
  console.log(`  inserted:     ${stats.inserted}`);
  console.log(`  pushed:       ${stats.pushed}`);
  console.log(`  pulled:       ${stats.pulled}`);
  console.log(`  in-sync:      ${stats.inSync}`);
  console.log(`  soft-deleted: ${stats.softDeleted}`);
  console.log(`  skipped:      ${stats.skipped}`);
  console.log(`  conflicts:    ${stats.conflicts.length}`);
  if (stats.conflicts.length > 0) {
    console.log("  conflict paths:");
    for (const p of stats.conflicts) console.log(`    - ${p}`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(`[INFO] Scanning repo (${FEATURE_DOC_GLOBS.length} glob roots)…`);
  const stats = await runSync(options);
  printSummary(stats, options.mode);
  if (stats.conflicts.length > 0) {
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error("[FAIL]", err instanceof Error ? err.message : err);
    process.exit(2);
  });
}
