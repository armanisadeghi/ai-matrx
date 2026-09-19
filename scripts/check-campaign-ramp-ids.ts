#!/usr/bin/env npx tsx
/**
 * `pnpm check:campaign-ramp-ids` — the ramp's consumer list is ONE list.
 *
 * WHAT GOES WRONG WITHOUT IT. The register that says what a consumer IS lives in
 * the database (`campaign_watch.ramp_consumer`), because the admin screen and
 * the Test 1 gate both read it and must not be able to disagree. But TypeScript
 * and Python each need to NAME a consumer, so each carries the ids:
 *
 *   · matrx-frontend  lib/knobs/unifiedDataCampaignRamp.register.ts  RAMP_CONSUMER_IDS
 *   · aidream         aidream/services/unified_data_campaign/ramp.py RAMP_CONSUMER_IDS
 *   · the migration   migrations/campaign/w7_off_the_ramp_knobs.sql  one knob row each
 *
 * Four lists. A consumer added to one and not the others is a consumer whose
 * switch resolves against a knob that does not exist — `platform.knob_resolve`
 * raises `P0001` on an unseeded knob — or a consumer the screen offers and the
 * gate has never heard of. Both fail at the moment somebody flips a switch on a
 * real organization, which is the worst possible moment.
 *
 * WHAT IT CHECKS, in both directions every time:
 *   1. the TypeScript ids and the Python ids are the same set;
 *   2. every id has a `consumer_<id>_enabled` knob seeded in the migration;
 *   3. the migration seeds no knob for an id nobody names.
 *
 * It reads FILES, not a database, so it runs in a bare checkout with no
 * credential — the same reason the two registers are import-free. The database
 * half (does `campaign_watch.ramp_consumer` hold exactly these ids?) is asserted
 * by the gate itself: `campaign_watch.consumer_gate` raises by name on an id
 * that is not in the register, so a drifted id cannot pass silently there.
 *
 * `--self-test` proves the guard can fail, by running it over a doctored copy of
 * each input in turn.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const AIDREAM = resolve(ROOT, "..", "aidream");

const TS_REGISTER = join(ROOT, "lib/knobs/unifiedDataCampaignRamp.register.ts");
const PY_RAMP = join(AIDREAM, "aidream/services/unified_data_campaign/ramp.py");
const KNOB_MIGRATION = join(ROOT, "migrations/campaign/w7_off_the_ramp_knobs.sql");

function idsFromArrayLiteral(source: string, marker: string, label: string): string[] {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`${label}: could not find "${marker}".`);
  const open = source.indexOf(source.includes("(") && marker.endsWith("(") ? "(" : "[", at);
  const close = source.indexOf(open >= 0 && source[open] === "(" ? ")" : "]", open);
  if (open < 0 || close < 0) throw new Error(`${label}: could not read the list after "${marker}".`);
  return [...source.slice(open + 1, close).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

export function readIds(sources: { ts: string; py: string; sql: string }) {
  const tsIds = idsFromArrayLiteral(sources.ts, "RAMP_CONSUMER_IDS = [", "the TypeScript register");
  const pyIds = idsFromArrayLiteral(sources.py, "RAMP_CONSUMER_IDS: tuple[str, ...] = (", "the Python ramp");
  const knobIds = [...sources.sql.matchAll(/'consumer_([a-z_]+)_enabled'/g)].map((m) => m[1]);
  return { tsIds, pyIds, knobIds: [...new Set(knobIds)] };
}

export function verdict(ids: { tsIds: string[]; pyIds: string[]; knobIds: string[] }): string[] {
  const problems: string[] = [];
  const ts = new Set(ids.tsIds);
  const py = new Set(ids.pyIds);
  const knob = new Set(ids.knobIds);

  for (const id of ts) {
    if (!py.has(id)) problems.push(`"${id}" is a consumer in TypeScript but not in aidream's ramp.py.`);
    if (!knob.has(id))
      problems.push(
        `"${id}" is a consumer in TypeScript but no "consumer_${id}_enabled" knob is seeded — ` +
          `platform.knob_resolve raises P0001 on an unseeded knob, so its switch would throw.`,
      );
  }
  for (const id of py) {
    if (!ts.has(id)) problems.push(`"${id}" is a consumer in aidream's ramp.py but not in TypeScript.`);
  }
  for (const id of knob) {
    if (!ts.has(id))
      problems.push(`A knob "consumer_${id}_enabled" is seeded for a consumer no register names.`);
  }
  if (ids.tsIds.length !== ts.size) problems.push("The TypeScript id list repeats an id.");
  return problems;
}

function run(): number {
  const sources = {
    ts: readFileSync(TS_REGISTER, "utf8"),
    py: readFileSync(PY_RAMP, "utf8"),
    sql: readFileSync(KNOB_MIGRATION, "utf8"),
  };
  const ids = readIds(sources);
  const problems = verdict(ids);
  if (problems.length > 0) {
    console.error(`check:campaign-ramp-ids FAILED — the ramp's consumer list is not one list:`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error(
      `\n  REMEDY: the four places are ${TS_REGISTER}, ${PY_RAMP}, ${KNOB_MIGRATION} and ` +
        `campaign_watch.ramp_consumer (migrations/campaign/w7_off_the_switch_machinery.sql). ` +
        `Adding a consumer means all four, in one commit.`,
    );
    return 1;
  }
  console.log(
    `check:campaign-ramp-ids: ${ids.tsIds.length} consumer(s) — ${ids.tsIds.join(", ")} — ` +
      `named identically in TypeScript, in aidream and in the seeded knob rows.`,
  );
  return 0;
}

function selfTest(): number {
  const sources = {
    ts: readFileSync(TS_REGISTER, "utf8"),
    py: readFileSync(PY_RAMP, "utf8"),
    sql: readFileSync(KNOB_MIGRATION, "utf8"),
  };
  const cases: Array<[string, typeof sources]> = [
    ["a consumer added to TypeScript only", { ...sources, ts: sources.ts.replace('"grid",', '"grid",\n  "ghost",') }],
    ["a consumer added to Python only", { ...sources, py: sources.py.replace('"grid",', '"grid",\n    "ghost",') }],
    ["a consumer whose knob row was never seeded", { ...sources, sql: sources.sql.replace(/'consumer_grid_enabled'/g, "'consumer_gridX_enabled'") }],
  ];
  let failures = 0;
  for (const [name, doctored] of cases) {
    const problems = verdict(readIds(doctored));
    if (problems.length === 0) {
      console.error(`  RED CASE DID NOT FAIL: ${name}`);
      failures += 1;
    } else {
      console.log(`  [RED as expected] ${name} → ${problems[0]}`);
    }
  }
  if (verdict(readIds(sources)).length !== 0) {
    console.error("  GREEN CASE FAILED: the real files do not agree.");
    failures += 1;
  } else {
    console.log("  [GREEN as expected] the real files agree.");
  }
  return failures === 0 ? 0 : 1;
}

process.exitCode = process.argv.includes("--self-test") ? selfTest() : run();
