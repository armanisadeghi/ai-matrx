/**
 * THE FIRST-PARTY IMPORT GRAPH — one parser for every hand-written cycle guard.
 *
 * Static imports (`import … from`, `export … from`, bare `import "x"`), `import()` edges and
 * `new Worker(new URL(…))` edges, resolved through `source-roots.cjs` (the one answer for this
 * repo's roots and aliases). `import type` / `export type` / all-`type` named clauses are erased,
 * exactly as the compiler erases them. Test files, `__tests__` and `__mocks__` are not app code.
 *
 * Consumers: `check-worker-cycles.ts` (a worker may never reach its starter) and
 * `check-host-cycles.ts` (no static cycle through the content-ir host or matrx-envelope).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { aliasTarget, SOURCE_ROOTS } from "./source-roots.cjs";

const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const SKIP_DIR = /(^|\/)(node_modules|\.next[^/]*|__tests__|__mocks__)(\/|$)/;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// The clause never holds a quote or a semicolon: `[\s\S]*?` there let a bare `import "x"` be
// swallowed into the NEXT statement's match, so a side-effect edge was invisible (G13).
const STATIC_RE =
  /(?:^|\n)\s*(import|export)\s+(type\s+)?([^"';]*?)?\bfrom\s+["']([^"'\n]+)["']|(?:^|\n)\s*import\s+["']([^"'\n]+)["']/g;
const DYNAMIC_RE = /import\(\s*(?:\/\*[^*]*\*\/\s*)?["']([^"'\n]+)["']\s*\)/g;
const WORKER_RE = /new\s+(?:Shared)?Worker\s*\(\s*new\s+URL\s*\(\s*["']([^"'\n]+)["']\s*,\s*import\.meta\.url/g;

/** `static` = evaluated synchronously at module load (the only kind that can hit a TDZ). */
export type EdgeKind = "static" | "dynamic" | "worker";
export type Edge = { to: string; kind: EdgeKind };
export type ImportGraph = Map<string, Edge[]>;

function typeOnlyClause(clause: string | undefined): boolean {
  if (!clause) return false;
  const named = clause.match(/^\s*\{([\s\S]*)\}\s*$/);
  if (!named) return false;
  const items = named[1].split(",").map((s) => s.trim()).filter(Boolean);
  return items.length > 0 && items.every((s) => /^type\s/.test(s));
}

function walk(root: string, dir: string, out: string[]): void {
  let names: string[];
  try {
    names = readdirSync(join(root, dir));
  } catch {
    return;
  }
  for (const name of names) {
    const rel = dir ? `${dir}/${name}` : name;
    if (SKIP_DIR.test(rel)) continue;
    let st;
    try {
      st = statSync(join(root, rel));
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(root, rel, out);
    else if (EXTS.some((e) => name.endsWith(e)) && !name.endsWith(".d.ts") && !TEST_FILE.test(name)) out.push(rel);
  }
}

export function buildImportGraph(root: string): ImportGraph {
  const files: string[] = [];
  for (const dir of new Set(SOURCE_ROOTS as readonly string[])) walk(root, dir, files);
  const fileSet = new Set(files);

  const resolveSpec = (from: string, spec: string): string | null => {
    const aliased = aliasTarget(spec);
    let base: string;
    if (aliased !== null) base = aliased;
    else if (spec.startsWith(".")) base = posix.join(dirname(from), spec);
    else return null; // npm package — not first-party
    base = posix.normalize(base);
    const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => `${base}/index${e}`)];
    for (const c of candidates) if (fileSet.has(c)) return c;
    return null;
  };

  const graph: ImportGraph = new Map();
  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    const edges: Edge[] = [];
    let m: RegExpExecArray | null;
    STATIC_RE.lastIndex = 0;
    while ((m = STATIC_RE.exec(src))) {
      if (m[2] || typeOnlyClause(m[3])) continue;
      const to = resolveSpec(file, m[4] ?? m[5]);
      if (to) edges.push({ to, kind: "static" });
    }
    DYNAMIC_RE.lastIndex = 0;
    while ((m = DYNAMIC_RE.exec(src))) {
      const to = resolveSpec(file, m[1]);
      if (to) edges.push({ to, kind: "dynamic" });
    }
    WORKER_RE.lastIndex = 0;
    while ((m = WORKER_RE.exec(src))) {
      const to = resolveSpec(file, m[1]);
      if (to) edges.push({ to, kind: "worker" });
    }
    graph.set(file, edges);
  }
  return graph;
}

/**
 * The shortest path `from` →…→ `to` over edges `follow` accepts, `from` and `to` included;
 * null when there is none. `from === to` finds the shortest cycle through it.
 */
export function shortestPath(
  graph: ImportGraph,
  from: string,
  to: string,
  follow: (e: Edge) => boolean = () => true,
): string[] | null {
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const edge of graph.get(cur) ?? []) {
      if (!follow(edge)) continue;
      if (edge.to === to) {
        const path = [to];
        for (let at: string | null | undefined = cur; at; at = prev.get(at)) path.unshift(at);
        return path;
      }
      if (prev.has(edge.to)) continue;
      prev.set(edge.to, cur);
      queue.push(edge.to);
    }
  }
  return null;
}
