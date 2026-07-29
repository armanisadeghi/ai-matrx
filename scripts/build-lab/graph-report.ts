#!/usr/bin/env npx tsx
/**
 * graph-report.ts — the build-graph "type checker".
 *
 * THE LAW IT ENFORCES (learned 2026-07-28, D115 + the failed A-E probes):
 *   build cost ≈ Σ over modules of (module's transitive graph size × number of
 *   entry contexts that compile it). The ONLY move that wins is reducing the
 *   multiplicity of heavy subgraphs. "Make it dynamic" and "make it static"
 *   are both wrong half the time — each optimizes one side of the trade while
 *   detonating the other. This report puts the actual multiplication in front
 *   of you so nobody has to guess again.
 *
 * What it computes, in seconds, with NO build:
 *   1. THE COMPILE BILL — top first-party clusters ranked by
 *      closureSize × entryContexts (the thing a change must reduce).
 *   2. DYNAMIC-EDGE RISK — every `import(...)` promise-form edge ranked by
 *      (importer's entry-context reach × target closure size): the D115 shape.
 *      HIGH = both huge (a detonator), LOW = leaf-to-leaf (fine).
 *   3. Summary counts for release-gate diffing (--json).
 *
 * Usage:
 *   pnpm lab:graph                  # human tables
 *   pnpm lab:graph --json out.json # machine output (for diffs across refs)
 *   pnpm lab:graph --top 60        # more rows
 *
 * It reads the working tree (or any checkout it's run inside — the experiment
 * runner calls it inside worktrees). Static analysis only: regex import scan +
 * tsconfig-style resolution of `@/` and relative specifiers. `import type` is
 * excluded (erased). npm packages are ignored — the 2026-07 audit showed the
 * leaks are FIRST-PARTY graphs, not vendors.
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const ROOT = resolve(__dirname, "../..");
const SCAN_DIRS = ["app", "features", "components", "lib", "hooks", "utils", "providers", "constants", "types"];
const EXTS = [".ts", ".tsx"];
const SKIP_DIR = /(^|\/)(__tests__|node_modules|\.next[^/]*|_.*_build_excluded)(\/|$)/;
const ENTRY_RE = /\/(page|layout|template|route|loading|error|not-found)\.(dev\.)?tsx?$/;

const args = process.argv.slice(2);
const TOP = Number(args[args.indexOf("--top") + 1]) || 40;
const jsonIdx = args.indexOf("--json");
const JSON_OUT = jsonIdx >= 0 ? args[jsonIdx + 1] : null;

// ── scan files ───────────────────────────────────────────────────────────────
function walk(dir: string, out: string[]) {
  let names: string[];
  try { names = readdirSync(dir); } catch { return; }
  for (const n of names) {
    const p = join(dir, n);
    if (SKIP_DIR.test(p)) continue;
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.some((e) => n.endsWith(e)) && !n.endsWith(".d.ts")) out.push(p);
  }
}
const files: string[] = [];
for (const d of SCAN_DIRS) walk(join(ROOT, d), files);
const fileSet = new Set(files.map((f) => f.slice(ROOT.length + 1)));

// ── resolution ───────────────────────────────────────────────────────────────
const resolveCache = new Map<string, string | null>();
function resolveSpec(fromRel: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = join(dirname(fromRel), spec);
  else return null; // npm package
  const key = base;
  if (resolveCache.has(key)) return resolveCache.get(key)!;
  const candidates = [base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx", base];
  let hit: string | null = null;
  for (const c of candidates) {
    const norm = c.split("/").filter((s) => s !== ".").join("/");
    if (fileSet.has(norm)) { hit = norm; break; }
  }
  resolveCache.set(key, hit);
  return hit;
}

// ── parse imports ────────────────────────────────────────────────────────────
// static: import ... from 'x' | import 'x' | export ... from 'x'  (skip `import type`)
const STATIC_RE = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[\s\S]*?from\s+)?["']([^"'\n]+)["']/g;
const DYNAMIC_RE = /import\(\s*(?:\/\*[^*]*\*\/\s*)?["']([^"'\n]+)["']\s*\)/g;

type Edge = { from: string; to: string; spec: string };
const staticAdj = new Map<string, string[]>();
const dynamicEdges: Edge[] = [];
for (const abs of files) {
  const rel = abs.slice(ROOT.length + 1);
  let src: string; try { src = readFileSync(abs, "utf8"); } catch { continue; }
  const outs: string[] = [];
  let m: RegExpExecArray | null;
  STATIC_RE.lastIndex = 0;
  while ((m = STATIC_RE.exec(src))) {
    if (m[2]) continue; // import type / export type — erased
    const to = resolveSpec(rel, m[3]);
    if (to && to !== rel) outs.push(to);
  }
  DYNAMIC_RE.lastIndex = 0;
  while ((m = DYNAMIC_RE.exec(src))) {
    const to = resolveSpec(rel, m[1]);
    if (to && to !== rel) dynamicEdges.push({ from: rel, to, spec: m[1] });
  }
  staticAdj.set(rel, [...new Set(outs)]);
}

// ── closures ─────────────────────────────────────────────────────────────────
function closure(start: string): Set<string> {
  const seen = new Set<string>([start]);
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nxt of staticAdj.get(cur) ?? []) if (!seen.has(nxt)) { seen.add(nxt); stack.push(nxt); }
  }
  return seen;
}
const closureSize = new Map<string, number>();
for (const f of fileSet) closureSize.set(f, 0);
// exact closure sizes (memo-free BFS per module; ~seconds at repo scale)
for (const f of fileSet) closureSize.set(f, closure(f).size);

// ── entry contexts ───────────────────────────────────────────────────────────
const entries = [...fileSet].filter((f) => f.startsWith("app/") && ENTRY_RE.test("/" + f));
const contextCount = new Map<string, number>();
for (const e of entries) for (const mod of closure(e)) contextCount.set(mod, (contextCount.get(mod) ?? 0) + 1);

// ── report 1: the compile bill ───────────────────────────────────────────────
type BillRow = { module: string; size: number; contexts: number; bill: number };
const bill: BillRow[] = [...fileSet]
  .map((f) => ({ module: f, size: closureSize.get(f)!, contexts: contextCount.get(f) ?? 0, bill: closureSize.get(f)! * (contextCount.get(f) ?? 0) }))
  .filter((r) => r.bill > 0)
  .sort((a, b) => b.bill - a.bill);
// collapse: skip rows whose bill is dominated by an already-listed ancestor?
// v1 keeps it raw — the top rows ARE the load-bearing facts.

// ── report 2: dynamic-edge risk ──────────────────────────────────────────────
type RiskRow = Edge & { importerContexts: number; targetSize: number; product: number; tier: string };
const risk: RiskRow[] = dynamicEdges
  .map((e) => {
    const importerContexts = contextCount.get(e.from) ?? 0;
    const targetSize = closureSize.get(e.to) ?? 0;
    const product = importerContexts * targetSize;
    const tier = importerContexts >= 100 && targetSize >= 100 ? "HIGH" : importerContexts >= 100 || targetSize >= 100 ? "MED" : "LOW";
    return { ...e, importerContexts, targetSize, product, tier };
  })
  .sort((a, b) => b.product - a.product);

// ── output ───────────────────────────────────────────────────────────────────
const summary = {
  modules: fileSet.size,
  entries: entries.length,
  staticEdges: [...staticAdj.values()].reduce((n, a) => n + a.length, 0),
  dynamicEdges: dynamicEdges.length,
  totalBill: bill.reduce((n, r) => n + r.bill, 0),
  highRiskDynamicEdges: risk.filter((r) => r.tier === "HIGH").length,
};

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ summary, bill: bill.slice(0, 500), dynamicEdges: risk }, null, 1));
  console.log(`wrote ${JSON_OUT}`);
}

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(`\n━━ BUILD-GRAPH REPORT ━━ ${summary.modules} modules · ${summary.entries} entries · ${summary.staticEdges} static edges · ${summary.dynamicEdges} dynamic edges`);
console.log(`   TOTAL COMPILE BILL (Σ size×contexts): ${summary.totalBill.toLocaleString()} module-compilations\n`);

console.log(`── 1. THE COMPILE BILL — reduce these products or nothing improves ──`);
console.log(pad("BILL", 10) + pad("SIZE", 6) + pad("CTX", 6) + "MODULE");
for (const r of bill.slice(0, TOP)) console.log(pad(r.bill.toLocaleString(), 10) + pad(r.size, 6) + pad(r.contexts, 6) + r.module);

console.log(`\n── 2. DYNAMIC-EDGE RISK — the D115 shape: importer-reach × target-size ──`);
console.log(pad("TIER", 6) + pad("PRODUCT", 10) + pad("CTX", 6) + pad("TSIZE", 7) + "IMPORTER → TARGET");
for (const r of risk.slice(0, TOP)) console.log(pad(r.tier, 6) + pad(r.product.toLocaleString(), 10) + pad(r.importerContexts, 6) + pad(r.targetSize, 7) + `${r.from} → ${r.to}`);

console.log(`\nHIGH-tier dynamic edges: ${summary.highRiskDynamicEdges} (each is a candidate detonator — invert via callback registry or route, never static-inline into a wide importer)`);
console.log(`Compare refs: run with --json in two worktrees and diff the summaries/bills.\n`);
