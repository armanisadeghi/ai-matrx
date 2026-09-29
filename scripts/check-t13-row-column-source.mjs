#!/usr/bin/env node
/**
 * T-13 source ratchet — no new code reference to the retiring row column (access ladder).
 *
 * Access ladder T-13 (common-docs/projects/access-ladder/t13/PLAN.md §2.5c) retires the row
 * column into `shown_to` (a list filter) and `published_to_web` (the only anonymous lane). Every
 * code reference to the old column is a reader or writer phase 5 converts; this guard makes sure
 * the set only shrinks while that happens. The same guard, rule and baseline shape live in aidream,
 * matrx-frontend, matrx-extend and matrx-local.
 *
 * WHAT IT COUNTS: per file, the lines naming the column as a whole word (lower case — the column,
 * the `platform.<word>` enum, a `.eq("<word>", …)` filter, a type field, a SQL predicate) in tracked
 * and untracked-but-not-ignored code files (py, ts, tsx, js, jsx, mjs, cjs, sql, rs, svelte, vue).
 * NOT counted, because they are a different word: the CSS/DOM property of the same name (`style.<word>`,
 * `<word>: hidden|visible|collapse…`), the SEO `ai_<word>` feature, `document.<word>…`.
 * Skipped paths: migrations (the database guard `t13_no_new_row_column_reader` owns what lands in
 * the database), generated types and build output.
 *
 * It FAILS (exit 1) when any file holds more such lines than
 * `scripts/t13-row-column-source-baseline.json` allows (a new file's allowance is 0), naming every
 * line. The baseline was taken 2026-09-28 from this detector and cross-checked against the T-13
 * census (common-docs/projects/access-ladder/t13/census/). It only shrinks: `--shrink-baseline`
 * lowers counts to what is live and drops converted files; it can never raise one.
 *
 * WHAT IT CANNOT SEE: a reference spelled without the word (a constant holding it, a dynamic key).
 * Green means no new literal reference, not that no new reader exists.
 *
 * `--self-test` proves it red-then-green in memory, writing nothing: a planted new file filtering on
 * the column fails, one more line in a baselined file fails, planted CSS/DOM lines do not fire, and
 * the real tree without plants passes.
 *
 *   node scripts/check-t13-row-column-source.mjs
 *   node scripts/check-t13-row-column-source.mjs --shrink-baseline
 *   node scripts/check-t13-row-column-source.mjs --self-test
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "t13-row-column-source-baseline.json");
const WORD = "visi" + "bility";
const ROW = new RegExp(`(?<![A-Za-z0-9_\\-])${WORD}(?![A-Za-z0-9_\\-])`);
const NOISE = [
  new RegExp(`${WORD}\\s*[:=]\\s*["'\`]?(hidden|visible|collapse|inherit|initial|unset|revert)\\b`),
  new RegExp(`style(\\.|\\[["'])${WORD}`),
  new RegExp(`${WORD}\\s*:\\s*\\$\\{`),
  new RegExp(`transition[^;\\n]*${WORD}`),
  new RegExp(`ai[_-]${WORD}`),
  new RegExp(`document\\.${WORD}`),
];
const CODE = /\.(py|ts|tsx|js|jsx|mjs|cjs|sql|rs|svelte|vue)$/;
const SKIP =
  /(^|\/)(migrations|node_modules|dist|build|\.next|\.output|vendor|__pycache__|target)\/|database\.types\.ts$|generated|api-types\.ts$|\.d\.ts$|\.min\.js$/;

// SPLIT SPELLINGS FAIL: the word assembled from quoted pieces ("visi" + ..., 'vis' || ..., implicit
// concatenation, a list join) hides a reader from this count, which defeats the guard. Only this guard file
// may assemble it (it must name the word without counting itself).
const SPLIT = new RegExp(
  Array.from({ length: WORD.length - 1 }, (_, i) => i + 1)
    .map((k) => `${WORD.slice(0, k)}["'\`]\\s*(?:\\+|\\|\\||,|\\s)\\s*[rbfuRBFU]{0,2}["'\`]${WORD.slice(k)}`)
    .join("|"),
  "i",
);
const GUARD_FILE = "scripts/check-t13-row-column-source.mjs";

function files() {
  const out = new Set();
  for (const args of [["ls-files"], ["ls-files", "--others", "--exclude-standard"]]) {
    const res = execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    for (const p of res.split("\n")) if (p) out.add(p);
  }
  return [...out].filter((p) => CODE.test(p) && !SKIP.test(p)).sort();
}

export function matchingLines(text) {
  const hits = [];
  text.split("\n").forEach((line, i) => {
    if (ROW.test(line) && !NOISE.some((n) => n.test(line))) hits.push([i + 1, line.trim()]);
  });
  return hits;
}

export function scan(overrides = {}) {
  const found = {};
  for (const rel of [...new Set([...files(), ...Object.keys(overrides)])].sort()) {
    let text;
    if (rel in overrides) text = overrides[rel];
    else {
      const p = join(ROOT, rel);
      if (!existsSync(p) || !statSync(p).isFile()) continue;
      text = readFileSync(p, "utf8");
    }
    const hits = matchingLines(text);
    if (hits.length) found[rel] = hits;
  }
  return found;
}

export function splitSpellings(overrides = {}) {
  const out = [];
  for (const rel of [...new Set([...files(), ...Object.keys(overrides)])].sort()) {
    if (rel === GUARD_FILE) continue;
    let text;
    if (rel in overrides) text = overrides[rel];
    else {
      const p = join(ROOT, rel);
      if (!existsSync(p) || !statSync(p).isFile()) continue;
      text = readFileSync(p, "utf8");
    }
    text.split("\n").forEach((line, i) => {
      if (SPLIT.test(line)) out.push(`${rel}:${i + 1}: ${line.trim().slice(0, 160)}`);
    });
  }
  return out;
}

const loadBaseline = () => JSON.parse(readFileSync(BASELINE, "utf8")).files;

export function verdict(found, baseline) {
  const grew = [];
  const shrinkable = [];
  for (const rel of Object.keys(found).sort()) {
    const allowed = baseline[rel] ?? 0;
    const hits = found[rel];
    if (hits.length > allowed) {
      grew.push(
        `${rel}: ${hits.length} reference(s), baseline allows ${allowed}` +
          hits.map(([n, l]) => `\n    ${rel}:${n}: ${l.slice(0, 160)}`).join(""),
      );
    }
  }
  for (const [rel, allowed] of Object.entries(baseline)) {
    const n = found[rel]?.length ?? 0;
    if (n < allowed) shrinkable.push(`${rel}: ${n} < ${allowed}`);
  }
  return { grew, shrinkable };
}

function shrink(found) {
  const data = JSON.parse(readFileSync(BASELINE, "utf8"));
  const old = data.files;
  const next = {};
  for (const [rel, n] of Object.entries(old)) {
    const live = found[rel]?.length ?? 0;
    if (live) next[rel] = Math.min(n, live);
  }
  const added = Object.keys(next).filter((r) => !(r in old) || next[r] > old[r]);
  if (added.length) throw new Error(`refused: shrinking would add ${added.join(", ")}`);
  data.files = Object.fromEntries(Object.entries(next).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(BASELINE, JSON.stringify(data, null, 1) + "\n");
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  console.log(`[t13-row-column-source] baseline shrunk: ${sum(old)} -> ${sum(next)} lines`);
  return 0;
}

function selfTest() {
  const baseline = loadBaseline();
  const someFile = Object.keys(baseline)[0];
  const real = readFileSync(join(ROOT, someFile), "utf8");
  const plantNew = "scripts/__t13_selftest_plant__.ts";
  const cases = [
    ["real tree, no plant", {}, false],
    ["planted new file filtering on the column", { [plantNew]: `q.eq("${WORD}", "public");\n` }, true],
    ["one more reference in a baselined file", { [someFile]: `${real}\nrow.${WORD} = "public";\n` }, true],
    [
      "planted CSS/DOM lines only (must not fire)",
      { [plantNew]: `el.style.${WORD} = "hidden";\nconst css = "${WORD}: hidden;";\nconst ai_${WORD}_panel = 1;\n` },
      false,
    ],
  ];
  let ok = true;
  const splitPlant = "scripts/__t13_selftest_split__.ts";
  const [a, b] = [WORD.slice(0, 4), WORD.slice(4)];
  for (const [name, text, wantFail] of [
    ["planted split spelling with +", `const W = "${a}" + "${b}";\n`, true],
    ["planted split spelling with || (SQL)", `const q = "select '${a}' || '${b}'";\n`, true],
    ["planted list join", `const W = ["${a}", "${b}"].join("");\n`, true],
    ["unrelated concatenation (must not fire)", `const x = "vis" + "ual";\n`, false],
  ]) {
    const hits = splitSpellings({ [splitPlant]: text }).filter((h) => h.startsWith(splitPlant));
    const good = hits.length > 0 === wantFail;
    ok &&= good;
    console.log(`  ${good ? "ok  " : "FAIL"} ${name}: ${hits.length ? "red" : "green"}`);
  }
  const realSplit = splitSpellings();
  ok &&= realSplit.length === 0;
  console.log(`  ${realSplit.length ? "FAIL" : "ok  "} real tree has no split spelling outside the guard (${realSplit.length})`);
  for (const [name, overrides, wantFail] of cases) {
    const { grew } = verdict(scan(overrides), baseline);
    const failed = grew.length > 0;
    const named = wantFail ? Object.keys(overrides).every((k) => grew.some((g) => g.includes(k))) : true;
    const good = failed === wantFail && named;
    ok &&= good;
    console.log(
      `  ${good ? "ok  " : "FAIL"} ${name}: ${failed ? "red" : "green"}${grew.length ? ` — ${grew[0].split("\n")[0]}` : ""}`,
    );
  }
  console.log(`[t13-row-column-source] self-test ${ok ? "PASS" : "FAIL"} (in memory, nothing written)`);
  return ok ? 0 : 1;
}

function main(argv) {
  if (argv.includes("--self-test")) return selfTest();
  const split = splitSpellings();
  if (split.length) {
    for (const s of split) console.log(`FAIL split spelling of the row column (hides a reader from this guard): ${s}`);
    console.log("[t13-row-column-source] FAIL — write the column name plainly (common-docs/projects/access-ladder/t13/PLAN.md §2.5).");
    return 1;
  }
  const found = scan();
  if (argv.includes("--shrink-baseline")) return shrink(found);
  const { grew, shrinkable } = verdict(found, loadBaseline());
  if (shrinkable.length) {
    console.log(`[t13-row-column-source] ${shrinkable.length} file(s) converted below baseline — run --shrink-baseline`);
  }
  if (grew.length) {
    for (const g of grew) console.log(`FAIL ${g}`);
    console.log(
      `[t13-row-column-source] FAIL — ${grew.length} file(s) gained a reference to the row column access-ladder T-13 retires. ` +
        "Read published_to_web for the anonymous lane and shown_to for list narrowing " +
        "(common-docs/projects/access-ladder/t13/PLAN.md); the baseline never grows.",
    );
    return 1;
  }
  const total = Object.values(found).reduce((a, h) => a + h.length, 0);
  console.log(`[t13-row-column-source] clean — ${total} baselined reference(s) in ${Object.keys(found).length} file(s), none new`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
