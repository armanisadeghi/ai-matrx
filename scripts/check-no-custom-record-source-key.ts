#!/usr/bin/env npx tsx
/**
 * `pnpm check:no-custom-record-source-key` — NOTHING NEW WRITES A `custom_record:<table id>`
 * EVENT-SOURCE KEY (lane SOURCE-KEY, 2026-09-25).
 *
 * A record-store table's changes are `record:<table id>` events; `custom_record` is the retired
 * tier-2 table and nothing new names it. The store refuses (step 2) or rewrites (step 1) the old
 * key at its own door (`custom._record_source_key_is_record` on scheduler.sch_trigger and
 * files.webhooks), so a runtime write is caught there. This guard catches the SOURCE before it
 * ships: any line that BUILDS a key from the old prefix — a template `custom_record:${…}`, or a
 * string `'custom_record:'` followed by `||` or `+` — in this repo's served code and campaign
 * migrations, and in the @ai-matrx/records source beside it (../aidream/apps/shared/records/src).
 *
 * Allowed on purpose: the one reader of the old key (`recordSourceTable`, which only PARSES it),
 * the migrations already in the ledger (history is never edited), and the tests that prove an old
 * key is read and re-saved.
 *
 *   pnpm check:no-custom-record-source-key             exit 1 on any builder of the old key
 *   pnpm check:no-custom-record-source-key:self-test   proves the pattern goes red and green
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const RECORDS = resolve(ROOT, "../aidream/apps/shared/records");

/** A line that BUILDS an old key: `custom_record:${x}` or 'custom_record:' || x / "custom_record:" + x. */
export const BUILDS_OLD_KEY = /custom_record:\$\{|['"`]custom_record:['"`]\s*(\|\||\+)/;

/** History (ledgered migrations) and the lane's own reader/normalizer and old-key tests. */
const ALLOWED = new Set([
  "migrations/campaign/gridprim_every_row_change_reaches_the_webhook.sql",
  "migrations/campaign/gridprim_a_row_change_runs_the_agent_in_either_store.sql",
  "migrations/campaign/gridport_a_table_says_which_changes_can_start_an_agent.sql",
  "migrations/inverse/gridprim_a_row_change_runs_the_agent_in_either_store_down.sql",
  "migrations/campaign/sourcekey_a_record_store_tables_changes_are_record_events.sql",
  "migrations/inverse/sourcekey_a_record_store_tables_changes_are_record_events_down.sql",
  "migrations/campaign/sourcekey_the_old_key_is_refused.sql",
  "migrations/inverse/sourcekey_the_old_key_is_refused_down.sql",
  "scripts/campaign-tests/sourcekey_a_row_change_is_a_record_event_red_green.sql",
  "scripts/campaign-tests/sourcekey_the_old_key_is_refused_red_green.sql",
  "features/scheduling/utils/__tests__/record-source-key-is-record.test.ts",
  "features/scheduling/components/form/triggers/__tests__/a-schedule-on-a-moved-table-listens-for-the-stores-changes.test.tsx",
  "features/data-tables/__tests__/a-row-change-schedule-takes-the-stores-key-not-the-packages.test.ts",
  "scripts/check-no-custom-record-source-key.ts",
  "records:src/__tests__/grid.test.ts",
]);

const SCANNED = /\.(ts|tsx|js|mjs|cjs|sql|py)$/;

function tracked(cwd: string, paths: string[]): string[] {
  return execFileSync("git", ["ls-files", "--", ...paths], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((f) => f && SCANNED.test(f));
}

export function findBuilders(files: Array<{ name: string; text: string }>): string[] {
  const hits: string[] = [];
  for (const { name, text } of files) {
    if (ALLOWED.has(name)) continue;
    text.split("\n").forEach((line, i) => {
      if (BUILDS_OLD_KEY.test(line)) hits.push(`${name}:${i + 1}: ${line.trim()}`);
    });
  }
  return hits;
}

function selfTest(): void {
  const red = findBuilders([
    { name: "features/x/a.ts", text: "const k = `custom_record:${tableId}`;" },
    { name: "features/x/b.ts", text: "const k = 'custom_record:' + tableId;" },
    { name: "migrations/campaign/c.sql", text: "  'custom_record:' || n.table_id::text," },
  ]);
  const green = findBuilders([
    { name: "features/x/d.ts", text: "const k = `record:${tableId}`; // the older `custom_record:<table id>` is read only" },
    { name: "migrations/campaign/gridprim_every_row_change_reaches_the_webhook.sql", text: "'custom_record:' || x" },
  ]);
  if (red.length !== 3) throw new Error(`self-test: expected 3 red hits, got ${red.length}: ${red.join(" | ")}`);
  if (green.length !== 0) throw new Error(`self-test: expected 0 hits, got ${green.join(" | ")}`);
  console.log("[ OK ] self-test — three builders of the old key go red; a reader, a comment and a ledgered migration stay green.");
}

function main(): void {
  if (process.argv.includes("--self-test")) return selfTest();
  const files: Array<{ name: string; text: string }> = [];
  for (const f of tracked(ROOT, ["app", "features", "components", "lib", "utils", "hooks", "providers", "packages", "scripts", "migrations/campaign", "migrations/inverse"])) {
    files.push({ name: f, text: readFileSync(resolve(ROOT, f), "utf8") });
  }
  if (existsSync(RECORDS)) {
    for (const f of tracked(RECORDS, ["src"])) {
      files.push({ name: `records:${f}`, text: readFileSync(resolve(RECORDS, f), "utf8") });
    }
  } else {
    console.log(`[WARN] ${RECORDS} is not checked out beside this repo; the @ai-matrx/records source was NOT scanned.`);
  }
  const hits = findBuilders(files);
  if (hits.length) {
    console.error(`[FAIL] ${hits.length} line(s) build the retired custom_record:<table id> event-source key:`);
    for (const h of hits) console.error(`  ${h}`);
    console.error("  Remedy: build the key with recordSourceKey(tableId) (features/scheduling/utils/recordSourceKey.ts, or @ai-matrx/records), or custom.record_source_key(table_id) in SQL.");
    process.exit(1);
  }
  console.log(`[ OK ] ${files.length} files scanned; nothing builds a custom_record:<table id> key.`);
}

main();
