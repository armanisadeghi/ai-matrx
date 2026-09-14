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
 * 🚨 THE RUNG ARM (DD-211). The same file also records WHICH RUNGS each
 * in-database reader actually NAMES. `overridable_by` on a knob decides which
 * rungs the picker offers; `p_scopes` on the reader decides which rungs the
 * database can answer with — `organization` and `user` are `knob_resolve`'s own
 * parameters and are always reachable, every OTHER rung exists only if a reader
 * names it. When the two disagree the screen sells an exception that changes
 * nothing: `records.confirmation.agent_write_born_confirmed` offered an `agent`
 * rung, accepted the write (`{"ok":true,"origin":"agent_override"}`), listed it
 * back — and its only reader named a `table` rung and nothing else, so not one
 * row ever changed (V-64, 2026-09-13). `--check` FAILS on any such rung that is
 * not recorded as known debt in `scripts/settings-guards/knob-rung-debt.json`,
 * and fails just as loudly when a debt entry has been FIXED and left in the
 * file, so the list can only shrink.
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
import { knobResolveCalls, literalOf, RUNGS_WITHOUT_SCOPES, rungsNamedBy, scopesArgumentOf } from "./knob-resolve-callers/core";
import { CATALOG_SQL, DB_VARS, client as dbClient, loadDbEnv } from "./knob-resolve-callers/db";

const OUT = join(ROOT, "features", "settings", "universal", "knobDatabaseConsumers.generated.ts");
const DEBT = join(ROOT, "scripts", "settings-guards", "knob-rung-debt.json");

type OrphanReport = {
  db_read?: { feature: string; key: string; readers?: string[] }[];
};

function render(
  entries: { key: string; readers: string[] }[],
  rungs: { key: string; kinds: string[] }[],
): string {
  const body = entries
    .map((entry) => `  ${JSON.stringify(entry.key)}: [${entry.readers.map((r) => JSON.stringify(r)).join(", ")}],`)
    .join("\n");
  const rungBody = rungs
    .map((entry) => `  ${JSON.stringify(entry.key)}: [${entry.kinds.map((k) => JSON.stringify(k)).join(", ")}],`)
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

// ───────────────────────────────────────────────────────────────────────────
// DD-211 — WHICH RUNGS the database can actually answer a key with.
//
// \`overridable_by\` says which rungs the PICKER offers. This says which rungs a
// reader NAMES in \`p_scopes\` — the only way a rung other than \`organization\`
// or \`user\` can change an answer. A key offered at a rung nobody names is a
// control that saves a value nothing honours (law 4 from the other side), which
// is what \`records.confirmation.agent_write_born_confirmed\`'s \`agent\` rung was
// until DD-211.
//
// Only keys with a call site whose feature and key are WRITTEN OUT appear here:
// a body that resolves them from variables tells us nothing, and guessing would
// be worse than saying nothing.
// ───────────────────────────────────────────────────────────────────────────

export const KNOB_RUNG_CONSUMERS: Readonly<Record<string, readonly string[]>> = {
${rungBody}
};

/** The rungs in \`overridable_by\` this key's database readers CANNOT answer with. */
export function unreachableRungsFor(
  fullKey: string,
  overridableBy: readonly string[],
): readonly string[] {
  const named = KNOB_RUNG_CONSUMERS[fullKey];
  if (!named) return [];  // nothing readable to measure against — never guess
  return overridableBy.filter(
    (kind) => !RUNGS_ALWAYS_REACHABLE.includes(kind) && !named.includes(kind),
  );
}

/** \`organization\` and \`user\` are knob_resolve's own parameters: always reachable. */
export const RUNGS_ALWAYS_REACHABLE: readonly string[] = ["organization", "user"];
`;
}

/**
 * WHICH RUNGS each in-database reader names, measured from the live catalog,
 * plus every registry row's `overridable_by`.
 *
 * Returns `null` for "could not measure" — never an empty census, which would
 * read as "no reader names any rung" and fail every knob on the platform.
 */
const RUNG_PLANT_SQL = `
  create schema dd211_selftest;
  insert into platform.feature_knob (feature, key, value_type, value, default_value, overridable_by, label, description, set_by, basis)
  values ('dd211_selftest', 'a_rung_nobody_reads', 'boolean', to_jsonb(false), to_jsonb(false),
          array['organization','agent']::text[], 'SELF-TEST — not a real registry row',
          'Planted by check:knob-database-consumers --self-test inside a rolled-back transaction.',
          'agent', 'self-test');
  create function dd211_selftest.reader_that_names_only_the_table(p_org uuid, p_table uuid)
    returns jsonb language sql stable as $body$
      select platform.knob_resolve('dd211_selftest', 'a_rung_nobody_reads', p_org, null,
               jsonb_build_array(jsonb_build_object('kind', 'table', 'id', p_table)));
    $body$;`;

async function rungCensus(plant?: string): Promise<
  | {
      named: Map<string, Set<string>>;
      overridableBy: Map<string, string[]>;
      dynamic: string[];
      unreadable: number;
    }
  | null
> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `[LOUD] the rung census could not reach the database, so it measured NOTHING.\n` +
        `  It needs ${DB_VARS.join(", ")}. Looked in: ${env.looked.length ? env.looked.join(", ") : "the environment only"}.`,
    );
    return null;
  }
  const client = dbClient(env, "check:knob-database-consumers");
  await client.connect();
  try {
    if (plant) {
      // The self-test plants inside a transaction it ALWAYS rolls back, so the
      // live catalog and registry are never touched.
      await client.query("begin");
      await client.query(plant);
    }
    const named = new Map<string, Set<string>>();
    const dynamic: string[] = [];
    let unreadable = 0;
    const bodies = (await client.query(CATALOG_SQL)).rows as { fn: string; body: string }[];
    for (const row of bodies) {
      for (const call of knobResolveCalls(row.body)) {
        const feature = literalOf(call.args[0] ?? "");
        const key = literalOf(call.args[1] ?? "");
        if (!feature || !key) {
          // A dispatcher (`hr._knob(p_feature, p_key, …)`) — which key it is
          // resolving is not in the text, so which rungs it reaches for that key
          // is unknowable. Counted and reported, never treated as either answer.
          unreadable += 1;
          continue;
        }
        const scopes = rungsNamedBy(scopesArgumentOf(call.args));
        const address = `${feature}.${key}`;
        if (scopes.dynamic) dynamic.push(`${row.fn} — ${address}`);
        const set = named.get(address) ?? new Set<string>();
        for (const kind of scopes.kinds) set.add(kind);
        named.set(address, set);
      }
    }
    const registry = (await client.query(
      `select feature, key, coalesce(overridable_by, '{}')::text[] as overridable_by from platform.feature_knob`,
    )).rows as { feature: string; key: string; overridable_by: string[] }[];
    if (registry.length === 0) {
      console.error("[LOUD] platform.feature_knob came back EMPTY. That has never been true, so nothing was measured.");
      return null;
    }
    const overridableBy = new Map<string, string[]>();
    for (const row of registry) overridableBy.set(`${row.feature}.${row.key}`, row.overridable_by ?? []);
    return { named, overridableBy, dynamic, unreadable };
  } finally {
    if (plant) await client.query("rollback");
    await client.end();
  }
}

/** Every rung a knob OFFERS that no readable database reader can answer with. */
function rungFindings(census: NonNullable<Awaited<ReturnType<typeof rungCensus>>>): string[] {
  const out: string[] = [];
  for (const [address, kinds] of [...census.named].sort((a, b) => a[0].localeCompare(b[0]))) {
    const offered = census.overridableBy.get(address);
    if (!offered) continue;  // a call site naming a key the registry does not hold
    for (const rung of offered) {
      if (RUNGS_WITHOUT_SCOPES.includes(rung)) continue;
      if (!kinds.has(rung)) out.push(`${address} | ${rung}`);
    }
  }
  return out.sort();
}

function loadDebt(): { known: Set<string>; why: Record<string, string> } {
  try {
    const raw = JSON.parse(readFileSync(DEBT, "utf8")) as { debt?: Record<string, string> };
    const why = raw.debt ?? {};
    return { known: new Set(Object.keys(why)), why };
  } catch {
    return { known: new Set(), why: {} };
  }
}

async function main(): Promise<void> {
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

  // DD-211 — the rung half. Measured or nothing: an unmeasured rung census would
  // make every rung look unreachable and fail the whole platform, so it exits
  // UNMEASURED (2) rather than pass or write.
  const census = await rungCensus();
  if (!census) {
    console.error("  Fix: give this guard the database credentials; unmeasured is never a pass.");
    process.exit(2);
  }
  const rungEntries = [...census.named]
    .map(([key, kinds]) => ({ key, kinds: [...kinds].sort() }))
    .filter((entry) => entry.kinds.length > 0)
    .sort((a, b) => a.key.localeCompare(b.key));
  const rendered = render(entries, rungEntries);

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

      // The rung arm's own RED, against the REAL database, rolled back: a knob
      // that offers an `agent` rung beside a reader that names only a `table`
      // one — the exact shape `records.confirmation.agent_write_born_confirmed`
      // had until DD-211 — must be reported by name.
      const plantedCensus = await rungCensus(RUNG_PLANT_SQL);
      if (!plantedCensus) {
        console.error("[LOUD] rung SELF-TEST could not measure; unmeasured is never a pass.");
        process.exit(2);
      }
      const wanted = "dd211_selftest.a_rung_nobody_reads | agent";
      if (!rungFindings(plantedCensus).includes(wanted)) {
        console.error(
          "[LOUD] rung SELF-TEST FAILED: a planted knob offering an `agent` rung, read by a function that " +
            "names only a `table` rung, was NOT reported. The rung arm cannot say no.",
        );
        process.exit(1);
      }
      console.log(`Self-test: the planted unreachable rung is reported by name — ${wanted}; transaction rolled back.`);
      const leftover = await rungCensus();
      if (leftover?.overridableBy.has("dd211_selftest.a_rung_nobody_reads")) {
        console.error("[LOUD] rung SELF-TEST left its planted registry row behind.");
        process.exit(1);
      }
    }
    // ── the rung arm ─────────────────────────────────────────────────────
    const { known, why } = loadDebt();
    const live = rungFindings(census);
    const liveSet = new Set(live);
    const fresh = live.filter((entry) => !known.has(entry));
    const fixed = [...known].filter((entry) => !liveSet.has(entry)).sort();

    if (census.unreadable > 0 || census.dynamic.length > 0) {
      // Law 4: named, never dropped. Neither a pass nor a failure.
      console.log(
        `[NOTE] rung census: ${census.unreadable} call site(s) resolve their feature/key from variables ` +
          `and ${census.dynamic.length} build the rung kind from one — which rungs those reach is not in the text.`,
      );
      for (const entry of census.dynamic.slice(0, 5)) console.log(`    ${entry}`);
    }
    if (fresh.length > 0) {
      console.error("\n[LOUD] check:knob-database-consumers: a setting offers a rung NO database reader can answer with.");
      console.error("  The picker shows the exception, the door saves it, and not one row changes (DD-211).");
      for (const entry of fresh) {
        const [address, rung] = entry.split(" | ");
        console.error(`  ${address} — offers the '${rung}' rung; its readers name [${[...(census.named.get(address) ?? [])].join(", ") || "no rung at all"}]`);
      }
      console.error("  Fix, in order of preference: teach the reader to name that rung (as DD-211 did for `agent`),");
      console.error("  or take the rung out of that knob's `overridable_by` until a reader does.");
      console.error(`  If it is known, accepted debt, add it to ${DEBT} with the sentence that says why.`);
      process.exit(1);
    }
    if (fixed.length > 0) {
      console.error("\n[LOUD] check:knob-database-consumers: the recorded rung debt is STALE — these are FIXED.");
      console.error("  A debt list that keeps entries it no longer owes stops being a ratchet.");
      for (const entry of fixed) console.error(`  ${entry} — now reachable; remove it from ${DEBT}`);
      process.exit(1);
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
    console.log(
      `check:knob-database-consumers: ${entries.length} in-database knob consumer(s) — the committed census matches the live database.\n` +
        `  Rungs: ${rungEntries.length} key(s) name a row-keyed rung; every rung offered by a measurable key is answerable ` +
        `(${known.size} recorded as known debt).`,
    );
    process.exit(0);
  }

  writeFileSync(OUT, rendered, "utf8");
  console.log(
    `Wrote ${entries.length} in-database knob consumer(s) and ${rungEntries.length} rung census row(s) to ${OUT}`,
  );
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

main().catch((err) => {
  console.error(`[LOUD] check:knob-database-consumers errored, so it measured NOTHING:\n  ${String(err?.message ?? err)}`);
  process.exit(2);
});
