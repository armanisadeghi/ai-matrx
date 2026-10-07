#!/usr/bin/env npx tsx
/**
 * `npx tsx scripts/refresh-knob-snapshot.ts` — rewrite `lib/scoped-config/knob-keys.snapshot.json` from the LIVE
 * `platform.feature_knob` register. SELECT-ONLY: one connection, one query, one file written.
 *
 * WHY. Knob rows are created live through the Supabase MCP, never as migration files, so the
 * `.sql` scan in `every-knob-read-addresses-a-real-row.test.ts` cannot see them. This snapshot is
 * the truthful source for the rows that exist live; the test unions it with the `.sql` scan.
 *
 *   pnpm refresh:knob-snapshot            rewrite the snapshot
 *   pnpm refresh:knob-snapshot --check    exit 1 if the snapshot would change (no write)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { connectDirect, loadDbEnv, type DbEnv } from "./lib/direct-db";

const PATH = resolve(join(__dirname, "..", "lib", "scoped-config", "knob-keys.snapshot.json"));

async function main(): Promise<number> {
  const check = process.argv.includes("--check");
  const env = loadDbEnv();
  if (!("host" in env)) {
    console.error(`Cannot reach the live DB — missing ${(env as { missing: string[] }).missing.join(", ")}. Nothing written.`);
    return 2;
  }
  const client = await connectDirect(env as DbEnv, "refresh-knob-snapshot (read-only)");
  let pairs: [string, string][];
  try {
    const res = await client.query<{ feature: string; key: string }>(
      `select feature, key from platform.feature_knob where archived_at is null order by feature, key`,
    );
    pairs = res.rows.map((r) => [r.feature, r.key]);
  } finally {
    await client.end().catch(() => undefined);
  }
  let before = "";
  try {
    before = JSON.stringify(JSON.parse(readFileSync(PATH, "utf8")).knobs);
  } catch {
    /* first run */
  }
  const changed = before !== JSON.stringify(pairs);
  if (check) {
    console.log(changed ? `[FAIL] knob snapshot is stale (${pairs.length} live rows).` : `[OK] knob snapshot matches live (${pairs.length}).`);
    return changed ? 1 : 0;
  }
  writeFileSync(
    PATH,
    JSON.stringify({ generated_at: new Date().toISOString(), source: "platform.feature_knob (live)", knobs: pairs }, null, 0)
      .replace(/\],\[/g, "],\n[") + "\n",
  );
  console.log(`[OK] ${PATH} written — ${pairs.length} live knob rows${changed ? "" : " (no change)"}.`);
  return 0;
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error(`refresh:knob-snapshot failed — ${e?.message ?? e}`);
    process.exit(2);
  },
);
