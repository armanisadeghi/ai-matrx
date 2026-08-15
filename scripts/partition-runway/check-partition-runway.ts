#!/usr/bin/env tsx
/**
 * check:partition-runway — does any time-bounded DDL run out soon?
 *
 * THE FAILURE THIS EXISTS FOR (D122). history.row_versions is RANGE-partitioned
 * on occurred_at. In August 2026 its last partition ended and nothing created
 * the next one, so the version trigger on 121 versioned tables raised on EVERY
 * INSERT/UPDATE/DELETE for four days. No file, note, task, transcript or agent
 * run was written.
 *
 * Every schema check we already run would have passed that whole time.
 * `pnpm check:schema` and aidream's schema analysis compare code against DB
 * SHAPE — and the shape was correct. What was exhausted was the DATA RANGE the
 * shape covers. Structure does not change while time runs out, so only a check
 * that knows what day it is can see this class at all.
 *
 *   pnpm check:partition-runway            # loud, exit 0 (advisory — the default)
 *   pnpm check:partition-runway --strict   # exit 1 on any error-severity finding (CI)
 *   pnpm check:partition-runway --json     # machine-readable
 *
 * Exit codes: 0 always, unless --strict and an error-severity finding exists (1),
 * or the snapshot could not be read at all (2 in strict, 0 otherwise).
 *
 * Rules and thresholds live in ./core.ts (pure, unit-tested). This file only
 * fetches and prints. Contract: ./FEATURE.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { classify, thresholdFor } from "./core";
import type { Finding, RunwaySnapshot } from "./core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const STRICT = process.argv.includes("--strict");
const JSON_OUT = process.argv.includes("--json");

/**
 * ONE name for the Supabase URL — no second candidate, no fallback chain.
 * See common-docs/policies/package-vs-implementation.md.
 */
function loadEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "";
  if (!url || !key) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (
          !key &&
          (m[1] === "SUPABASE_SECRET_KEY" ||
            m[1] === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        )
          key = v;
      }
      if (url && key) break;
    }
  }
  return url && key ? { url, key } : null;
}

async function pullSnapshot(url: string, key: string): Promise<RunwaySnapshot | null> {
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc/partition_runway_snapshot`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Profile": "public",
        "Accept-Profile": "public",
      },
      body: "{}",
    });
    if (!res.ok) {
      console.error(
        `${C.yellow}[WARN]${C.reset} RPC partition_runway_snapshot failed (${res.status}). ${C.dim}${(await res.text()).slice(0, 200)}${C.reset}`,
      );
      return null;
    }
    return (await res.json()) as RunwaySnapshot;
  } catch (err) {
    console.error(`${C.yellow}[WARN]${C.reset} could not reach Supabase: ${String(err)}`);
    return null;
  }
}

function printReport(snapshot: RunwaySnapshot, findings: Finding[]): void {
  const errors = findings.filter((f) => f.severity === "error");
  const warns = findings.filter((f) => f.severity === "warn");

  console.log("");
  console.log(`${C.bold}  Partition runway + time-bounded DDL${C.reset}`);
  console.log(
    `  ${C.dim}live snapshot ${snapshot.generated_at} · ${snapshot.partitioned.length} RANGE-partitioned table(s) · ${snapshot.cron_jobs.length} cron job(s)${C.reset}`,
  );
  console.log("");

  for (const t of snapshot.partitioned) {
    const name = `${t.schema}.${t.table}`;
    const hit = findings.some((f) => f.subject === name);
    const { days: threshold } = thresholdFor(t);
    const runway = t.unbounded_top
      ? "unbounded"
      : t.runway_days === null
        ? "unknown"
        : `${t.runway_days}d`;
    const mark = hit ? `${C.red}✗${C.reset}` : `${C.green}✓${C.reset}`;
    console.log(
      `  ${mark} ${name.padEnd(26)} runway ${String(runway).padStart(9)}  ` +
        `${C.dim}min ${threshold}d · ${t.partition_count} partitions · ends ${t.max_upper_bound ?? "—"}${C.reset}`,
    );
  }
  console.log("");

  if (findings.length === 0) {
    console.log(`${C.green}${C.bold}  No partition or scheduled-DDL expiry risk.${C.reset}`);
    console.log("");
    return;
  }

  for (const f of [...errors, ...warns]) {
    const tag =
      f.severity === "error" ? `${C.red}[FAIL]${C.reset}` : `${C.yellow}[WARN]${C.reset}`;
    console.log(`  ${tag} ${C.bold}${f.subject}${C.reset} ${C.dim}(${f.kind})${C.reset}`);
    console.log(`         ${f.message}`);
    console.log(`         ${C.cyan}Fix:${C.reset} ${f.fix}`);
    console.log("");
  }

  console.log(
    `${C.bold}  ${errors.length} error(s), ${warns.length} warning(s).${C.reset}`,
  );
  console.log("");
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env) {
    console.error(
      `${C.yellow}[WARN]${C.reset} no Supabase credentials found — partition runway NOT checked.`,
    );
    process.exit(STRICT ? 2 : 0);
  }

  const snapshot = await pullSnapshot(env.url, env.key);
  if (!snapshot) {
    console.error(
      `${C.yellow}[WARN]${C.reset} could not read partition_runway_snapshot() — partition runway NOT checked. ` +
        `This check has no offline mode on purpose: only the live DB knows how much runway is left.`,
    );
    process.exit(STRICT ? 2 : 0);
  }

  const findings = classify(snapshot);

  if (JSON_OUT) {
    console.log(JSON.stringify({ snapshot, findings }, null, 2));
  } else {
    printReport(snapshot, findings);
  }

  const hasError = findings.some((f) => f.severity === "error");
  process.exit(STRICT && hasError ? 1 : 0);
}

void main();
