/**
 * scripts/media-durability/check-media-durability.ts
 *
 * Re-runs the stored-signed-URL inventory and reports hits AGAINST THE
 * CLASSIFICATION in ./allowlist.json.
 *
 * THE POINT: an expiring signed URL is not a defect. A time-boxed share link, a
 * TTL cache, an audit row recording exactly what was issued — expiry is the
 * feature there, and "fixing" those breaks working behaviour. The defect is the
 * MISMATCH between a URL's lifetime and its consumer's contract: a column an
 * anonymous surface reads, or a column that must still resolve for its owner
 * tomorrow, holding something that dies in a week.
 *
 * So this checker is quiet about every column the allowlist explains and loud
 * about anything else. A hit in a NEW column is a new mismatch until a human
 * classifies it — and classifying it means naming the consumer and why expiry is
 * fine for it, not adding a line to shut the checker up.
 *
 * LOUD, ADVISORY, NEVER BLOCKING (house rule) — exit code is 0 unless --strict.
 *
 *   pnpm check:media-durability            # contract-scoped (fast; release gate)
 *   pnpm check:media-durability --full     # every text-ish column (patrol sweep)
 *   pnpm check:media-durability --strict   # exit 1 on an unclassified hit
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const HERE = dirname(fileURLToPath(import.meta.url));

interface AllowEntry {
  target: string;
  reason: string;
  consumer: string;
  open?: boolean;
  rows_affected?: number;
}
interface Allowlist {
  intentional: AllowEntry[];
  mitigated: AllowEntry[];
  mismatch_open: AllowEntry[];
}
interface ScanRow {
  schema_name: string;
  table_name: string;
  column_name: string;
  row_count: number;
}

const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

function loadAllowlist(): Allowlist {
  return JSON.parse(
    readFileSync(join(HERE, "allowlist.json"), "utf8"),
  ) as Allowlist;
}

async function main(): Promise<void> {
  const full = process.argv.includes("--full");
  const strict = process.argv.includes("--strict");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "";
  if (!url || !key) {
    console.error(
      `${C.yellow}[media-durability] skipped — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY not set.${C.reset}`,
    );
    process.exit(0);
  }

  const supabase = createClient(url, key);

  // The full sweep reads every text-ish column in the database and blows past
  // the PostgREST statement timeout as one call, so it is batched per schema.
  // Any schema too big to finish is NAMED, never silently dropped — a patrol
  // that quietly skips the biggest tables reads as "all clear" when it isn't.
  const rows: ScanRow[] = [];
  const uncovered: string[] = [];

  if (!full) {
    const { data, error } = await supabase.rpc("mtx_media_durability_scan", {
      p_full: false,
      p_schema: null,
    });
    if (error) {
      console.error(
        `${C.yellow}[media-durability] scan RPC failed: ${error.message}${C.reset}`,
      );
      process.exit(0);
    }
    rows.push(...((data ?? []) as ScanRow[]));
  } else {
    const { data: schemaRows, error: schemaErr } = await supabase.rpc(
      "mtx_media_durability_schemas",
    );
    if (schemaErr) {
      console.error(
        `${C.yellow}[media-durability] could not list schemas: ${schemaErr.message}${C.reset}`,
      );
      process.exit(0);
    }
    const schemas = ((schemaRows ?? []) as { schema_name: string }[]).map(
      (s) => s.schema_name,
    );
    for (const schema of schemas) {
      const { data, error } = await supabase.rpc("mtx_media_durability_scan", {
        p_full: true,
        p_schema: schema,
      });
      if (error) {
        uncovered.push(`${schema} (${error.message})`);
        continue;
      }
      rows.push(...((data ?? []) as ScanRow[]));
      process.stdout.write(`${C.dim}.${C.reset}`);
    }
    process.stdout.write("\n");
  }
  const allow = loadAllowlist();
  const byTarget = new Map<string, { entry: AllowEntry; bucket: string }>();
  for (const [bucket, list] of Object.entries(allow) as [
    string,
    AllowEntry[],
  ][]) {
    if (!Array.isArray(list)) continue;
    for (const e of list) byTarget.set(e.target, { entry: e, bucket });
  }

  const unclassified: ScanRow[] = [];
  const known: { row: ScanRow; entry: AllowEntry; bucket: string }[] = [];
  for (const r of rows) {
    const target = `${r.schema_name}.${r.table_name}.${r.column_name}`;
    const hit = byTarget.get(target);
    if (hit) known.push({ row: r, entry: hit.entry, bucket: hit.bucket });
    else unclassified.push(r);
  }

  console.log(
    `\n${C.bold}Media durability — stored signed/expiring URLs${C.reset} ` +
      `${C.dim}(${full ? "full sweep" : "contract-scoped"})${C.reset}`,
  );
  console.log(
    `${C.dim}An expiring URL is only a defect when its consumer needs it to ` +
      `resolve later, or for anyone.${C.reset}\n`,
  );

  const openItems = known.filter((k) => k.entry.open);
  const quiet = known.filter((k) => !k.entry.open);

  if (quiet.length) {
    console.log(
      `${C.green}✓ ${quiet.length} column(s) holding signed URLs BY DESIGN${C.reset} ` +
        `${C.dim}(audit / log / verbatim third-party / retired) — correct, left alone.${C.reset}`,
    );
  }

  if (openItems.length) {
    console.log(
      `\n${C.yellow}▲ ${openItems.length} classified-but-open column(s):${C.reset}`,
    );
    for (const { row, entry, bucket } of openItems) {
      console.log(
        `  ${C.bold}${row.schema_name}.${row.table_name}.${row.column_name}${C.reset} ` +
          `${C.dim}(${row.row_count} rows, ${bucket})${C.reset}`,
      );
      console.log(`    ${entry.reason}`);
      console.log(`    ${C.dim}consumer: ${entry.consumer}${C.reset}`);
    }
  }

  if (unclassified.length) {
    console.log(
      `\n${C.red}✗ ${unclassified.length} UNCLASSIFIED column(s) holding signed URLs:${C.reset}`,
    );
    for (const r of unclassified) {
      console.log(
        `  ${C.red}${r.schema_name}.${r.table_name}.${r.column_name}${C.reset} — ${r.row_count} rows`,
      );
    }
    console.log(
      `\n${C.dim}  Decide the CONSUMER for each: must it resolve later, or for an\n` +
        `  anonymous viewer? If yes → fix the writer to persist a durable ref\n` +
        `  (public/CDN URL, or a file_id re-minted on read) and backfill.\n` +
        `  If expiry is genuinely correct → add it to scripts/media-durability/\n` +
        `  allowlist.json WITH the consumer and the reason.${C.reset}`,
    );
  } else {
    console.log(`\n${C.green}✓ no unclassified hits.${C.reset}`);
  }

  if (uncovered.length) {
    console.log(
      `\n${C.yellow}▲ ${uncovered.length} schema(s) NOT covered by this sweep ` +
        `— treat the result as partial, not clean:${C.reset}`,
    );
    for (const u of uncovered) console.log(`  ${u}`);
  }

  console.log("");
  process.exit(strict && unclassified.length ? 1 : 0);
}

void main();
