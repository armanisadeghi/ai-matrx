#!/usr/bin/env tsx
/**
 * generate-knob-database-consumers — the census of knobs that are read from
 * INSIDE the database (a function body or a view), written to
 * `features/settings/universal/knobDatabaseConsumers.generated.ts`.
 *
 * 🚨 WHY THIS EXISTS (DD-183). `features/settings/universal/disposition.ts`
 * decides whether a settings row says "This preference is not available yet"
 * / "Not connected yet". Its entries were written from a SOURCE census — a
 * grep over matrx-frontend and aidream — and a source grep cannot see inside
 * `pg_proc`. A knob resolved by a trigger or an RPC body (the record store's
 * confirmation keys are resolved by `platform._stamp_actor_tier` and
 * `content_ir.edit_kind_instance_value`; ~50 `hr.*` keys are consumed ONLY
 * this way) is a fully connected setting that the hand audit would happily
 * call dead. A screen that tells a person their working setting does nothing
 * is the same lie as a screen that accepts a value nothing honours — law 4,
 * from the other side.
 *
 * The truth is already measured: `check:settings-orphans` has an IN-DB tier
 * that reads `pg_proc`/`pg_views` live. This script runs that guard's own
 * `--json` and writes its `db_read` list into a generated module the UI can
 * import. It never decides anything itself.
 *
 *   pnpm generate:knob-database-consumers          # rewrite the file
 *   pnpm check:knob-database-consumers             # FAIL if the file is stale
 *   pnpm check:knob-database-consumers:self-test   # prove the check can FAIL
 *
 * 🚨 THE STALENESS ARM (V-57). A generated census with nothing checking it is a
 * photograph: the committed file was true of `pg_proc` at the minute it was
 * written, and it drifts silently the first time a function stops reading a key
 * — at which point `disposition.ts` keeps a settings row editable on the word
 * of a photograph. `--check` re-measures live and fails when the committed file
 * differs, naming every key that gained or lost a reader.
 *
 * CREDENTIAL GATED through the guard it calls: no live registry, no census,
 * and this script refuses to write (or to pass) rather than emit or bless an
 * empty — and therefore wrong — file. Exit: 0 clean · 1 stale · 2 UNMEASURED.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { ROOT } from "./settings-guards/lib";

const OUT = join(ROOT, "features", "settings", "universal", "knobDatabaseConsumers.generated.ts");

type OrphanReport = {
  db_read?: { feature: string; key: string; readers?: string[] }[];
};

function render(entries: { key: string; readers: string[] }[]): string {
  const body = entries
    .map((entry) => `  ${JSON.stringify(entry.key)}: [${entry.readers.map((r) => JSON.stringify(r)).join(", ")}],`)
    .join("\n");
  return `// GENERATED — do not edit by hand.
//
// Every \`platform.feature_knob\` key that is read from INSIDE the database (a
// function body or a view), with the function(s) that read it. Regenerate with
// \`pnpm generate:knob-database-consumers\`; the census itself is measured live
// from \`pg_proc\`/\`pg_views\` by \`check:settings-orphans\`'s IN-DB tier, and
// \`pnpm check:knob-database-consumers\` FAILS when this file no longer matches
// the live database.
//
// WHY the settings UI needs it: a knob resolved by a trigger has no call site
// any source grep can find, so the hand-kept audit in \`disposition.ts\` would
// call a working setting "Not connected yet" (DD-183).

export const KNOB_DATABASE_CONSUMERS: Readonly<Record<string, readonly string[]>> = {
${body}
};

/** The database function(s) that read this key, or \`null\` when none do. */
export function databaseConsumersOf(fullKey: string): readonly string[] | null {
  const readers = KNOB_DATABASE_CONSUMERS[fullKey];
  return readers && readers.length > 0 ? readers : null;
}
`;
}

function main(): void {
  const check = process.argv.includes("--check");
  const selfTest = process.argv.includes("--self-test");
  // The guard exits 1 when it finds a NEW orphan, and its JSON is large, so it
  // is redirected to a file rather than captured through a pipe: an exit code
  // must not cost us the census, and a truncated buffer must not be mistaken
  // for one.
  const dir = mkdtempSync(join(tmpdir(), "knob-db-consumers-"));
  const censusFile = join(dir, "orphans.json");
  let raw = "";
  try {
    execSync(
      `npx tsx ${JSON.stringify(join(ROOT, "scripts", "check-settings-orphans.ts"))} --json > ${JSON.stringify(censusFile)}`,
      { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] },
    );
  } catch {
    // exit 1 = NEW orphan found; the census on disk is still complete.
  }
  try {
    raw = readFileSync(censusFile, "utf8");
  } catch {
    raw = "";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (raw.trim() === "") {
    console.error("check:settings-orphans produced no census — nothing was written.");
    process.exit(2);
  }
  const report = JSON.parse(raw) as OrphanReport;
  const rows = report.db_read ?? [];
  if (rows.length === 0) {
    console.error(
      "check:settings-orphans reported ZERO in-database readers. That has never been true " +
        "(~50 hr.* keys are consumed only this way), so the census was not measured — nothing was written.",
    );
    process.exit(2);
  }
  const entries = rows
    .map((row) => ({ key: `${row.feature}.${row.key}`, readers: [...(row.readers ?? [])].sort() }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const rendered = render(entries);

  if (check || selfTest) {
    let committed = "";
    try {
      committed = readFileSync(OUT, "utf8");
    } catch {
      console.error(`[LOUD] check:knob-database-consumers: ${OUT} does not exist.`);
      console.error("  Fix: pnpm generate:knob-database-consumers");
      process.exit(1);
    }
    if (selfTest) {
      // A guard that cannot be demonstrated failing is not a guard: compare the
      // live census against a DELIBERATELY wrong file, in memory, and assert it
      // is reported — then against the real one, and assert it is clean.
      const planted = rendered.replace(/^ {2}"[^"]+": \[[^\]]*\],\n/m, "");
      const plantedFindings = diff(committed === rendered ? planted : planted, rendered);
      if (plantedFindings.length === 0) {
        console.error("[LOUD] check:knob-database-consumers SELF-TEST FAILED: a census with a key removed was reported as fresh.");
        process.exit(1);
      }
      console.log(`Self-test: a planted census (one key dropped) is reported stale — ${plantedFindings[0]}`);
    }
    const findings = diff(committed, rendered);
    if (findings.length > 0) {
      console.error("\n[LOUD] check:knob-database-consumers: the committed census no longer matches the live database.");
      for (const finding of findings.slice(0, 20)) console.error(`  ${finding}`);
      if (findings.length > 20) console.error(`  …and ${findings.length - 20} more`);
      console.error("  Fix: pnpm generate:knob-database-consumers, then commit the file.");
      console.error("  Why it matters: features/settings/universal/disposition.ts decides whether a");
      console.error("  settings row says 'not available yet' from this file. Stale here = a lie there.");
      process.exit(1);
    }
    console.log(`check:knob-database-consumers: ${entries.length} in-database knob consumer(s) — the committed census matches the live database.`);
    process.exit(0);
  }

  writeFileSync(OUT, rendered, "utf8");
  console.log(`Wrote ${entries.length} in-database knob consumer(s) to ${OUT}`);
}

/** Key-level differences between a committed census file and a freshly rendered one. */
function diff(committed: string, fresh: string): string[] {
  const parse = (text: string) => {
    const out = new Map<string, string>();
    for (const match of text.matchAll(/^ {2}"([^"]+)": (\[[^\]]*\]),$/gm)) out.set(match[1], match[2]);
    return out;
  };
  const before = parse(committed);
  const after = parse(fresh);
  const findings: string[] = [];
  for (const [key, readers] of after) {
    if (!before.has(key)) findings.push(`GAINED a database reader, missing from the file: ${key} ${readers}`);
    else if (before.get(key) !== readers) findings.push(`READERS CHANGED: ${key} — file ${before.get(key)} · live ${readers}`);
  }
  for (const key of before.keys()) {
    if (!after.has(key)) findings.push(`NO LONGER read inside the database, still in the file: ${key}`);
  }
  return findings;
}

main();
