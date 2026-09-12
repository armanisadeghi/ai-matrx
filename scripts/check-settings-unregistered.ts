#!/usr/bin/env tsx
/**
 * check:settings-unregistered — a config READ naming a key the registry does
 * not have.
 *
 * 🚨 THE DEFECT (Unified Settings Platform, LANE C): the mirror image of an
 * orphan. `check:settings-orphans` finds a knob nobody reads; this finds a
 * reader with no knob. Both halves are needed before "what the UI shows is
 * what the system does" means anything, because the failure is asymmetric and
 * nasty: a knob read that does not resolve RAISES at run time, by design
 * (`lib/knobs/featureKnobs.ts`: "A MISSING knob RAISES. There is deliberately
 * no constant to fall back on"). So an unregistered key is not a stale
 * comment — it is a feature that explodes the first time that code path runs,
 * on whatever machine runs it first, which is usually production.
 *
 * WHAT IT SCANS — the ONE reader list in `settings-guards/lib.ts`
 * (`scanKnobReads`), shared with check:settings-orphans so a reader the
 * orphans guard credits is a reader this guard grades:
 *   matrx-frontend  knobNumber / knobInt / knobBool / knobString / knobInts
 *                   (`lib/knobs/featureKnobs.ts`), and `useScopedKnobs({
 *                   featurePrefix })` + `.key === "…"` (`lib/scoped-config`)
 *   aidream         knob_int / knob_bool / knob_str / knob_decimal and the
 *                   scoped_* family in `services/feature_knobs/service.py`
 *   packages        usd_knob / int_knob / str_knob / float_knob / bool_knob
 *                   (`matrx_seo.knobs`, `matrx_batch.knobs`)
 *
 * A feature argument written as a module constant (`knob_int(PUBLISH_FEATURE,
 * "sync_tick_minutes")`) is resolved from that file's own
 * `NAME = "literal"` assignments — the tidiest call sites must not be the
 * unreadable ones.
 *
 * WHAT IT REPORTS BUT DOES NOT FAIL ON
 *   A call whose feature or key is genuinely dynamic (`f"max_live_{target}_runs"`,
 *   a variable, a loop). These are listed under DYNAMIC with their file and
 *   line so nobody mistakes silence for coverage — the guard says plainly what
 *   it could not resolve instead of pretending the tree is fully measured.
 *
 * CREDENTIAL GATED. No live registry = exit 2 UNMEASURED, never a pass.
 *
 *   pnpm check:settings-unregistered
 *   pnpm check:settings-unregistered --json
 *   pnpm check:settings-unregistered --self-test   # prove it can still fail
 *
 * Exit: 0 clean · 1 unregistered key(s) · 2 UNMEASURED.
 */
import process from "node:process";
import {
  AIDREAM_SCAN_DIRS,
  C,
  addr,
  collectAidream,
  collectFrontend,
  loadRegistry,
  scanKnobReads,
  unmeasured,
  type DynamicRead as Dynamic,
  type ReadSite as Site,
} from "./settings-guards/lib";

const GUARD = "check:settings-unregistered";

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const selfTest = process.argv.includes("--self-test");

  const rows = await loadRegistry(GUARD);
  const registered = new Set(rows.map((r) => addr(r.feature, r.key)));

  const fe = collectFrontend();
  const ai = collectAidream(AIDREAM_SCAN_DIRS);
  if (!ai) {
    unmeasured(
      GUARD,
      "No aidream checkout — most of the platform's knob read sites live there and were NOT scanned.",
      "clone aidream beside this repo or set AIDREAM_DIR",
    );
  }
  const { sites, dynamic }: { sites: Site[]; dynamic: Dynamic[] } = scanKnobReads([...fe, ...ai]);

  if (selfTest) {
    sites.push({
      file: "SELF-TEST (not a real file)",
      line: 1,
      fn: "knobInt",
      feature: "self_test_feature_that_cannot_exist",
      key: "self_test_key_that_cannot_exist",
    });
  }

  const bad = sites.filter((s) => !registered.has(addr(s.feature, s.key)));

  if (json) {
    console.log(
      JSON.stringify(
        { registered: registered.size, sites: sites.length, unregistered: bad, dynamic }, null, 2),
    );
    process.exit(bad.length > 0 ? 1 : 0);
  }

  console.log(`\n${C.bold}${C.white}UNREGISTERED SETTING READS${C.reset} ${C.dim}(${GUARD})${C.reset}`);
  console.log(
    `${C.dim}${registered.size} live platform.feature_knob rows · ${sites.length} resolved read site(s) · ${dynamic.length} dynamic${C.reset}\n`,
  );

  if (bad.length === 0) {
    console.log(
      `${C.green}✓ Every resolvable knob read names a live registry row.${C.reset}`,
    );
  } else {
    console.log(
      `${C.red}${C.bold}[LOUD] ${bad.length} read site(s) name a key that is NOT in the registry${C.reset}`,
    );
    console.log(
      `${C.dim}A missing knob RAISES — each of these throws the first time its path runs.${C.reset}\n`,
    );
    for (const s of bad) {
      console.log(
        `  ${C.cyan}${s.file}:${s.line}${C.reset}  ${C.bold}${s.feature} ${s.key}${C.reset} ${C.dim}(${s.fn})${C.reset}`,
      );
    }
    console.log(
      `\n  ${C.yellow}Fix:${C.reset} seed the row in platform.feature_knob (value, default_value, value_type,`,
    );
    console.log(`  ${C.dim}label, description, overridable_by) — or delete the dead read.${C.reset}`);
  }

  if (dynamic.length > 0) {
    console.log(
      `\n${C.yellow}${dynamic.length} read site(s) this guard COULD NOT RESOLVE${C.reset} ${C.dim}— listed so silence is never mistaken for coverage${C.reset}`,
    );
    for (const d of dynamic.slice(0, 40)) {
      console.log(`  ${C.dim}${d.file}:${d.line}  ${d.fn}(${d.raw})  — ${d.why}${C.reset}`);
    }
    if (dynamic.length > 40) console.log(`  ${C.dim}… and ${dynamic.length - 40} more${C.reset}`);
  }

  console.log("");
  process.exit(bad.length > 0 ? 1 : 0);
}

main();
