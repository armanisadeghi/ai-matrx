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
 *             packages, matrx-sandbox, or the database mentions the key.
 *
 * 🚨 THE RATCHET (2026-09-13). The registry is seeded SPEC-FIRST by design:
 * the HR program (`hr.*`, `esign.*`) writes its rows before the screens that
 * honour them exist, and the unfinished-work alarm forbids deleting them. So
 * this guard carries the same shrinking baseline the hardcoded and env-toggle
 * guards do — `scripts/settings-orphans-baseline.json`, today's true orphans by
 * namespace WITH the registry domain that owns them. It only shrinks: `--write`
 * removes entries that gained a consumer or left the registry and can never
 * add one; a NEW orphan (a row in no namespace listed, or a new key in a listed
 * namespace) fails LOUD. A baselined orphan is still printed every run — as
 * KNOWN DEBT with an owner, never as a pass.
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
 *   pnpm check:settings-orphans --write       # SHRINK the baseline to reality
 *   pnpm check:settings-orphans --self-test   # prove it can still fail
 *
 * Exit: 0 no NEW orphan · 1 NEW orphan(s) · 2 UNMEASURED.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import {
  AIDREAM_SCAN_DIRS,
  C,
  ROOT,
  addr,
  adminQuery,
  collectAidream,
  collectFrontend,
  collectSandbox,
  dbReaders,
  loadRegistry,
  scanKnobReads,
  unmeasured,
  type KnobRow,
  type SourceFile,
} from "./settings-guards/lib";

const GUARD = "check:settings-orphans";
const BASELINE_FILE = join(ROOT, "scripts", "settings-orphans-baseline.json");

interface BaselineNamespace {
  /** The registry domain/feature node that owns the namespace (from the live taxonomy). */
  owner: string;
  /** Who is expected to wire the consumers — the program the rows were seeded for. */
  program: string;
  keys: string[];
}
interface Baseline {
  _law: string;
  _why: string;
  _how: string;
  _baselined: string;
  namespaces: Record<string, BaselineNamespace>;
}

/** `domain/feature` for each feature, from the live taxonomy; `(unfiled)` when null. */
async function ownerByFeature(): Promise<Map<string, string>> {
  const res = await adminQuery<{ feature: string; owner: string }>(`
    select k.feature, coalesce(d.slug || '/' || f.slug, '(unfiled)') as owner
      from (select distinct feature, taxonomy_node_id from platform.feature_knob) k
      left join platform.taxonomy_node f on f.id = k.taxonomy_node_id
      left join platform.taxonomy_node d on d.id = f.parent_id`);
  const out = new Map<string, string>();
  for (const r of res.rows ?? []) if (!out.has(r.feature) || r.owner !== "(unfiled)") out.set(r.feature, r.owner);
  return out;
}

function programFor(feature: string): string {
  if (/^(hr|esign)\./.test(feature)) return "HR program (spec-first seed; consumers unbuilt)";
  if (/^commerce\./.test(feature)) return "commerce campaign (0631 left these unfiled by design)";
  return "seeded ahead of its consumer — the lane that wrote the row owes the read";
}

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const selfTest = process.argv.includes("--self-test");
  const write = process.argv.includes("--write");

  const rows = await loadRegistry(GUARD);

  // A settings SURFACE is never a consumer. The universal settings pane, the
  // first screen and the admin limits page quote every key they render, so
  // scanning them made a key with zero runtime readers count as "forwarded"
  // (2026-09-12: the three first-screen keys read as consumed while the UI
  // itself said "Not connected yet"). They edit settings; they do not honour
  // them.
  const fe = collectFrontend().filter(
    (f) => !/matrx-frontend\/(features\/settings\/(universal|tabs)|features\/admin\/limits)\//.test(f.rel),
  );
  const ai = collectAidream(AIDREAM_SCAN_DIRS);
  if (!ai) {
    unmeasured(
      GUARD,
      "No aidream checkout — most knob CONSUMERS live there, so every server-side knob would be reported an orphan.",
      "clone aidream beside this repo or set AIDREAM_DIR",
    );
  }
  // matrx-sandbox is the ONLY reader of `infrastructure.sandbox` (0636). Its
  // absence is announced, never silent: without it those rows read as orphans
  // and the baseline check below will call them NEW.
  const sb = collectSandbox();
  if (!sb.files) {
    console.log(
      `${C.yellow}${C.bold}[WARN] matrx-sandbox NOT scanned${C.reset} ${C.yellow}— ${sb.why}. Every infrastructure.sandbox row will read as an orphan this run.${C.reset}`,
    );
  }
  const files: SourceFile[] = [...fe, ...ai, ...(sb.files ?? [])];

  // Tier 1 — resolvable (feature, key) call sites, through the ONE reader list
  // (registry-aware: the feature-map, template and key-first families need it).
  const { sites, consts } = scanKnobReads(files, rows);
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

  // ── the ratchet ──────────────────────────────────────────────────────────
  const baseline: Baseline | null = existsSync(BASELINE_FILE)
    ? (JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Baseline)
    : null;
  const known = new Set<string>();
  for (const [feature, ns] of Object.entries(baseline?.namespaces ?? {})) for (const k of ns.keys) known.add(addr(feature, k));
  const fresh = orphans.filter((o) => !known.has(addr(o.feature, o.key)));
  const knownDebt = orphans.filter((o) => known.has(addr(o.feature, o.key)));
  const orphanAddrs = new Set(orphans.map((o) => addr(o.feature, o.key)));
  const stale: string[] = [...known].filter((a) => !orphanAddrs.has(a));

  if (write) {
    // SHRINK ONLY. Seeding writes today's orphans; afterwards only entries that
    // still ARE orphans survive, and a NEW orphan is never recorded.
    const owners = await ownerByFeature();
    const seeding = baseline === null;
    const namespaces: Record<string, BaselineNamespace> = {};
    const keep = seeding ? orphans : knownDebt;
    for (const o of [...keep].sort((a, b) => addr(a.feature, a.key).localeCompare(addr(b.feature, b.key)))) {
      const prior = baseline?.namespaces[o.feature];
      const ns = (namespaces[o.feature] ??= {
        owner: prior?.owner ?? owners.get(o.feature) ?? "(unfiled)",
        program: prior?.program ?? programFor(o.feature),
        keys: [],
      });
      ns.keys.push(o.key);
    }
    writeFileSync(
      BASELINE_FILE,
      `${JSON.stringify(
        {
          _law: "THE BASELINE ONLY SHRINKS. A NEW orphan is a defect; adding it here is the defect this guard exists to catch.",
          _why:
            "A platform.feature_knob row no code reads is a control that lies. These namespaces were seeded " +
            "SPEC-FIRST — mostly the HR program's hr.* and esign.* rows, written before their screens — and the " +
            "unfinished-work alarm forbids deleting them. They are KNOWN DEBT with an owner, reported on every run, " +
            "tolerated only so the guard can hold the line against NEW orphans. Each entry leaves when its consumer " +
            "ships (common-docs/projects/unified-settings-platform/REGISTER.md).",
          _how:
            "`pnpm check:settings-orphans --write` removes keys that gained a consumer or left the registry. It " +
            "CANNOT add one: a new orphan must get a real reader, or be deleted from the registry.",
          _baselined: baseline?._baselined ?? new Date().toISOString().slice(0, 10),
          _ratcheted: new Date().toISOString().slice(0, 10),
          namespaces,
        },
        null,
        2,
      )}\n`,
    );
    const total = Object.values(namespaces).reduce((n, ns) => n + ns.keys.length, 0);
    console.log(
      `${seeding ? "Seeded" : "Ratcheted"} ${relative(ROOT, BASELINE_FILE)}: ${total} known orphan(s) in ${Object.keys(namespaces).length} namespace(s)${seeding ? "" : ` (removed ${stale.length}${fresh.length ? `; ${fresh.length} NEW orphan(s) NOT recorded` : ""})`}.`,
    );
    process.exit(fresh.length > 0 && !seeding ? 1 : 0);
  }

  const scanned = `matrx-frontend + aidream${sb.files ? " + matrx-sandbox" : ""}`;
  if (json) {
    console.log(
      JSON.stringify(
        {
          rows: rows.length,
          direct: direct.size,
          forwarded: forwarded.length,
          db_read: dbRead.map((r) => ({ feature: r.feature, key: r.key, readers: inDb.get(addr(r.feature, r.key)) })),
          orphans,
          fresh,
          known_debt: knownDebt,
          stale,
          scanned,
        },
        null,
        2,
      ),
    );
    process.exit(fresh.length > 0 ? 1 : 0);
  }

  console.log(`\n${C.bold}${C.white}ORPHANED SETTINGS${C.reset} ${C.dim}(${GUARD})${C.reset}`);
  console.log(
    `${C.dim}${rows.length} live platform.feature_knob rows · ${direct.size} read directly · ${forwarded.length} forwarded through a wrapper · ${dbRead.length} read inside the database · scanned ${files.length} source files across ${scanned} · ${known.size} baselined${C.reset}\n`,
  );

  if (!baseline) {
    console.log(
      `${C.yellow}No baseline yet${C.reset} ${C.dim}— every orphan counts as NEW until one is seeded: pnpm check:settings-orphans --write${C.reset}\n`,
    );
  }

  const printGrouped = (list: KnobRow[], indent = "  ") => {
    const byFeature = new Map<string, KnobRow[]>();
    for (const o of list) byFeature.set(o.feature, [...(byFeature.get(o.feature) ?? []), o]);
    for (const [feature, group] of [...byFeature].sort((a, b) => b[1].length - a[1].length)) {
      const ns = baseline?.namespaces[feature];
      const owner = ns ? ` ${C.dim}→ ${ns.owner} · ${ns.program}${C.reset}` : "";
      console.log(`${indent}${C.bold}${C.cyan}${feature}${C.reset} ${C.dim}(${group.length})${C.reset}${owner}`);
      for (const o of group) console.log(`${indent}  ${C.dim}${o.key}${C.reset}`);
    }
  };

  if (fresh.length === 0) {
    console.log(`${C.green}✓ No NEW orphaned settings.${C.reset}`);
  } else {
    console.log(
      `${C.red}${C.bold}[LOUD] ${fresh.length} NEW registered setting(s) that NO code reads — not in the baseline${C.reset}`,
    );
    console.log(
      `${C.dim}A person can turn each of these and the system will do exactly what it did before.${C.reset}\n`,
    );
    printGrouped(fresh);
    console.log(
      `\n  ${C.yellow}Fix (one of two, never a third):${C.reset} wire a real consumer that reads the knob`,
    );
    console.log(
      `  ${C.dim}through the resolution API — or DELETE the row. A registry row with no reader is${C.reset}`,
    );
    console.log(
      `  ${C.dim}a control that lies, and leaving it "for later" is how the photo-editing tab happened.${C.reset}`,
    );
    console.log(`  ${C.dim}Adding it to ${relative(ROOT, BASELINE_FILE)} is NOT a fix.${C.reset}`);
  }

  if (knownDebt.length > 0) {
    console.log(
      `\n${C.yellow}[KNOWN DEBT] ${knownDebt.length} baselined orphan(s) still have no reader${C.reset} ${C.dim}— seeded ahead of their consumers; each leaves this list when its screen ships${C.reset}`,
    );
    printGrouped(knownDebt);
  }

  if (stale.length > 0) {
    console.log(
      `\n${C.green}${stale.length} baseline entr${stale.length === 1 ? "y" : "ies"} no longer orphaned${C.reset} ${C.dim}— the ratchet moved. Run --write to lock it in.${C.reset}`,
    );
    for (const a of stale.slice(0, 20)) console.log(`  ${C.dim}${a}${C.reset}`);
    if (stale.length > 20) console.log(`  ${C.dim}… and ${stale.length - 20} more${C.reset}`);
  }

  console.log("");
  process.exit(fresh.length > 0 ? 1 : 0);
}

main();
