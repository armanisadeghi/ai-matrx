#!/usr/bin/env npx tsx
/**
 * Data-integrity gate — the CLI half of the integrity system. Runs the same
 * checks the admin page does (lib/integrity), against the live DB, and screams
 * about referential/storage drift in the file system and PDF document bridge.
 *
 *   pnpm check:data-integrity            # loud, non-blocking (exit 0) — for hooks
 *   pnpm check:data-integrity --strict   # exit 1 when any ERROR-severity finding exists — for CI
 *   pnpm check:data-integrity --probe    # also run the S3 byte probe (needs MATRX_ADMIN_JWT)
 *   pnpm check:data-integrity --json     # machine-readable report to stdout
 *
 * Exit codes:
 *   0  clean, OR findings in default (non-blocking) mode, OR creds absent
 *   1  ERROR-severity findings AND --strict
 *   2  unexpected error (DB unreachable, etc.)
 *
 * SQL runs through the `execute_admin_query` RPC using the Supabase secret key
 * (same RLS-bypassing path as the admin SQL editor). The optional probe uses
 * MATRX_ADMIN_JWT against the Python download endpoint.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { runIntegrityChecks } from "../lib/integrity/runner";
import { unwrapRows } from "../lib/integrity/unwrap";
import type { FileProbe, IntegrityFinding } from "../lib/integrity/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[97m",
};
const TAG = {
  info: `${C.cyan}[INFO]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
  ok: `${C.green}[ OK ]${C.reset} `,
};

function loadEnv(): {
  url: string;
  key: string;
  jwt?: string;
  backend?: string;
} | null {
  const env: Record<string, string> = {};
  const want = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "MATRX_ADMIN_JWT",
    "NEXT_PUBLIC_BACKEND_URL_PROD",
    "NEXT_PUBLIC_BACKEND_URL",
  ];
  for (const k of want) if (process.env[k]) env[k] = process.env[k] as string;

  if (
    !env.SUPABASE_SECRET_KEY ||
    !(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL)
  ) {
    for (const f of [
      ".env.local",
      ".env.production.local",
      ".env.production",
      ".env",
    ]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const [, k, raw] = m;
        if (want.includes(k) && !env[k])
          env[k] = (raw ?? "").replace(/^['"]|['"]$/g, "");
      }
    }
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL ?? "";
  const key = env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) return null;
  return {
    url,
    key,
    jwt: env.MATRX_ADMIN_JWT,
    backend: env.NEXT_PUBLIC_BACKEND_URL_PROD ?? env.NEXT_PUBLIC_BACKEND_URL,
  };
}

function makeProbe(backend: string, jwt: string): FileProbe {
  const base = backend.replace(/\/$/, "");
  return async (fileId: string) => {
    const start = Date.now();
    try {
      const res = await fetch(
        `${base}/files/${encodeURIComponent(fileId)}/download?inline=true`,
        { headers: { Authorization: `Bearer ${jwt}`, Range: "bytes=0-0" } },
      );
      await res.arrayBuffer().catch(() => undefined);
      return { status: res.status, ms: Date.now() - start };
    } catch (err) {
      return {
        status: null,
        ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

async function main(): Promise<number> {
  const strict = process.argv.includes("--strict");
  const wantProbe = process.argv.includes("--probe");
  const asJson = process.argv.includes("--json");

  const env = loadEnv();
  if (!env) {
    console.log(
      `${TAG.warn}Data integrity: Supabase creds absent — check skipped`,
    );
    return 0;
  }

  const supabase = createClient(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sql = async (query: string): Promise<IntegrityFinding[]> => {
    const { data, error } = await supabase.rpc("execute_admin_query", {
      query,
    });
    if (error) throw new Error(error.message);
    return unwrapRows(data);
  };

  let probe: FileProbe | undefined;
  if (wantProbe) {
    if (env.jwt && env.backend) probe = makeProbe(env.backend, env.jwt);
    else
      console.log(
        `${TAG.warn}--probe requested but MATRX_ADMIN_JWT / backend URL missing — probe will report skipped`,
      );
  }

  let report;
  try {
    report = await runIntegrityChecks(
      { sql, probe },
      { includeProbe: wantProbe },
    );
  } catch (err) {
    console.error(`${TAG.fail}Data integrity: run failed — ${String(err)}`);
    return 2;
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return strict && report.totals.errorFindings > 0 ? 1 : 0;
  }

  const t = report.totals;
  console.log();
  for (const r of report.results) {
    if (r.skipped) {
      console.log(`${TAG.warn}${r.title} ${C.dim}(skipped)${C.reset}`);
      continue;
    }
    if (r.error) {
      console.log(
        `${TAG.fail}${r.title} ${C.dim}— check error: ${r.error}${C.reset}`,
      );
      continue;
    }
    if (r.count === 0) {
      console.log(`${TAG.ok}${r.title}`);
      continue;
    }
    const tag = r.severity === "error" ? TAG.fail : TAG.warn;
    const color = r.severity === "error" ? C.red : C.yellow;
    console.log(
      `${tag}${color}${r.title} — ${r.count} ${r.count === 1 ? "issue" : "issues"}${C.reset}`,
    );
    for (const row of r.sample.slice(0, 5)) {
      console.log(`  ${C.dim}- ${JSON.stringify(row)}${C.reset}`);
    }
    if (r.count > 5)
      console.log(`  ${C.dim}…and ${r.count - 5} more${C.reset}`);
    if (r.remediation)
      console.log(`  ${C.white}Fix: ${r.remediation}${C.reset}`);
  }

  console.log();
  console.log(
    `${C.bold}Summary:${C.reset} ` +
      `${C.red}${t.errorFindings} error${C.reset} · ` +
      `${C.yellow}${t.warningFindings} warning${C.reset} · ` +
      `${t.checks} checks` +
      (t.failed ? ` · ${C.red}${t.failed} failed${C.reset}` : "") +
      (t.skipped ? ` · ${t.skipped} skipped` : ""),
  );

  if (t.errorFindings > 0 && strict) return 1;
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(
      `${C.red}check:data-integrity — unexpected error:${C.reset}`,
      err,
    );
    process.exit(2);
  },
);
