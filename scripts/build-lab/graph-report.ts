#!/usr/bin/env npx tsx
/**
 * graph-report.ts — the build-graph "type checker".
 *
 * WHAT THE METRICS MEAN — calibrated against ground truth (2026-07-28):
 *   • THE COMPILE BILL (size × entry-contexts) does NOT model Turbopack
 *     compile time or build RSS. Measured: a −62% bill cut (the ProTextarea
 *     gate) produced ZERO change in compile time and RSS — Turbopack compiles
 *     each module ONCE in a unified graph, not once per reaching entry. The
 *     bill DOES model CLIENT-BUNDLE duplication: which routes ship a cluster
 *     in first-load JS. Use it for page-weight/UX work, not build-cost work.
 *   • Build-cost levers that ground truth supports: total unique module count,
 *     and D115-class pathological edges (dynamic import of a CYCLE-carrying
 *     mega-cluster from a ubiquitous module: +14GB RSS, +50% compile,
 *     bisect-proven). Report 2/3 exist to catch that class.
 *   • "Make it dynamic" and "make it static" are both wrong half the time.
 *     Measure, then move; ground-truth with lab:run before believing anything.
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
const whyIdx = args.indexOf("--why");
const WHY = whyIdx >= 0 ? args[whyIdx + 1] : null; // substring of a module path

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
// Clause captured so ALL-inline-type imports (`import { type A, type B } from`)
// can be dropped too — TS erases those entirely, and counting them produced
// false-positive "static importers" (caught by Arman on artifact-renderers,
// whose 29 static importers were almost all type-only).
const STATIC_RE = /(?:^|\n)\s*(import|export)\s+(type\s+)?([\s\S]*?)?\bfrom\s+["']([^"'\n]+)["']|(?:^|\n)\s*import\s+["']([^"'\n]+)["']/g;
/** true if an import/export clause is fully type-erased (no runtime edge). */
function isTypeOnlyClause(clause: string | undefined): boolean {
  if (!clause) return false;
  const m = clause.match(/^\s*\{([\s\S]*)\}\s*$/); // named-only clause
  if (!m) return false; // default/namespace import present → value edge
  const items = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  return items.length > 0 && items.every((s) => /^type\s/.test(s));
}
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
    const spec = m[4] ?? m[5];
    if (!spec) continue;
    if (m[2]) continue; // `import type` / `export type` — erased
    if (m[4] && isTypeOnlyClause(m[3])) continue; // `import { type A, type B }` — erased
    const to = resolveSpec(rel, spec);
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

// ── --why mode: trace HOW entries reach a module ─────────────────────────────
if (WHY) {
  const target = [...fileSet].find((f) => f.includes(WHY));
  if (!target) { console.error(`no module matching "${WHY}"`); process.exit(1); }
  const importersOf = new Map<string, string[]>();
  for (const [from, outs] of staticAdj) for (const to of outs) {
    if (!importersOf.has(to)) importersOf.set(to, []);
    importersOf.get(to)!.push(from);
  }
  const directImporters = (importersOf.get(target) ?? [])
    .map((f) => ({ f, ctx: contextCount.get(f) ?? 0 }))
    .sort((a, b) => b.ctx - a.ctx);
  const reaching: string[] = [];
  const samplePaths: string[][] = [];
  for (const e of entries) {
    // BFS with parents to find a shortest path e → target
    const parent = new Map<string, string>();
    const q = [e]; const seen = new Set([e]); let found = false;
    while (q.length && !found) {
      const cur = q.shift()!;
      for (const nxt of staticAdj.get(cur) ?? []) {
        if (seen.has(nxt)) continue;
        seen.add(nxt); parent.set(nxt, cur);
        if (nxt === target) { found = true; break; }
        q.push(nxt);
      }
    }
    if (found) {
      reaching.push(e);
      if (samplePaths.length < 6) {
        const path = [target]; let cur = target;
        while (parent.has(cur)) { cur = parent.get(cur)!; path.unshift(cur); }
        samplePaths.push(path);
      }
    }
  }
  console.log(`\n━━ WHY: ${target} ━━ size=${closureSize.get(target)} · reached by ${reaching.length}/${entries.length} entries\n`);
  console.log(`── direct static importers (by their own entry reach) ──`);
  for (const d of directImporters.slice(0, 25)) console.log(`  ctx=${String(d.ctx).padEnd(5)} ${d.f}`);
  console.log(`\n── sample shortest chains (entry → … → target) ──`);
  for (const p of samplePaths) console.log("  " + p.join("\n    → ") + "\n");
  const byGroup = new Map<string, number>();
  for (const e of reaching) { const g = e.split("/").slice(0, 3).join("/"); byGroup.set(g, (byGroup.get(g) ?? 0) + 1); }
  console.log(`── reaching entries by route area ──`);
  for (const [g, n] of [...byGroup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(n).padEnd(5)} ${g}`);
  process.exit(0);
}

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

// ── report 3: per-target split multiplicity (the front-door integrity check) ─
// A heavy module with ONE dynamic importer is a proper front door. The same
// module with ≥2 dynamic importers is compiled into MULTIPLE chunk groups
// (split duplication — the fragmentation incident class). A module with BOTH
// dynamic and static importers is a BYPASS: someone imports statically what
// the rest of the app loads through a gate, dragging it into their own graph.
const staticImportersOf = new Map<string, Set<string>>();
for (const [from, outs] of staticAdj) for (const to of outs) {
  if (!staticImportersOf.has(to)) staticImportersOf.set(to, new Set());
  staticImportersOf.get(to)!.add(from);
}
type TargetRow = {
  target: string; targetSize: number;
  dynImporters: number; dynCallSites: number; staticImporters: number;
  sumImporterCtx: number; verdict: string; score: number;
};
const byTarget = new Map<string, Edge[]>();
for (const e of dynamicEdges) {
  if (!byTarget.has(e.to)) byTarget.set(e.to, []);
  byTarget.get(e.to)!.push(e);
}
const targets: TargetRow[] = [...byTarget.entries()].map(([target, edges]) => {
  const importers = new Set(edges.map((e) => e.from));
  const statics = staticImportersOf.get(target)?.size ?? 0;
  const targetSize = closureSize.get(target) ?? 0;
  const sumImporterCtx = [...importers].reduce((n, f) => n + (contextCount.get(f) ?? 0), 0);
  const verdict =
    statics > 0 && importers.size > 0 ? "BYPASS" :
    importers.size >= 2 ? "SPLIT-DUP" : "front-door";
  // score: how much duplicated compilation this target's split points cause.
  // front-door (1 importer, 0 static) scores by nothing extra → 0-ish rank.
  const extraGroups = importers.size - 1 + (statics > 0 ? 1 : 0);
  return { target, targetSize, dynImporters: importers.size, dynCallSites: edges.length,
    staticImporters: statics, sumImporterCtx, verdict, score: extraGroups * targetSize };
}).sort((a, b) => b.score - a.score || b.targetSize - a.targetSize);

// ── output ───────────────────────────────────────────────────────────────────
const summary = {
  modules: fileSet.size,
  entries: entries.length,
  staticEdges: [...staticAdj.values()].reduce((n, a) => n + a.length, 0),
  dynamicEdges: dynamicEdges.length,
  totalBill: bill.reduce((n, r) => n + r.bill, 0),
  highRiskDynamicEdges: risk.filter((r) => r.tier === "HIGH").length,
  splitDupTargets: targets.filter((t) => t.verdict === "SPLIT-DUP").length,
  bypassTargets: targets.filter((t) => t.verdict === "BYPASS").length,
};

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ summary, bill: bill.slice(0, 500), dynamicEdges: risk, targets }, null, 1));
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

console.log(`\n── 3. SPLIT MULTIPLICITY — how many doors does each dynamic target have? ──`);
console.log(`   front-door = 1 dynamic importer, 0 static (CORRECT — MarkdownStreamImpl's shape)`);
console.log(`   SPLIT-DUP  = ≥2 dynamic importers → same cluster compiled into multiple chunk groups`);
console.log(`   BYPASS     = dynamic AND static importers → someone drags the gated module statically`);
console.log(pad("VERDICT", 11) + pad("SCORE", 9) + pad("TSIZE", 7) + pad("DYN", 5) + pad("STAT", 6) + "TARGET");
for (const t of targets.filter((t) => t.verdict !== "front-door").slice(0, TOP))
  console.log(pad(t.verdict, 11) + pad(t.score.toLocaleString(), 9) + pad(t.targetSize, 7) + pad(t.dynImporters, 5) + pad(t.staticImporters, 6) + t.target);
const fd = targets.filter((t) => t.verdict === "front-door").length;
console.log(`(${fd} targets are clean front-doors and not listed; SCORE = extra chunk groups × target size)`);

console.log(`\nHIGH-tier dynamic edges: ${summary.highRiskDynamicEdges} (each is a candidate detonator — invert via callback registry or route, never static-inline into a wide importer)`);
console.log(`Compare refs: run with --json in two worktrees and diff the summaries/bills.\n`);
