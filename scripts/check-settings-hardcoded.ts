#!/usr/bin/env tsx
/**
 * check:settings-hardcoded — a NEW knob-shaped CAPS constant appearing outside
 * the registry.
 *
 * 🚨 THE LAW (CLAUDE.md law 6, "opinions become knobs"): a behavioural choice
 * is an org-configurable setting with a sensible default. Organizations decide,
 * never agents, and never hardcoded taste. `MAX_HOSTS = 10` in a constants file
 * is one engineer's opinion frozen into a deploy — nobody can see it, nobody
 * can change it, and the second copy of it somewhere else silently disagrees.
 * The census found exactly that: quiz question count defaults 8 in
 * `kindConfig.ts` and 10 in `quizGenerator.ts` — ONE nominal setting, TWO real
 * defaults, and no way to tell which one a given screen obeyed.
 *
 * 🚨 WHY THIS IS A RATCHET AND NOT A WALL. There are ~662 of these in
 * matrx-frontend today (register USP-020). A guard that failed on all 662 would
 * be switched off inside a day and the law would go back to being prose. So the
 * CURRENT set is baselined into `scripts/settings-hardcoded-allowlist.json` and
 * the guard fails only on what is NEW. **The allowlist only shrinks.**
 * `--write` rewrites it to the entries STILL present and never adds one, so a
 * new constant cannot be laundered into the baseline by re-running the guard —
 * growing the allowlist is itself the defect, and it takes a hand edit to this
 * repo with a human behind it.
 *
 * WHAT COUNTS AS KNOB-SHAPED — a module-level `const NAME = <literal>` whose
 * NAME starts with MAX_/MIN_ or ends with _LIMIT/_TIMEOUT/_MS/_THRESHOLD/
 * _INTERVAL/_SIZE/_TTL/_RETRIES and whose VALUE is a number or a boolean. That pair
 * — operational name AND a bare tunable value — is the shape of an opinion.
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG
 *   · a string, array, object, or regex constant (a lookup table, a route, a
 *     label set — not a tunable)
 *   · 0, 1, -1, 100, 1000 as bare "structural" values in a name that reads as
 *     an index or a unit conversion (MS_PER_SECOND, INDEX_NOT_FOUND)
 *   · anything under scripts/, __tests__/, types/, .next/
 *   · a constant carrying a `KNOB MIRROR` comment within 6 lines above it —
 *     the documented posture for a value that mirrors a registry row for a
 *     synchronous render path. The comment is the contract.
 *
 *   pnpm check:settings-hardcoded
 *   pnpm check:settings-hardcoded --json
 *   pnpm check:settings-hardcoded --write   # SHRINK the baseline to reality
 *   pnpm check:settings-hardcoded --self-test
 *
 * Exit: 0 clean · 1 NEW constant(s) · 2 UNMEASURED (scanned nothing).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import {
  AIDREAM_SCAN_DIRS,
  C,
  ROOT,
  collectAidream,
  collectFrontend,
  lineOf,
  unmeasured,
} from "./settings-guards/lib";

const GUARD = "check:settings-hardcoded";
const ALLOWLIST_FILE = join(ROOT, "scripts", "settings-hardcoded-allowlist.json");

/**
 * The operational vocabulary — the LANE C brief's list, verbatim: a name that
 * STARTS with MAX_/MIN_ or ENDS with _LIMIT/_TIMEOUT/_MS/_THRESHOLD/_INTERVAL/
 * _SIZE/_TTL/_RETRIES (plural or singular). A name without one of these is not
 * an opinion this guard grades; widening the list widens the baseline, and the
 * baseline is the debt. Change it here, once, and re-seed deliberately.
 */
const KNOB_WORD_RE =
  /^(MAX|MIN)_|_(LIMIT|LIMITS|TIMEOUT|TIMEOUT_MS|MS|THRESHOLD|INTERVAL|INTERVAL_MS|SIZE|TTL|TTL_MS|TTL_SECONDS|RETRY|RETRIES)$/;

/** Unit conversions and structural sentinels — arithmetic, not taste. */
const STRUCTURAL_RE =
  /(^|_)(MS_PER|SECONDS_PER|MINUTES_PER|HOURS_PER|BYTES_PER|PER_SECOND|PER_MINUTE|PER_HOUR|PER_DAY|NOT_FOUND|INDEX|VERSION|RADIX|EPSILON)(_|$)/;

const KNOB_MIRROR_RE = /knob[ -]?mirror/i;
const KNOB_MIRROR_WINDOW = 6;

/** `const NAME = 123` / `NAME: Final[int] = 123` / `NAME = True` — value must be a bare literal. */
const TS_CONST_RE =
  /^[ \t]*(?:export\s+)?const\s+([A-Z][A-Z0-9_]{2,})(?:\s*:\s*[\w<>[\], |]+)?\s*=\s*(-?\d[\d_]*(?:\.\d+)?|true|false)\s*(?:as\s+const\s*)?[;,\n]/gm;
const PY_CONST_RE =
  /^(?:[ \t]*)([A-Z][A-Z0-9_]{2,})(?:\s*:\s*[\w.[\]"'| ]+)?\s*=\s*(-?\d[\d_]*(?:\.\d+)?|True|False)\s*(?:#.*)?$/gm;

interface Site {
  file: string;
  line: number;
  name: string;
  value: string;
}
interface AllowEntry {
  file: string;
  name: string;
  reason?: string;
}

function siteKey(s: { file: string; name: string }): string {
  return `${s.file}::${s.name}`;
}

function main(): void {
  const json = process.argv.includes("--json");
  const write = process.argv.includes("--write");
  const selfTest = process.argv.includes("--self-test");

  const fe = collectFrontend();
  const ai = collectAidream(AIDREAM_SCAN_DIRS);
  const files = [...fe, ...(ai ?? [])];
  if (fe.length === 0) {
    unmeasured(GUARD, "Scanned ZERO frontend files.", "run from the matrx-frontend checkout");
  }
  if (!ai && write) {
    // Without aidream every aidream baseline entry looks "gone" and a --write
    // would ratchet them away; the next full run would then flag every one as
    // NEW. Refuse rather than corrupt the baseline.
    unmeasured(GUARD, "No aidream checkout — --write would drop every aidream baseline entry.", "clone aidream beside this repo or set AIDREAM_DIR, then --write");
  }
  if (!ai) {
    console.log(`${C.yellow}[WARN] no aidream checkout — only matrx-frontend constants were scanned this run${C.reset}`);
  }

  const live: Site[] = [];
  const mirrors: Site[] = [];
  for (const f of files) {
    const re = f.rel.endsWith(".py") ? PY_CONST_RE : TS_CONST_RE;
    const lines = f.text.split("\n");
    re.lastIndex = 0;
    for (let m = re.exec(f.text); m; m = re.exec(f.text)) {
      const name = m[1];
      if (!KNOB_WORD_RE.test(name) || STRUCTURAL_RE.test(name)) continue;
      const line = lineOf(f.text, m.index);
      const above = lines.slice(Math.max(0, line - 1 - KNOB_MIRROR_WINDOW), line - 1).join("\n");
      const site = { file: f.rel, line, name, value: m[2] };
      if (KNOB_MIRROR_RE.test(above)) mirrors.push(site);
      else live.push(site);
    }
  }

  const allow: AllowEntry[] = existsSync(ALLOWLIST_FILE)
    ? (JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8")).entries as AllowEntry[])
    : [];
  const allowKeys = new Set(allow.map(siteKey));

  if (selfTest) {
    live.push({
      file: "SELF-TEST (not a real file)",
      line: 1,
      name: "MAX_SELF_TEST_OPINION",
      value: "42",
    });
  }

  const fresh = live.filter((s) => !allowKeys.has(siteKey(s)));
  const liveKeys = new Set(live.map(siteKey));
  const stale = allow.filter((a) => !liveKeys.has(siteKey(a)));

  if (write) {
    // SHRINK ONLY. Entries still present survive; a NEW site is never recorded.
    const kept = allow.filter((a) => liveKeys.has(siteKey(a)));
    const seeding = !existsSync(ALLOWLIST_FILE);
    const entries = seeding
      ? live
          .map((s) => ({ file: s.file, name: s.name }))
          .sort((a, b) => siteKey(a).localeCompare(siteKey(b)))
      : kept;
    writeFileSync(
      ALLOWLIST_FILE,
      `${JSON.stringify(
        {
          _law: "THE ALLOWLIST ONLY SHRINKS. Growing it is the defect this guard exists to catch.",
          _why:
            "CLAUDE.md law 6 — opinions become knobs. These are the knob-shaped constants that " +
            "existed when check:settings-hardcoded was written; each one is a setting nobody can " +
            "see or change. They are tolerated so the guard can hold the line against NEW ones, " +
            "and they come off this list as the Unified Settings Platform migrates them " +
            "(common-docs/projects/unified-settings-platform/REGISTER.md, USP-020).",
          _how:
            "`pnpm check:settings-hardcoded --write` removes entries that no longer exist. It " +
            "CANNOT add one: a new constant must be registered in platform.feature_knob, or the " +
            "line must be argued for by a human editing this file by hand with a reason.",
          _baselined: new Date().toISOString().slice(0, 10),
          entries,
        },
        null,
        2,
      )}\n`,
    );
    console.log(
      `${seeding ? "Seeded" : "Ratcheted"} ${relative(ROOT, ALLOWLIST_FILE)}: ${entries.length} entr${entries.length === 1 ? "y" : "ies"}${seeding ? "" : ` (removed ${allow.length - kept.length})`}.`,
    );
    process.exit(0);
  }

  if (json) {
    console.log(JSON.stringify({ live: live.length, allowlisted: allow.length, fresh, stale }, null, 2));
    process.exit(fresh.length > 0 ? 1 : 0);
  }

  console.log(`\n${C.bold}${C.white}HARDCODED SETTINGS${C.reset} ${C.dim}(${GUARD})${C.reset}`);
  console.log(
    `${C.dim}${live.length} knob-shaped constant(s) across ${files.length} files · ${allow.length} baselined · ${mirrors.length} declared KNOB MIRROR${C.reset}\n`,
  );

  if (!existsSync(ALLOWLIST_FILE)) {
    console.log(
      `${C.yellow}No baseline yet${C.reset} ${C.dim}— every live constant counts as NEW until one is seeded: pnpm check:settings-hardcoded --write${C.reset}\n`,
    );
  }

  if (fresh.length === 0) {
    console.log(`${C.green}✓ No NEW hardcoded settings.${C.reset}`);
  } else {
    console.log(
      `${C.red}${C.bold}[LOUD] ${fresh.length} NEW knob-shaped constant(s) — not in the baseline${C.reset}`,
    );
    console.log(`${C.dim}An opinion frozen into a deploy. Organizations decide, not constants.${C.reset}\n`);
    for (const s of fresh) {
      console.log(`  ${C.cyan}${s.file}:${s.line}${C.reset}  ${C.bold}${s.name}${C.reset} = ${s.value}`);
    }
    console.log(
      `\n  ${C.yellow}Fix:${C.reset} register the value in platform.feature_knob and read it through the`,
    );
    console.log(
      `  ${C.dim}resolution API (lib/knobs/featureKnobs.ts here, services/feature_knobs there).${C.reset}`,
    );
    console.log(
      `  ${C.dim}A value that MUST be synchronous may mirror a registry row — say so with a${C.reset}`,
    );
    console.log(
      `  ${C.dim}\`KNOB MIRROR\` comment within ${KNOB_MIRROR_WINDOW} lines above it. Adding it to the allowlist is NOT a fix.${C.reset}`,
    );
  }

  if (stale.length > 0) {
    console.log(
      `\n${C.green}${stale.length} baseline entr${stale.length === 1 ? "y" : "ies"} no longer exist${C.reset} ${C.dim}— the ratchet moved. Run --write to lock it in.${C.reset}`,
    );
    for (const e of stale.slice(0, 20)) console.log(`  ${C.dim}${e.file}  ${e.name}${C.reset}`);
    if (stale.length > 20) console.log(`  ${C.dim}… and ${stale.length - 20} more${C.reset}`);
  }

  console.log("");
  process.exit(fresh.length > 0 ? 1 : 0);
}

main();
