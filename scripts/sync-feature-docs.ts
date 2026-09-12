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
import { readAllRows } from "@ai-matrx/data/db";
import { requireOrganizationContext } from "@/lib/api/organization-context";
import type { Database } from "@/types/database.types";
import {
  FEATURE_DOC_GLOBS,
  md5,
  parseFeatureDocFile,
} from "@/features/feature-docs/sync-utils";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
type FeatureDocRow = Database["admin"]["Tables"]["feature_docs"]["Row"];
type FeatureDocInsert = Database["admin"]["Tables"]["feature_docs"]["Insert"];
type FeatureDocUpdate = Database["admin"]["Tables"]["feature_docs"]["Update"];
type SyncMode = "bidirectional" | "push" | "pull";

export interface SyncOperation {
  organizationId: string;
  gitHead: string;
}

export interface FeatureDocsStore {
  list(organizationId: string): Promise<FeatureDocRow[]>;
  insert(row: FeatureDocInsert): Promise<FeatureDocRow>;
  update(
    id: string,
    organizationId: string,
    update: FeatureDocUpdate,
  ): Promise<FeatureDocRow>;
  softDelete(
    id: string,
    organizationId: string,
    path: string,
  ): Promise<FeatureDocRow>;
  delete(
    id: string,
    organizationId: string,
    path: string,
  ): Promise<FeatureDocRow>;
}

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
  const organizationIdRaw =
    organizationIdIndex === -1 ? undefined : args[organizationIdIndex + 1];
  const organizationId = requireOrganizationContext(organizationIdRaw);

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

function assertOne(
  operation: string,
  data: Pick<FeatureDocRow, "id" | "path" | "organization_id">[] | null,
  error: { message: string } | null,
): Pick<FeatureDocRow, "id" | "path" | "organization_id"> {
  if (error) throw new Error(`${operation}: ${error.message}`);
  if (!data || data.length !== 1)
    throw new Error(
      `${operation}: expected exactly one affected row, received ${data?.length ?? 0}`,
    );
  return data[0];
}

export function createFeatureDocsStore(
  supabase: SupabaseClient<Database>,
): FeatureDocsStore {
  return {
    async list(organizationId) {
      return readAllRows<FeatureDocRow>(
        ({ from, to }) =>
          supabase
            .schema("admin")
            .from("feature_docs")
            .select("*")
            .eq("organization_id", organizationId)
            .order("id", { ascending: true })
            .range(from, to),
        { label: "admin.feature_docs sync inventory" },
      );
    },
    async insert(row) {
      const result = await supabase
        .schema("admin")
        .from("feature_docs")
        .insert(row)
        .select("id,path,organization_id");
      const found = assertOne("feature-doc insert", result.data, result.error);
      return { ...row, ...found } as FeatureDocRow;
    },
    async update(id, organizationId, update) {
      const result = await supabase
        .schema("admin")
        .from("feature_docs")
        .update(update)
        .eq("id", id)
        .eq("organization_id", organizationId)
        .select("id,path,organization_id");
      const found = assertOne("feature-doc update", result.data, result.error);
      return { ...update, ...found } as FeatureDocRow;
    },
    async softDelete(id, organizationId, path) {
      const result = await supabase
        .schema("admin")
        .from("feature_docs")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("path", path)
        .eq("organization_id", organizationId)
        .select("id,path,organization_id");
      const found = assertOne(
        "feature-doc soft-delete",
        result.data,
        result.error,
      );
      return found as FeatureDocRow;
    },
    async delete(id, organizationId, path) {
      const result = await supabase
        .schema("admin")
        .from("feature_docs")
        .delete()
        .eq("id", id)
        .eq("path", path)
        .eq("organization_id", organizationId)
        .select("id,path,organization_id");
      const found = assertOne("feature-doc delete", result.data, result.error);
      return found as FeatureDocRow;
    },
  };
}

function writeRepoFile(path: string, content: string): void {
  const abs = join(ROOT, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

async function batchUpsertDocs(
  store: FeatureDocsStore,
  operation: SyncOperation,
  items: Array<{ path: string; content: string }>,
  dbRows: Map<string, FeatureDocRow>,
  gitHead: string,
): Promise<number> {
  if (items.length === 0) return 0;

  const buildRow = (path: string, content: string) => {
    const parsed = parseFeatureDocFile(path, content);
    const fileHash = md5(content);
    return {
      organization_id: operation.organizationId,
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
    for (const row of rows) {
      const inserted = await store.insert(row);
      if (inserted.organization_id !== operation.organizationId)
        throw new Error(
          "feature-doc insert returned a mismatched organization",
        );
    }
    done += chunk.length;
    process.stdout.write(`\r[INFO] Inserted ${done}/${items.length}…`);
  }

  const UPDATE_PARALLEL = 25;
  for (let i = 0; i < toUpdate.length; i += UPDATE_PARALLEL) {
    const chunk = toUpdate.slice(i, i + UPDATE_PARALLEL);
    const results = await Promise.all(
      chunk.map(({ path, content }) => {
        const existing = dbRows.get(path)!;
        if (existing.organization_id !== operation.organizationId)
          throw new Error(
            `feature-doc update refused: ${path} belongs to a different organization`,
          );
        const { organization_id: _organizationId, ...update } = buildRow(
          path,
          content,
        );
        return store.update(existing.id, operation.organizationId, update);
      }),
    );
    for (const updated of results) {
      if (updated.organization_id !== operation.organizationId)
        throw new Error(
          "feature-doc update returned a mismatched organization",
        );
    }
    done += chunk.length;
    process.stdout.write(`\r[INFO] Upserted ${done}/${items.length}…`);
  }

  if (items.length > 0) process.stdout.write("\n");
  return items.length;
}

async function batchRefreshSyncMeta(
  store: FeatureDocsStore,
  operation: SyncOperation,
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
        if (row.organization_id !== operation.organizationId)
          throw new Error(
            `feature-doc metadata refresh refused: ${row.path} belongs to a different organization`,
          );
        return store.update(row.id, operation.organizationId, {
          sync_base_hash: hash,
          sync_base_commit: gitHead,
          synced_at: now,
        });
      }),
    );
  }
}

async function batchSoftDelete(
  store: FeatureDocsStore,
  operation: SyncOperation,
  rows: FeatureDocRow[],
): Promise<void> {
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (row) => {
        if (row.organization_id !== operation.organizationId)
          throw new Error(
            `feature-doc soft-delete refused: ${row.path} belongs to a different organization`,
          );
        const deleted = await store.softDelete(
          row.id,
          operation.organizationId,
          row.path,
        );
        if (deleted.organization_id !== operation.organizationId)
          throw new Error(
            "feature-doc soft-delete returned a mismatched organization",
          );
      }),
    );
  }
}

async function runSync(options: CliOptions): Promise<SyncStats> {
  // Capture the validated boundary value once. Every read and mutation below
  // receives this value; a later environment or selection change cannot retarget
  // an admitted sync operation.
  const operation: SyncOperation = {
    organizationId: options.organizationId,
    gitHead: getGitHead(),
  };
  const supabase = createAdminClient();
  const store = createFeatureDocsStore(supabase);
  console.log("[INFO] Collecting repo markdown…");
  const repoDocs = collectRepoDocs();
  console.log(`[INFO] Found ${repoDocs.size} repo .md files`);
  console.log("[INFO] Loading DB rows…");
  const dbRows = new Map(
    (await store.list(operation.organizationId)).map((row) => [row.path, row]),
  );
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
      store,
      operation,
      toPush,
      dbRows,
      operation.gitHead,
    );
  }

  for (const { path, row } of toPull) {
    writeRepoFile(path, row.content);
    stats.pulled++;
  }
  if (toPull.length > 0) {
    await batchRefreshSyncMeta(
      store,
      operation,
      toPull.map((p) => p.row),
      operation.gitHead,
    );
  }

  if (toRefreshMeta.length > 0) {
    await batchRefreshSyncMeta(
      store,
      operation,
      toRefreshMeta,
      operation.gitHead,
    );
    stats.inSync = toRefreshMeta.length;
  }

  if (toSoftDelete.length > 0) {
    await batchSoftDelete(store, operation, toSoftDelete);
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
