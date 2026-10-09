#!/usr/bin/env npx tsx
/**
 * check-shell-eager-graph.ts — WHAT EVERY SIGNED-IN ROUTE DOWNLOADS BEFORE IT HYDRATES.
 *
 * Turbopack gives each layout ONE merged client chunk group: every client reference the layout's
 * SERVER graph reaches, plus the static client graph under each of them. Every <script async> in
 * the head of every (core) route comes from that group. On 2026-10-08 it was ~276 chunks /
 * 25.4 MB decoded on /notes, including a 2.2 MB Babel compiler (@babel/standalone via
 * @ai-matrx/code-runtime) that no shell surface uses until a person opens a code block or a
 * stored component.
 *
 * The model this guard computes (verified against the live deploy's chunk lists, lane AE):
 *   1. SERVER walk from the shell layouts: static AND `import()` edges, resolved with the
 *      react-server conditions. A module whose first statement is "use client" is a CLIENT
 *      REFERENCE: it is recorded and not descended. An `import()` in a SERVER module of a client
 *      module is still a client reference — Turbopack has no async boundary on the server side
 *      (route-menu-registry.ts's menus all ship eagerly for this reason).
 *   2. CLIENT walk from every client reference: static edges only (`import()` / next/dynamic /
 *      React.lazy / lazyOverlay are real async chunks on the client), resolved with the browser
 *      conditions and next.config.js's turbopack.resolveAlias (the chat registration profile
 *      alias is where Babel came in).
 * Imports are read from esbuild's TRANSFORMED output, so type-only and unused imports are erased
 * exactly as SWC erases them.
 *
 * Usage:
 *   pnpm check:shell-eager-graph              # fail if a HEAVY module is in the eager set
 *   pnpm check:shell-eager-graph --why <substr>  # print the import chain to a module
 *   pnpm check:shell-eager-graph --report     # biggest packages in the eager set
 *   pnpm check:shell-eager-graph --self-test  # proves the guard goes red on a planted edge
 */
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, resolve, dirname, extname } from "node:path";
import { tmpdir } from "node:os";
import * as esbuild from "esbuild";

const ROOT = resolve(__dirname, "..");

/** The shell: every (core) route renders these two layouts. */
const SHELL_ENTRIES = ["app/layout.tsx", "app/(core)/layout.tsx"];

/**
 * HEAVY: loaded only when a person uses the feature, never by the shell. A match is a module path
 * substring (node_modules paths are matched after the last `node_modules/`).
 */
export const HEAVY: ReadonlyArray<{ match: RegExp; why: string }> = [
  { match: /^@babel\/standalone\//, why: "Babel compiler (2.2 MB) — code blocks, stored components, Applets" },
  { match: /^@ai-matrx\/code-runtime\/dist\/(index|frame|transform)\.js$/, why: "code-runtime compiler entries (carry Babel)" },
  { match: /^@ai-matrx\/applets\/dist\/frame\.js$/, why: "Applet frame (carries the compiler)" },
  { match: /^monaco-editor\//, why: "Monaco editor" },
  { match: /^@monaco-editor\//, why: "Monaco editor loader" },
  { match: /^mermaid\//, why: "Mermaid diagrams" },
  { match: /^three\//, why: "three.js" },
  { match: /^xlsx\//, why: "SheetJS" },
  { match: /^pdfjs-dist\//, why: "PDF.js" },
  { match: /^katex\//, why: "KaTeX (~680 KB) — markdown math, loaded with @ai-matrx/print/markdown on first use" },
];

/** next.config.js turbopack.resolveAlias, for the production (non-demos) profile. Kept in sync
 *  by `assertAliasesMatchConfig` — a changed alias in next.config.js fails this guard by name. */
const ALIASES: Record<string, string> = {
  "@/providers/chatUiRegistrationProfile":
    process.env.MATRX_PROFILE === "demos" ? "@/providers/chatUiRegistrationBase" : "@/providers/chatUiRegistration",
  "@ai-matrx/kit/text": "@/lib/compat/kit-text",
  "@ai-matrx/kit/json-extract": "@ai-matrx/content-ir/json-extract",
  jspdf: "jspdf/dist/jspdf.es.min.js",
};

function assertAliasesMatchConfig(): void {
  const cfg = readFileSync(join(ROOT, "next.config.js"), "utf8");
  const needles = [
    `: "./providers/chatUiRegistration.ts"`,
    `"@ai-matrx/kit/text": "./lib/compat/kit-text.ts"`,
    `"@ai-matrx/kit/json-extract": "@ai-matrx/content-ir/json-extract"`,
    `jspdf: "jspdf/dist/jspdf.es.min.js"`,
  ];
  const missing = needles.filter((n) => !cfg.includes(n));
  if (missing.length) {
    console.error(
      `check:shell-eager-graph: next.config.js turbopack.resolveAlias changed — update ALIASES in this script.\n  missing: ${missing.join("\n  missing: ")}`,
    );
    process.exit(2);
  }
}

const CODE = /\.(m?[jt]sx?|cjs)$/;
const USE_CLIENT = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/;
const STATIC_RE = /(?:^|\n)(?:import|export)\b([^"';]*?)\bfrom\s*["']([^"'\n]+)["']|(?:^|\n)import\s*["']([^"'\n]+)["']/g;
const DYNAMIC_RE = /\bimport\(\s*["']([^"'\n]+)["']\s*\)/g;
const REQUIRE_RE = /\brequire\(\s*["']([^"'\n]+)["']\s*\)/g;
const BUILTINS = new Set(builtinModules);

type Kind = "static" | "dynamic";
type Spec = { spec: string; kind: Kind };

const specCache = new Map<string, Spec[]>();
async function importsOf(file: string): Promise<{ specs: Spec[]; client: boolean }> {
  let src: string;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    return { specs: [], client: false };
  }
  const client = USE_CLIENT.test(src);
  const hit = specCache.get(file);
  if (hit) return { specs: hit, client };
  const ext = extname(file);
  const loader: esbuild.Loader =
    ext === ".ts" || ext === ".mts" || ext === ".cts" ? "ts" : ext === ".tsx" ? "tsx" : "jsx";
  let code = src;
  try {
    code = (await esbuild.transform(src, { loader, format: "esm", jsx: "automatic", target: "esnext" })).code;
  } catch {
    // Unparseable as JSX (rare package build): scan the raw text.
  }
  const specs: Spec[] = [];
  for (const m of code.matchAll(STATIC_RE)) specs.push({ spec: (m[2] ?? m[3])!, kind: "static" });
  for (const m of code.matchAll(REQUIRE_RE)) specs.push({ spec: m[1]!, kind: "static" });
  for (const m of code.matchAll(DYNAMIC_RE)) specs.push({ spec: m[1]!, kind: "dynamic" });
  specCache.set(file, specs);
  return { specs, client };
}

/** A long-lived esbuild resolver (exact package `exports`/conditions + tsconfig paths). */
async function makeResolver(side: "server" | "client") {
  let api: esbuild.PluginBuild | null = null;
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let ready!: () => void;
  const isReady = new Promise<void>((r) => (ready = r));
  const build = esbuild.build({
    stdin: { contents: 'import "__keepalive__"', resolveDir: ROOT },
    bundle: true,
    write: false,
    logLevel: "silent",
    tsconfig: join(ROOT, "tsconfig.json"),
    platform: side === "server" ? "node" : "browser",
    conditions: side === "server" ? ["react-server", "node", "import", "default"] : ["browser", "import", "default"],
    mainFields: side === "server" ? ["module", "main"] : ["browser", "module", "main"],
    plugins: [
      {
        name: "keepalive",
        setup(b) {
          api = b;
          b.onResolve({ filter: /^__keepalive__$/ }, () => ({ path: "k", namespace: "keepalive" }));
          b.onLoad({ filter: /.*/, namespace: "keepalive" }, async () => {
            ready();
            await held;
            return { contents: "" };
          });
        },
      },
    ],
  });
  await isReady;
  const cache = new Map<string, string | null>();
  return {
    async resolve(spec: string, importer: string, kind: Kind): Promise<string | null> {
      const aliased = ALIASES[spec] ?? spec;
      if (aliased.startsWith("node:") || BUILTINS.has(aliased.split("/")[0]!)) return null;
      const dir = dirname(importer);
      const key = `${dir}\0${aliased}`;
      if (cache.has(key)) return cache.get(key)!;
      const r = await api!.resolve(aliased, {
        kind: kind === "dynamic" ? "dynamic-import" : "import-statement",
        importer,
        resolveDir: dir,
      });
      const out = r.errors.length || r.external || !CODE.test(r.path) ? null : r.path;
      cache.set(key, out);
      return out;
    },
    async close() {
      release();
      await build.catch(() => undefined);
    },
  };
}

type Graph = { parent: Map<string, string | null>; clientRefs: Set<string>; importers: Map<string, Set<string>> };

export async function eagerClientSet(entries: string[] = SHELL_ENTRIES): Promise<Graph> {
  const server = await makeResolver("server");
  const client = await makeResolver("client");
  try {
    const parent = new Map<string, string | null>();
    const clientRefs = new Set<string>();
    const importers = new Map<string, Set<string>>();
    const link = (from: string, to: string) => {
      let set = importers.get(to);
      if (!set) importers.set(to, (set = new Set()));
      set.add(from);
    };
    // 1. server walk
    const seenServer = new Set<string>();
    let frontier = entries.map((e) => join(ROOT, e));
    for (const f of frontier) seenServer.add(f);
    const serverParent = new Map<string, string | null>(frontier.map((f) => [f, null]));
    while (frontier.length) {
      const next: string[] = [];
      await Promise.all(
        frontier.map(async (file) => {
          const { specs } = await importsOf(file);
          const targets = await Promise.all(specs.map(({ spec, kind }) => server.resolve(spec, file, kind)));
          for (const to of targets) {
            if (to) link(file, to);
            if (!to || seenServer.has(to)) continue;
            seenServer.add(to);
            serverParent.set(to, file);
            const { client: isClient } = await importsOf(to);
            if (isClient) clientRefs.add(to);
            else next.push(to);
          }
        }),
      );
      frontier = next;
    }
    // 2. client walk (static edges only)
    for (const ref of clientRefs) {
      let p: string | null = ref;
      // carry the server chain for --why
      const chain: string[] = [];
      while (p) {
        chain.push(p);
        p = serverParent.get(p) ?? null;
      }
      for (let i = chain.length - 1; i >= 0; i--) if (!parent.has(chain[i]!)) parent.set(chain[i]!, chain[i + 1] ?? null);
    }
    frontier = [...clientRefs];
    while (frontier.length) {
      const next: string[] = [];
      await Promise.all(
        frontier.map(async (file) => {
          const { specs } = await importsOf(file);
          const targets = await Promise.all(
            specs.filter((s) => s.kind === "static").map(({ spec, kind }) => client.resolve(spec, file, kind)),
          );
          for (const to of targets) {
            if (to) link(file, to);
            if (!to || parent.has(to)) continue;
            parent.set(to, file);
            next.push(to);
          }
        }),
      );
      frontier = next;
    }
    // server-only modules are not shipped: drop them from the shipped set, keep them as chain links
    return { parent, clientRefs, importers };
  } finally {
    await server.close();
    await client.close();
  }
}

const rel = (p: string) => p.replace(ROOT + "/", "");
const pkgPath = (p: string) => {
  const i = p.lastIndexOf("node_modules/");
  return i >= 0 ? p.slice(i + "node_modules/".length) : rel(p);
};
const pkgName = (p: string) => {
  const i = p.lastIndexOf("node_modules/");
  if (i < 0) return "(app)";
  const parts = p.slice(i + 13).split("/");
  return parts[0]!.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]!;
};
function chainTo(g: Graph, file: string): string[] {
  const out: string[] = [];
  let p: string | null = file;
  while (p) {
    out.push(pkgPath(p));
    p = g.parent.get(p) ?? null;
  }
  return out.reverse();
}

export function heavyHits(g: Graph): Array<{ file: string; why: string }> {
  const hits: Array<{ file: string; why: string }> = [];
  for (const f of g.parent.keys()) {
    const p = pkgPath(f);
    for (const h of HEAVY) if (h.match.test(p)) hits.push({ file: f, why: h.why });
  }
  return hits;
}

async function selfTest(): Promise<void> {
  // A planted client module that statically imports the Babel compiler, reached from a planted
  // SERVER module through an `import()` (the route-menu-registry shape) — must go RED. The same
  // edge from a CLIENT module's `import()` is a real async chunk — must stay GREEN.
  const dir = mkdtempSync(join(ROOT, "tmp-eager-selftest-"));
  try {
    writeFileSync(join(dir, "heavy.tsx"), `"use client";\nimport { compileSource } from "@ai-matrx/code-runtime";\nexport default function H(){ return String(compileSource); }\n`);
    writeFileSync(join(dir, "server-registry.ts"), `export const load = () => import("./heavy");\n`);
    writeFileSync(join(dir, "client-lazy.tsx"), `"use client";\nexport const load = () => import("./heavy");\nexport default function C(){ return null; }\n`);
    writeFileSync(join(dir, "red.tsx"), `import "./server-registry";\nexport default function L(){ return null; }\n`);
    writeFileSync(join(dir, "green.tsx"), `import C from "./client-lazy";\nexport default function L(){ return <C/>; }\n`);
    const red = heavyHits(await eagerClientSet([rel(join(dir, "red.tsx"))]));
    const green = heavyHits(await eagerClientSet([rel(join(dir, "green.tsx"))]));
    const ok = red.some((h) => /babel/.test(h.file)) && green.length === 0;
    console.log(`self-test: planted server import() → ${red.length} heavy hit(s) (want >0); client import() → ${green.length} (want 0)`);
    if (!ok) {
      console.error("self-test FAILED — the guard cannot see the class it exists for");
      process.exit(1);
    }
    console.log("self-test passed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  assertAliasesMatchConfig();
  if (args.includes("--self-test")) return selfTest();
  const t0 = Date.now();
  const g = await eagerClientSet();
  let bytes = 0;
  const byPkg = new Map<string, number>();
  for (const f of g.parent.keys()) {
    let s = 0;
    try {
      s = readFileSync(f).length;
    } catch {}
    bytes += s;
    byPkg.set(pkgName(f), (byPkg.get(pkgName(f)) ?? 0) + s);
  }
  console.log(
    `shell eager set: ${g.clientRefs.size} client references, ${g.parent.size} modules, ${(bytes / 1e6).toFixed(1)} MB source (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
  );
  const whyIdx = args.indexOf("--why");
  if (whyIdx >= 0) {
    const needle = args[whyIdx + 1] ?? "";
    const target = [...g.parent.keys()].find((f) => pkgPath(f).includes(needle));
    if (!target) console.log(`"${needle}" is not in the eager set`);
    else {
      console.log(chainTo(g, target).join("\n  -> "));
      const eagerImporters = [...(g.importers.get(target) ?? [])].filter((f) => g.parent.has(f));
      console.log(`\nevery eager importer of ${pkgPath(target)}:\n  ${eagerImporters.map(pkgPath).join("\n  ")}`);
    }
    return;
  }
  if (args.includes("--report")) {
    for (const [n, s] of [...byPkg].sort((a, b) => b[1] - a[1]).slice(0, 40))
      console.log(`${(s / 1e3).toFixed(0).padStart(8)} KB  ${n}`);
  }
  const hits = heavyHits(g);
  if (hits.length) {
    console.error(`\nFAIL: ${hits.length} heavy module(s) load on EVERY signed-in route:`);
    for (const h of hits) console.error(`\n  ${h.why}\n    ${chainTo(g, h.file).join("\n    -> ")}`);
    console.error(
      "\nMove the edge behind a client-side import() at the point of use (code-splitting skill, rule 3: one edge, at the edge).",
    );
    process.exit(1);
  }
  console.log("OK: no heavy module is in the shell's eager client set");
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
