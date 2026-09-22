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
 *   · a constant DECLARED NOT AN OPINION in
 *     `scripts/settings-hardcoded-classification.json`, with a kind and a
 *     sentence saying what it is bounded BY — see below.
 *
 * 🚨 THE CLASSIFICATION IS NOT A SECOND BASELINE (SETTINGS-3, 2026-09-22).
 * Law 6 says opinions become knobs. It does not say every number becomes one.
 * A provider ceiling we do not own, a defensive cap so one bad payload cannot
 * take the process down, the feel of a hover delay, a constant of an algorithm
 * — no organization could hold a different view of any of them, and turning
 * 228 of them into knobs would bury the settings that DO matter under settings
 * that do not. So there are two files and they mean opposite things:
 *   ALLOWLIST       values that ARE opinions and are not converted yet. Debt.
 *                   Carries no argument, and shrinks as the campaign runs.
 *   CLASSIFICATION  values that were READ and are not opinions at all. Carries
 *                   a `kind` from a fixed vocabulary and a REASON of at least
 *                   40 characters, or this guard fails LOUD on the file itself.
 * A line belongs in exactly ONE of them; being in both is an error. Neither can
 * be grown by running the guard — `--write` only ever REMOVES an entry whose
 * constant no longer exists, so laundering a new constant into either takes a
 * hand edit with a person behind it, and in the classification's case it takes
 * a sentence that is either true or visibly nonsense to the next reader.
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
import { exitAfterDrain } from "./lib/exit-after-drain";
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
const CLASSIFICATION_FILE = join(ROOT, "scripts", "settings-hardcoded-classification.json");

/** The only things a constant may be declared to be, INSTEAD of an opinion. */
const CLASSIFICATION_KINDS = new Set([
  "protocol",
  "defensive-cap",
  "ui-timing",
  "algorithmic",
  "resolver-cache",
  "operational-timeout",
]);
/** Short enough to type, long enough that "not a knob" is not a sentence. */
const MIN_CLASSIFICATION_REASON = 40;

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
interface ClassEntry {
  file: string;
  name: string;
  kind: string;
  reason: string;
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

  // ── THE CLASSIFICATION ──────────────────────────────────────────────────
  // Read BEFORE anything is graded, and graded itself: an entry with an unknown
  // kind or a reason too short to be an argument is a baseline wearing a
  // sentence, so the guard fails on the FILE rather than quietly honouring it.
  const classification: ClassEntry[] = existsSync(CLASSIFICATION_FILE)
    ? (JSON.parse(readFileSync(CLASSIFICATION_FILE, "utf8")).entries as ClassEntry[])
    : [];
  const malformed = classification.filter(
    (c) =>
      !c.file ||
      !c.name ||
      !CLASSIFICATION_KINDS.has(c.kind) ||
      typeof c.reason !== "string" ||
      c.reason.trim().length < MIN_CLASSIFICATION_REASON,
  );
  if (malformed.length > 0) {
    console.log(
      `\n${C.red}${C.bold}[LOUD] ${relative(ROOT, CLASSIFICATION_FILE)} holds ${malformed.length} entr${malformed.length === 1 ? "y" : "ies"} that declare nothing${C.reset}`,
    );
    console.log(
      `${C.dim}A classification is an ARGUMENT that a constant is not an opinion. Without a kind from ${[...CLASSIFICATION_KINDS].join(" / ")} and a reason of at least ${MIN_CLASSIFICATION_REASON} characters it is a second baseline, which is the defect this guard exists to catch.${C.reset}\n`,
    );
    for (const c of malformed) {
      console.log(`  ${C.cyan}${c.file}${C.reset}  ${C.bold}${c.name}${C.reset}  kind=${JSON.stringify(c.kind)} reason=${JSON.stringify((c.reason ?? "").slice(0, 60))}`);
    }
    exitAfterDrain(1);
  }
  const classKeys = new Set(classification.map(siteKey));
  // A constant cannot be BOTH unconverted debt and not-an-opinion. Saying both
  // is how one of the two files stops meaning anything.
  const inBoth = [...classKeys].filter((k) => allowKeys.has(k));
  if (inBoth.length > 0) {
    console.log(
      `\n${C.red}${C.bold}[LOUD] ${inBoth.length} constant(s) are in BOTH the allowlist and the classification${C.reset}`,
    );
    console.log(
      `${C.dim}The allowlist means "this IS an opinion and has not been converted yet". The classification means "this is not an opinion at all". Both cannot be true; take it out of one.${C.reset}\n`,
    );
    for (const k of inBoth) console.log(`  ${C.cyan}${k}${C.reset}`);
    exitAfterDrain(1);
  }

  if (selfTest) {
    live.push({
      file: "SELF-TEST (not a real file)",
      line: 1,
      name: "MAX_SELF_TEST_OPINION",
      value: "42",
    });
  }

  const fresh = live.filter((s) => !allowKeys.has(siteKey(s)) && !classKeys.has(siteKey(s)));
  const declared = live.filter((s) => classKeys.has(siteKey(s)));
  const liveKeys = new Set(live.map(siteKey));
  const stale = allow.filter((a) => !liveKeys.has(siteKey(a)));
  const staleClass = classification.filter((c) => !liveKeys.has(siteKey(c)));

  if (write) {
    // SHRINK ONLY — the classification too. An entry whose constant is gone is
    // dropped; one is never added, whatever a re-run finds.
    if (staleClass.length > 0) {
      const raw = JSON.parse(readFileSync(CLASSIFICATION_FILE, "utf8"));
      raw.entries = classification.filter((c) => liveKeys.has(siteKey(c)));
      writeFileSync(CLASSIFICATION_FILE, `${JSON.stringify(raw, null, 2)}\n`);
      console.log(
        `Ratcheted ${relative(ROOT, CLASSIFICATION_FILE)}: removed ${staleClass.length} entr${staleClass.length === 1 ? "y" : "ies"} whose constant no longer exists.`,
      );
    }
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
    exitAfterDrain(0);
  }

  if (json) {
    console.log(JSON.stringify({ live: live.length, allowlisted: allow.length, classified: declared.length, fresh, stale, staleClass }, null, 2));
    exitAfterDrain(fresh.length > 0 ? 1 : 0);
  }

  console.log(`\n${C.bold}${C.white}HARDCODED SETTINGS${C.reset} ${C.dim}(${GUARD})${C.reset}`);
  console.log(
    `${C.dim}${live.length} knob-shaped constant(s) across ${files.length} files · ${allow.length} baselined · ${declared.length} declared NOT AN OPINION · ${mirrors.length} declared KNOB MIRROR${C.reset}\n`,
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
    console.log(
      `  ${C.dim}A value NO organization could hold a different view of — a provider ceiling, a${C.reset}`,
    );
    console.log(
      `  ${C.dim}defensive cap, a hover delay, a constant of the algorithm — is declared in${C.reset}`,
    );
    console.log(
      `  ${C.dim}${relative(ROOT, CLASSIFICATION_FILE)} with its kind and the sentence saying${C.reset}`,
    );
    console.log(
      `  ${C.dim}what bounds it. A sentence you cannot write means it is an opinion.${C.reset}`,
    );
  }

  if (staleClass.length > 0) {
    console.log(
      `\n${C.green}${staleClass.length} classification entr${staleClass.length === 1 ? "y" : "ies"} no longer exist${C.reset} ${C.dim}— run --write to drop them.${C.reset}`,
    );
    for (const c of staleClass.slice(0, 20)) console.log(`  ${C.dim}${c.file}  ${c.name}${C.reset}`);
    if (staleClass.length > 20) console.log(`  ${C.dim}… and ${staleClass.length - 20} more${C.reset}`);
  }

  if (stale.length > 0) {
    console.log(
      `\n${C.green}${stale.length} baseline entr${stale.length === 1 ? "y" : "ies"} no longer exist${C.reset} ${C.dim}— the ratchet moved. Run --write to lock it in.${C.reset}`,
    );
    for (const e of stale.slice(0, 20)) console.log(`  ${C.dim}${e.file}  ${e.name}${C.reset}`);
    if (stale.length > 20) console.log(`  ${C.dim}… and ${stale.length - 20} more${C.reset}`);
  }

  console.log("");
  exitAfterDrain(fresh.length > 0 ? 1 : 0);
}

main();
