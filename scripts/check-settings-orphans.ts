#!/usr/bin/env tsx
/**
 * check:settings-orphans — a `platform.feature_knob` row that NO code anywhere
 * reads.
 *
 * 🚨 THE DEFECT CLASS (Unified Settings Platform, LANE C). A knob with no
 * consumer is not untidy — it is a screen that lies. The census found this in
 * production, repeatedly:
 *
 *   · `userPreferences.photoEditing.*` — a fully built, DB-synced settings tab.
 *     The photo editor never reads it. Zero consumers.
 *   · `userPreferences.imageGeneration.*` — same.
 *   · `max_share_links_per_resource` / `max_versions_per_file` — configured per
 *     account tier; nothing in the codebase checks them.
 *   · the org auto-RAG daily budget — displayed, editable, and not enforced.
 *
 * Every one of those would fail this guard. A person turns the knob, the app
 * says "saved", and the system does exactly what it did before. That is the
 * single failure this whole campaign exists to make impossible, and a guard is
 * the only thing that keeps it impossible after the people who built the screen
 * have moved on.
 *
 * HOW A ROW COUNTS AS READ — two tiers, both honest:
 *   DIRECT    a resolvable call through a knob helper naming this exact
 *             (feature, key): `knobInt("scheduler", "…")`,
 *             `await knob_bool(PUBLISH_FEATURE, "sync_enabled")`.
 *   FORWARDED the key string appears as a quoted literal in scanned source
 *             while its feature is also referenced there — the shape used by
 *             the per-feature wrappers (`services/hr/time/knobs.py` takes a
 *             `key` parameter and its callers pass the literal). Counting this
 *             as read is deliberate: the alternative is ~200 false orphans,
 *             and a guard that cries wolf is a guard nobody runs.
 *   IN-DB     a database function or view quotes the key while naming its
 *             feature or calling a knob helper (`hr._clock_knob('grace_minutes')`
 *             from inside the punch write path). Read live from pg_proc /
 *             pg_views through execute_admin_query — ~50 hr.* keys are
 *             consumed only this way.
 *   ORPHAN    none of the above. Nothing in matrx-frontend, aidream, the
 *             packages, or the database mentions the key.
 *
 * 🚨 CREDENTIAL GATED — copied from `check:kind-types`
 * (`scripts/shape/generate-kind-types.ts`), which refuses to run without the
 * live registry. No DB and no aidream checkout are BOTH exit 2 UNMEASURED with
 * a loud banner. A guard whose source of truth is a live database and which
 * prints green when it could not reach that database is worse than no guard:
 * it manufactures confidence out of a network error.
 *
 *   pnpm check:settings-orphans
 *   pnpm check:settings-orphans --json
 *   pnpm check:settings-orphans --self-test   # prove it can still fail
 *
 * Exit: 0 clean · 1 orphan(s) · 2 UNMEASURED.
 */
import process from "node:process";
import {
  AIDREAM_SCAN_DIRS,
  C,
  addr,
  collectAidream,
  collectFrontend,
  dbReaders,
  loadRegistry,
  scanKnobReads,
  unmeasured,
  type KnobRow,
  type SourceFile,
} from "./settings-guards/lib";

const GUARD = "check:settings-orphans";

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const selfTest = process.argv.includes("--self-test");

  const rows = await loadRegistry(GUARD);

  const fe = collectFrontend();
  const ai = collectAidream(AIDREAM_SCAN_DIRS);
  if (!ai) {
    unmeasured(
      GUARD,
      "No aidream checkout — most knob CONSUMERS live there, so every server-side knob would be reported an orphan.",
      "clone aidream beside this repo or set AIDREAM_DIR",
    );
  }
  const files: SourceFile[] = [...fe, ...ai];

  // Tier 1 — resolvable (feature, key) call sites, through the ONE reader list.
  const { sites, consts } = scanKnobReads(files);
  const direct = new Set(sites.map((s) => addr(s.feature, s.key)));

  // Tier 2 — every quoted literal, and every feature name mentioned, in source.
  const literals = new Set<string>();
  for (const f of files) {
    for (const m of f.text.matchAll(/["']([A-Za-z][\w.\-]{2,80})["']/g)) literals.add(m[1]);
  }
  const featuresMentioned = new Set<string>(literals);
  for (const v of consts.values()) featuresMentioned.add(v);
  for (const s of sites) featuresMentioned.add(s.feature);

  // Tier 3 — read from inside the database (function bodies, views).
  const inDb = await dbReaders(rows);
  if (!inDb) {
    unmeasured(
      GUARD,
      "Could not read pg_proc — ~50 hr.* knobs are consumed ONLY by database functions, and without the catalog they would all be reported orphans.",
      "set SUPABASE_SECRET_KEY (execute_admin_query) in .env.local / .env",
    );
  }

  const orphans: KnobRow[] = [];
  const forwarded: KnobRow[] = [];
  const dbRead: KnobRow[] = [];
  for (const r of rows) {
    const a = addr(r.feature, r.key);
    if (direct.has(a)) continue;
    if (
      (literals.has(r.key) && featuresMentioned.has(r.feature)) ||
      literals.has(`${r.feature}.${r.key}`)
    ) {
      forwarded.push(r);
      continue;
    }
    if (inDb.has(a)) {
      dbRead.push(r);
      continue;
    }
    orphans.push(r);
  }

  if (selfTest) {
    orphans.push({
      feature: "self_test",
      key: "a_knob_no_code_reads",
      value_type: "int",
      overridable_by: null,
      ui: null,
      label: "SELF-TEST — not a real registry row",
      taxonomy_node_id: null,
    });
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          rows: rows.length,
          direct: direct.size,
          forwarded: forwarded.length,
          db_read: dbRead.map((r) => ({ feature: r.feature, key: r.key, readers: inDb.get(addr(r.feature, r.key)) })),
          orphans,
        },
        null,
        2,
      ),
    );
    process.exit(orphans.length > 0 ? 1 : 0);
  }

  console.log(`\n${C.bold}${C.white}ORPHANED SETTINGS${C.reset} ${C.dim}(${GUARD})${C.reset}`);
  console.log(
    `${C.dim}${rows.length} live platform.feature_knob rows · ${direct.size} read directly · ${forwarded.length} forwarded through a wrapper · ${dbRead.length} read inside the database · scanned ${files.length} source files across matrx-frontend + aidream${C.reset}\n`,
  );

  if (orphans.length === 0) {
    console.log(`${C.green}✓ Every registered setting has a consumer.${C.reset}\n`);
    process.exit(0);
  }

  console.log(
    `${C.red}${C.bold}[LOUD] ${orphans.length} registered setting(s) that NO code reads${C.reset}`,
  );
  console.log(
    `${C.dim}A person can turn each of these and the system will do exactly what it did before.${C.reset}\n`,
  );
  const byFeature = new Map<string, KnobRow[]>();
  for (const o of orphans) {
    const list = byFeature.get(o.feature) ?? [];
    list.push(o);
    byFeature.set(o.feature, list);
  }
  for (const [feature, list] of [...byFeature].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${C.bold}${C.cyan}${feature}${C.reset} ${C.dim}(${list.length})${C.reset}`);
    for (const o of list) console.log(`    ${C.dim}${o.key}${C.reset}`);
  }
  console.log(
    `\n  ${C.yellow}Fix (one of two, never a third):${C.reset} wire a real consumer that reads the knob`,
  );
  console.log(
    `  ${C.dim}through the resolution API — or DELETE the row. A registry row with no reader is${C.reset}`,
  );
  console.log(
    `  ${C.dim}a control that lies, and leaving it "for later" is how the photo-editing tab happened.${C.reset}\n`,
  );
  process.exit(1);
}

main();
