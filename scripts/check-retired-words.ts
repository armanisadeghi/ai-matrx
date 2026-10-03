#!/usr/bin/env tsx
/**
 * scripts/check-retired-words.ts — THE RETIRED-WORDS GUARD, static leg (matrx-frontend).
 *
 * Data Doctrine R16: one name, renamed completely in one pass. ONE-HOME renamed the schema
 * `graveyard` -> `deprecated` (DD-063), the schema `workspace` -> `projects` (DD-067) and the
 * actor tiers code/ai/human -> system/agent/user (DD-064). This scans every tracked text file
 * for the retired words in `common-docs/meta/scripts/retired-words.json` (the ONE
 * list every leg reads) and compares per-file counts with `scripts/retired-words-baseline.json`:
 *   - a count above its baseline = a NEW use -> fail (fix it with the replacement word);
 *   - a baseline above the current count = STALE -> fail until the shrink is recorded.
 * Twin of aidream `scripts/check_retired_words.py` (which also runs the --live catalog leg).
 *
 *   pnpm check:retired-words                   the gate
 *   pnpm check:retired-words --list            every current use
 *   pnpm check:retired-words --write-baseline  record a SHRINK (refuses any new use); a missing
 *                                              baseline is seeded only with
 *                                              MATRX_RATCHET_SEED=<baseline path>
 *   pnpm check:retired-words:self-test         RED on a planted `select * from graveyard.x` /
 *                                              `create schema workspace`, GREEN without
 *
 * Exit: 0 clean · 1 new use or stale baseline · 2 UNMEASURED (no word list found).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

type Word = { id: string; text: string; flags?: string; hints?: string[]; replacement?: string; re?: RegExp };
type Spec = { words: Word[]; exempt_paths?: string[] };
type Hits = Record<string, Record<string, number>>;
type Baseline = { static?: Hits; catalog?: Record<string, string[]>; [k: string]: unknown };

const MAX_BYTES = 5_000_000;
const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

function repoRoot(): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: HERE, encoding: "utf8" }).trim();
  } catch {
    return resolve(HERE, "..");
  }
}

function findWords(root: string): string | null {
  const rel = join("meta", "scripts", "retired-words.json");
  const candidates = [arg("--words"), process.env.RETIRED_WORDS_FILE, join(root, rel), join(dirname(root), "common-docs", rel)];
  for (const c of candidates) if (c && existsSync(c)) return c;
  return null;
}

function loadWords(path: string): Spec {
  const spec = JSON.parse(readFileSync(path, "utf8")) as Spec;
  for (const w of spec.words) w.re = new RegExp(w.text, (w.flags ?? "").includes("i") ? "gi" : "g");
  return spec;
}

function trackedFiles(root: string): string[] {
  // tracked plus untracked-not-ignored: a new file is caught before its first commit
  return execFileSync("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    maxBuffer: 1 << 30,
  })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

export function scanText(root: string, spec: Spec, files?: string[]): Hits {
  const exempt = new Set(spec.exempt_paths ?? []);
  const hits: Hits = {};
  for (const rel of files ?? trackedFiles(root)) {
    if (exempt.has(rel) || rel.endsWith("retired-words-baseline.json")) continue;
    const fp = join(root, rel);
    let raw: Buffer;
    try {
      const st = statSync(fp);
      if (!st.isFile() || st.size > MAX_BYTES) continue;
      raw = readFileSync(fp);
    } catch {
      continue;
    }
    if (raw.subarray(0, 8192).includes(0)) continue;
    const text = raw.toString("utf8");
    const low = text.toLowerCase();
    for (const w of spec.words) {
      if (w.hints?.length && !w.hints.some((h) => low.includes(h))) continue;
      const n = text.match(w.re!)?.length ?? 0;
      if (n) (hits[w.id] ??= {})[rel] = n;
    }
  }
  return hits;
}

export function compare(current: Hits, baseline: Baseline): { added: string[]; stale: string[] } {
  const added: string[] = [];
  const stale: string[] = [];
  const base = baseline.static ?? {};
  for (const word of [...new Set([...Object.keys(current), ...Object.keys(base)])].sort()) {
    const cur = current[word] ?? {};
    const b = base[word] ?? {};
    for (const path of [...new Set([...Object.keys(cur), ...Object.keys(b)])].sort()) {
      const c = cur[path] ?? 0;
      const bb = b[path] ?? 0;
      if (c > bb) added.push(`[${word}] ${path}: ${c} use(s), baseline ${bb}`);
      else if (c < bb) stale.push(`[${word}] ${path}: ${c} use(s), baseline ${bb}`);
    }
  }
  return { added, stale };
}

function sortHits(h: Hits): Hits {
  const out: Hits = {};
  for (const w of Object.keys(h).sort()) {
    out[w] = {};
    for (const p of Object.keys(h[w]).sort()) out[w][p] = h[w][p];
  }
  return out;
}

function selfTest(spec: Spec): number {
  const dir = mkdtempSync(join(tmpdir(), "retired-words-"));
  try {
    execFileSync("git", ["init", "-q", dir]);
    mkdirSync(join(dir, "migrations"));
    writeFileSync(join(dir, "migrations", "clean.sql"), "select * from deprecated.retired_example;\nselect * from projects.tasks;\n");
    execFileSync("git", ["-C", dir, "add", "-A"]);
    const green = compare(scanText(dir, spec), { static: {} }).added;
    writeFileSync(join(dir, "migrations", "planted.sql"), "select * from graveyard.x;\ncreate schema workspace;\n");
    execFileSync("git", ["-C", dir, "add", "-A"]);
    const red = compare(scanText(dir, spec), { static: {} }).added;
    const okGreen = green.length === 0;
    const okRed = red.some((x) => x.startsWith("[graveyard]")) && red.some((x) => x.startsWith("[workspace-schema]"));
    console.log(`self-test GREEN on clean text: ${okGreen ? "PASS" : "FAIL"} ${JSON.stringify(green)}`);
    console.log(`self-test RED on planted text: ${okRed ? "PASS" : "FAIL"} ${JSON.stringify(red)}`);
    return okGreen && okRed ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(): number {
  const root = resolve(arg("--root") ?? repoRoot());
  const wordsFile = findWords(root);
  if (!wordsFile) {
    console.log("🚨 UNMEASURED: no retired-words.json (pass --words, set RETIRED_WORDS_FILE, or check out common-docs beside this repo).");
    return 2;
  }
  const spec = loadWords(wordsFile);
  if (argv.includes("--self-test")) return selfTest(spec);

  const baselinePath = resolve(arg("--baseline") ?? join(root, "scripts", "retired-words-baseline.json"));
  const current = scanText(root, spec);
  if (argv.includes("--list")) {
    for (const [word, files] of Object.entries(sortHits(current)))
      for (const [path, n] of Object.entries(files)) console.log(`${word}\t${n}\t${path}`);
    return 0;
  }
  const old: Baseline | null = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;

  if (argv.includes("--write-baseline")) {
    if (!old) {
      const seed = process.env.MATRX_RATCHET_SEED ?? "";
      if (!seed || resolve(seed) !== baselinePath) {
        console.log(`🚨 no baseline at ${baselinePath}; seeding a NEW one needs MATRX_RATCHET_SEED=${baselinePath}`);
        return 1;
      }
    } else {
      const { added } = compare(current, old);
      if (added.length) {
        console.log("🚨 refusing to widen the baseline — these are NEW uses; fix them:");
        for (const x of added) console.log(`  ✗ ${x}`);
        return 1;
      }
    }
    const doc = {
      $comment:
        "Shrink-only baseline of the retired-words guard (check-retired-words.ts / check_retired_words.py). Every entry is an EXISTING use of a retired word; it only ever gets smaller. A new use is fixed, never added here.",
      words_file: "common-docs/meta/scripts/retired-words.json",
      static: sortHits(current),
    };
    writeFileSync(baselinePath, JSON.stringify(doc, null, 2) + "\n");
    console.log(`baseline written: ${baselinePath}`);
    return 0;
  }

  if (!old) {
    console.log(`🚨 no baseline at ${baselinePath} — seed it once with MATRX_RATCHET_SEED=${baselinePath} pnpm check:retired-words --write-baseline`);
    return 1;
  }
  const { added, stale } = compare(current, old);
  if (added.length || stale.length) {
    if (added.length) {
      console.log("🚨 RETIRED WORD USED (Data Doctrine R16 — one name, renamed completely):");
      for (const x of added) console.log(`  ✗ ${x}`);
      console.log("  Use the replacement named in retired-words.json; never add the use to the baseline.");
    }
    if (stale.length) {
      console.log("🚨 STALE BASELINE — uses were removed; record the shrink:");
      for (const x of stale) console.log(`  ✗ ${x}`);
      console.log("  pnpm check:retired-words --write-baseline");
    }
    return 1;
  }
  console.log(`✅ retired words: no new use (words from ${wordsFile}).`);
  return 0;
}

process.exit(main());
