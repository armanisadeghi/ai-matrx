#!/usr/bin/env npx tsx
/**
 * Legacy offering references: does any code still treat the topic tables as
 * the company's offerings?
 *
 * WHAT IT PROTECTS: the brand-offerings cutover
 * (docs/db_rebuild/proposals/brand-offerings-cutover.md). A company offering is
 * `web.brand_offering`; a site exposes it through `web.site_offering`; a
 * keyword is placed on it through `seo.site_keyword_offering`; its worth is
 * `seo.site_offering_value`. `seo.topic` / `seo.keyword_topic` /
 * `seo.site_topic_value` and the `gsc_topic_*` RPC family are the old, global,
 * cross-tenant model and keep only genuine taxonomy (D5).
 *
 * HOW IT MEASURES: every tracked source file in this repository and in the
 * sibling aidream checkout is scanned for the legacy identifiers below. The
 * count per file is compared with `scripts/offering-topic-refs-baseline.json`,
 * the census taken when the cutover began. The baseline ONLY SHRINKS:
 *   - a file that is not in the baseline and references a legacy identifier
 *     FAILS (a new consumer of the old model);
 *   - a file whose count grew FAILS;
 *   - a file whose count shrank, or disappeared, is reported so the baseline
 *     can be tightened with --write-baseline.
 * A file that legitimately needs the taxonomy half of these tables after the
 * cutover is entered in the baseline with a reason, never silently.
 *
 * PROVEN FAILING: --self-test runs the comparison over the real census plus a
 * synthetic new file that reads `seo.keyword_topic`, and over a synthetic file
 * whose count grew; both must fail, and the real census must pass.
 *
 *   pnpm check:offering-topic-refs              # loud, exit 0 on findings
 *   pnpm check:offering-topic-refs:strict       # exit 1 on any finding
 *   pnpm check:offering-topic-refs:self-test    # RED then GREEN
 *   tsx scripts/check-offering-topic-refs.ts --write-baseline   # shrink only
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AIDREAM = resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream"));
const BASELINE = resolve(ROOT, "scripts/offering-topic-refs-baseline.json");
const STRICT = process.argv.includes("--strict");
const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

/** The legacy offering model, by every name a consumer reaches it through. */
export const LEGACY =
  /\b(keyword_topic|site_topic_value|keyword_placement_resolve|gsc_keyword_topics_for|gsc_set_keyword_topic|gsc_set_topic_value|gsc_confirm_keyword_topic|gsc_topic_[a-z_]+|topic_placement_status|KeywordTopic|SiteTopicValue)\b|\.from\(\s*["']topic["']\s*\)/g;

/** Generated, historical, or documentary paths: not consumers. */
const EXCLUDE: RegExp[] = [
  /(^|\/)migrations\//,
  /(^|\/)db\/migrations\//,
  /\.md$/,
  /(^|\/)docs\//,
  /^types\/database\.types\.ts$/,
  /^types\/python-generated\//,
  /^apps\/dashboard\/src\/types\/database\.types\.ts$/,
  /(^|\/)generated\//,
  /\.generated\.(ts|json|py)$/,
  /^scripts\/schema-check\/current-schema\.json$/,
  /^scripts\/shape\//,
  /^db\/schema_analysis\//,
  /^scripts\/offering-topic-refs-baseline\.json$/,
  /^scripts\/check-offering-topic-refs\.ts$/,
  // The cutover's own guards name the legacy relations in order to test them.
  /^scripts\/check-offering-(tenancy|resolver-equivalence)\.ts$/,
  /\.(png|jpg|svg|ico|lock)$/,
];

const SOURCE = /\.(ts|tsx|js|mjs|py|sql|json)$/;

type Census = Record<string, number>;

function tracked(repo: string, prefix: string): string[] {
  if (!existsSync(repo)) return [];
  return execFileSync("git", ["-C", repo, "ls-files"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    .split("\n")
    .filter((p) => p && SOURCE.test(p) && !EXCLUDE.some((re) => re.test(p)))
    .map((p) => `${prefix}${p}`);
}

export function countLegacy(text: string): number {
  return (text.match(LEGACY) ?? []).length;
}

function census(): Census {
  const out: Census = {};
  for (const [repo, prefix] of [
    [ROOT, "matrx-frontend/"],
    [AIDREAM, "aidream/"],
  ] as const) {
    for (const path of tracked(repo, prefix)) {
      const abs = resolve(repo, path.slice(prefix.length));
      let text: string;
      try {
        text = readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      const n = countLegacy(text);
      if (n > 0) out[path] = n;
    }
  }
  return out;
}

export interface Verdict {
  added: string[];
  grew: Array<{ file: string; from: number; to: number }>;
  shrank: Array<{ file: string; from: number; to: number }>;
}

export function compare(baseline: Census, now: Census): Verdict {
  const v: Verdict = { added: [], grew: [], shrank: [] };
  for (const [file, n] of Object.entries(now)) {
    const was = baseline[file];
    if (was === undefined) v.added.push(file);
    else if (n > was) v.grew.push({ file, from: was, to: n });
    else if (n < was) v.shrank.push({ file, from: was, to: n });
  }
  for (const [file, was] of Object.entries(baseline)) {
    if (now[file] === undefined) v.shrank.push({ file, from: was, to: 0 });
  }
  return v;
}

function readBaseline(): { census: Census; reasons: Record<string, string> } {
  if (!existsSync(BASELINE)) return { census: {}, reasons: {} };
  const raw = JSON.parse(readFileSync(BASELINE, "utf8")) as { files: Record<string, { count: number; reason: string }> };
  const censusOut: Census = {};
  const reasons: Record<string, string> = {};
  for (const [file, entry] of Object.entries(raw.files)) {
    censusOut[file] = entry.count;
    reasons[file] = entry.reason;
  }
  return { census: censusOut, reasons };
}

function writeBaseline(now: Census, previous: { census: Census; reasons: Record<string, string> }) {
  const files: Record<string, { count: number; reason: string }> = {};
  for (const file of Object.keys(now).sort()) {
    const prior = previous.census[file];
    // Shrink only: a grown or new entry keeps the prior count and must be fixed, not blessed.
    if (prior !== undefined && now[file] > prior) {
      files[file] = { count: prior, reason: previous.reasons[file] };
      continue;
    }
    if (prior === undefined && Object.keys(previous.census).length > 0) continue;
    files[file] = {
      count: now[file],
      reason: previous.reasons[file] ?? "legacy offering consumer at the start of the brand-offerings cutover; repoint to the canonical offering model",
    };
  }
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ note: "Shrink-only census of legacy offering references (scripts/check-offering-topic-refs.ts).", files }, null, 2)}\n`,
  );
}

function report(v: Verdict, reasons: Record<string, string>) {
  for (const f of v.added) console.log(`  ${C.r}[NEW ]${C.x} ${f} ${C.d}references the legacy offering model and is not in the census${C.x}`);
  for (const g of v.grew) console.log(`  ${C.r}[GREW]${C.x} ${g.file} ${g.from} -> ${g.to} ${C.d}${reasons[g.file] ?? ""}${C.x}`);
  for (const s of v.shrank) console.log(`  ${C.g}[DOWN]${C.x} ${s.file} ${s.from} -> ${s.to} ${C.d}(tighten with --write-baseline)${C.x}`);
}

function selfTest(): boolean {
  const base = readBaseline().census;
  const real = compare(base, base);
  const fileOne = Object.keys(base)[0];
  const withNew = { ...base, "matrx-frontend/features/marketing/new-offering-reader.ts": countLegacy(`db.schema("seo").from("keyword_topic")`) };
  const withGrowth = fileOne ? { ...base, [fileOne]: base[fileOne] + 1 } : base;
  const redNew = compare(base, withNew);
  const redGrow = compare(base, withGrowth);
  const ok =
    Object.keys(base).length > 0 &&
    real.added.length === 0 &&
    real.grew.length === 0 &&
    redNew.added.length === 1 &&
    redGrow.grew.length === 1;
  console.log(`${ok ? C.g : C.r}SELF-TEST ${ok ? "PASSED" : "FAILED"}${C.x}: census ${Object.keys(base).length} files · GREEN new=${real.added.length} grew=${real.grew.length} · RED new=${redNew.added.length} grew=${redGrow.grew.length}`);
  return ok;
}

function main() {
  if (process.argv.includes("--self-test")) exitAfterDrain(selfTest() ? 0 : 1);
  if (!existsSync(AIDREAM)) {
    console.error(`${C.r}UNMEASURED${C.x}: the aidream checkout is not at ${AIDREAM}`);
    exitAfterDrain(STRICT ? 1 : 0);
  }
  const previous = readBaseline();
  const now = census();
  if (process.argv.includes("--write-baseline")) {
    writeBaseline(now, previous);
    console.log(`baseline written: ${Object.keys(now).length} files, ${Object.values(now).reduce((a, b) => a + b, 0)} references`);
    return;
  }
  const v = compare(previous.census, now);
  const total = Object.values(now).reduce((a, b) => a + b, 0);
  console.log(
    `${C.b}LEGACY OFFERING REFERENCES${C.x} ${Object.keys(now).length} files · ${total} references · new ${v.added.length} · grew ${v.grew.length} · shrank ${v.shrank.length}`,
  );
  report(v, previous.reasons);
  if ((v.added.length || v.grew.length) && STRICT) exitAfterDrain(1);
}

main();
