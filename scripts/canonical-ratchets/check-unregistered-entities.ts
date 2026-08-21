#!/usr/bin/env tsx
/**
 * RATCHET 1 — unregistered entity-like tables. BLOCKING.
 *
 * A live table that carries the base-entity shape (`id uuid`, `created_at`, …)
 * and is NOT in `platform.entity_types` is an entity the platform cannot see:
 * no canonical gate scores it, no RLS generator owns its policies, no ORM model
 * is generated from it. `audit.unregistered_candidates.base_col_score >= 4` is
 * the platform's own definition of "looks like a real entity"
 * (db-rules FEATURE.md §11).
 *
 * The 2026-08-15 architecture drift audit's finding 2 was that this population
 * is a ratified BACKLOG — but with no record of which members are deliberate.
 * Hence the two files next to this script:
 *
 *   unregistered-entities-allowlist.json  reviewed, DELIBERATELY unregistered.
 *                                         A reason is REQUIRED per entry. This
 *                                         file IS the "reviewed, deliberate"
 *                                         record the audit found missing.
 *   unregistered-entities-baseline.json   the grandfathered COUNT of everything
 *                                         else. Seeded from live on 2026-08-21.
 *
 * The contract (the `package_boundaries_baseline.json` pattern):
 *   live count (score >= 4, minus allowlist) > baseline  →  FAIL. A NEW
 *      entity-like table was born unregistered. Register it
 *      (`platform.create_entity_table`), or allowlist it WITH A REASON.
 *   live count < baseline  →  pass, and the script tells you to shrink the
 *      baseline. The number may only go DOWN.
 *
 * Deliberately a COUNT, not a set-diff: the audit's point is that the population
 * must not GROW. Which specific tables are in it is a work list, not a gate
 * (database-changeover-doctrine §1: a count is never itself a work list) — the
 * report prints the full membership anyway so the work list is never hidden.
 *
 *   pnpm check:unregistered-entities            # loud, exit 0 (advisory)
 *   pnpm check:unregistered-entities --strict   # exit 1 over baseline (release gate)
 *   pnpm check:unregistered-entities --update-baseline
 *   pnpm check:unregistered-entities --refresh  # audit.refresh() first (4.5-5.5s)
 *   pnpm check:unregistered-entities --json
 *
 * Exit codes: 0 pass / advisory / creds absent · 1 over baseline in --strict · 2 unreadable.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { C, pullSnapshot, printPreamble } from "./snapshot";
import type { RatchetSnapshot, UnregisteredCandidate } from "./snapshot";

const HERE = resolve(import.meta.dirname);
const ALLOWLIST_PATH = resolve(HERE, "unregistered-entities-allowlist.json");
const BASELINE_PATH = resolve(HERE, "unregistered-entities-baseline.json");

const STRICT = process.argv.includes("--strict");
const JSON_OUT = process.argv.includes("--json");
const REFRESH = process.argv.includes("--refresh");
const UPDATE = process.argv.includes("--update-baseline");

interface AllowEntry {
  schema: string;
  table: string;
  reason: string;
}
interface Baseline {
  _comment: string;
  count: number;
  seeded_at: string;
}

const key = (t: { schema: string; table: string }) => `${t.schema}.${t.table}`;

function readAllowlist(): AllowEntry[] {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as AllowEntry[];
  const bad = raw.filter((e) => !e.schema || !e.table || !e.reason || e.reason.trim().length < 12);
  if (bad.length) {
    console.error(
      `${C.red}[FAIL]${C.reset} allowlist entries without a real reason: ${bad.map(key).join(", ")}`,
    );
    console.error(
      `  ${C.dim}A reason is the whole point of this file — it is the "reviewed, deliberately unregistered" record.${C.reset}`,
    );
    process.exit(2);
  }
  return raw;
}

function report(snapshot: RatchetSnapshot, tracked: UnregisteredCandidate[], allow: AllowEntry[], baseline: Baseline) {
  console.log("");
  console.log(`${C.bold}  Unregistered entity-like tables (ratchet)${C.reset}`);
  console.log(
    `  ${C.dim}live snapshot ${snapshot.generated_at} · score >= ${snapshot.min_base_col_score} · ` +
      `${snapshot.unregistered.length} candidate(s) · ${allow.length} allowlisted${C.reset}`,
  );
  const blocking = printPreamble(snapshot, STRICT);
  console.log("");

  const over = tracked.length - baseline.count;
  const allowSet = new Set(allow.map(key));
  for (const t of snapshot.unregistered) {
    const isAllowed = allowSet.has(key(t));
    const mark = isAllowed ? `${C.dim}·${C.reset}` : `${C.yellow}!${C.reset}`;
    const note = isAllowed ? `${C.dim}allowlisted${C.reset}` : `${C.dim}score ${t.score}${C.reset}`;
    console.log(`  ${mark} ${key(t).padEnd(46)} ${note}`);
  }
  console.log("");
  console.log(
    `  ${C.bold}${tracked.length}${C.reset} tracked (candidates minus allowlist)  ·  baseline ${C.bold}${baseline.count}${C.reset}`,
  );

  if (over > 0) {
    console.log("");
    console.log(
      `${STRICT ? C.red : C.yellow}${C.bold}  CANONICAL RATCHET EXCEEDED — ${over} NEW unregistered entity-like table(s) since the baseline.${C.reset}`,
    );
    console.log(
      `  ${C.cyan}fix: register it — platform.create_entity_table(...) — or, if it is deliberately unregistered,${C.reset}`,
    );
    console.log(`  ${C.cyan}      add it to ${ALLOWLIST_PATH.replace(/.*\/scripts\//, "scripts/")} WITH A REASON.${C.reset}`);
    console.log(`  ${C.dim}      The baseline may only be RAISED by Arman; agents shrink it, never grow it.${C.reset}`);
  } else if (over < 0) {
    console.log("");
    console.log(`${C.green}${C.bold}  ${-over} fewer than baseline — shrink the ratchet:${C.reset}`);
    console.log(`  ${C.cyan}pnpm check:unregistered-entities --update-baseline${C.reset}`);
  } else {
    console.log("");
    console.log(`${C.green}${C.bold}  At baseline. No new unregistered entity-like tables.${C.reset}`);
  }
  console.log("");
  return blocking;
}

async function main(): Promise<number> {
  const snapshot = await pullSnapshot({ refresh: REFRESH });
  if (!snapshot) return 0;

  const allow = readAllowlist();
  const allowSet = new Set(allow.map(key));
  const tracked = snapshot.unregistered.filter((t) => !allowSet.has(key(t)));
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;

  if (UPDATE) {
    const next: Baseline = { ...baseline, count: tracked.length, seeded_at: snapshot.generated_at };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`${C.green}baseline updated: ${baseline.count} → ${tracked.length}${C.reset}`);
    return 0;
  }

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        { baseline: baseline.count, tracked: tracked.length, allowlisted: allow.length, snapshot },
        null,
        2,
      ),
    );
    return STRICT && tracked.length > baseline.count ? 1 : 0;
  }

  const preambleBlocking = report(snapshot, tracked, allow, baseline);
  if (!STRICT) return 0;
  return tracked.length > baseline.count || preambleBlocking ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}[ERROR]${C.reset} ${String(err)}`);
    process.exit(2);
  },
);
