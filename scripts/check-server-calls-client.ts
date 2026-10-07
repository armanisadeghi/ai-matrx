#!/usr/bin/env tsx
/**
 * A SERVER-ONLY MODULE MUST NEVER CALL A FUNCTION FROM A "use client" MODULE.
 *
 * Across the RSC boundary every export of a "use client" module is a client
 * REFERENCE, not the function: calling it on the server throws ("Attempted to call
 * cn() from the server but cn is on the client"). Turbopack compiles the import
 * happily, so the throw only lands when a page renders — at build time, during
 * page-data collection / prerender, which fails the whole build.
 *
 * Measured 2026-10-07: `@ai-matrx/rich-content@0.2.20`'s server level
 * (`levels/server/RichContentServer.js`, which imports "server-only") called `cn`
 * from the `@ai-matrx/design-system` root barrel, whose first line is "use client".
 * Every main / manage / demos build of v0.4.2937-2940 failed minutes into the
 * build; rich-content 0.2.25 (cn from the server-safe `@ai-matrx/design-system/cn`)
 * made v0.4.2941 green on all four projects. Lab never builds a server-rendered
 * rich-content page, so it stayed green throughout.
 *
 * What it checks: every module that imports "server-only" — this app's own files
 * AND every installed @ai-matrx package's dist — for a named value import from a
 * module whose first statement is "use client", where that name is then CALLED.
 * Rendering a client component from the server (`<Foo />`) is legal and ignored.
 *
 *   pnpm check:server-calls-client
 *   pnpm check:server-calls-client:self-test
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, relative } from "node:path";
import { aliasTarget, SOURCE_ROOTS } from "./lib/source-roots.cjs";

const CODE = /\.(?:[cm]?[jt]sx?)$/;
const SKIP = /(^|\/)(\.next[^/]*|__tests__|__mocks__)(\/|$)/;
const TEST = /\.(test|spec)\.[cm]?[jt]sx?$/;
const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const IMPORT_RE = /(?:^|\n|;)\s*import\s+(?!type\s)([\s\S]*?)\s+from\s+["']([^"'\n]+)["']/g;

export type Finding = { file: string; name: string; from: string; target: string };

function walk(root: string, rel: string, out: string[], skipNodeModules: boolean): void {
  let names: string[];
  try {
    names = readdirSync(join(root, rel));
  } catch {
    return;
  }
  for (const name of names) {
    const r = rel ? `${rel}/${name}` : name;
    if (SKIP.test(r) || (skipNodeModules && name === "node_modules")) continue;
    let st;
    try {
      st = statSync(join(root, r));
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(root, r, out, skipNodeModules);
    else if (CODE.test(name) && !name.endsWith(".d.ts") && !TEST.test(name)) out.push(r);
  }
}

function firstFile(base: string): string | null {
  for (const c of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => `${base}/index${e}`)]) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      /* next */
    }
  }
  return null;
}

type Exports = string | null | { [k: string]: Exports } | Exports[];
function pickCondition(target: Exports): string | null {
  if (typeof target === "string") return target;
  if (!target) return null;
  if (Array.isArray(target)) {
    for (const t of target) {
      const hit = pickCondition(t);
      if (hit) return hit;
    }
    return null;
  }
  for (const key of ["react-server", "node", "import", "module", "default", "require"]) {
    if (key in target) {
      const hit = pickCondition(target[key]);
      if (hit && !hit.endsWith(".d.ts") && !hit.endsWith(".d.cts")) return hit;
    }
  }
  return null;
}

function resolvePackage(root: string, spec: string): string | null {
  const parts = spec.split("/");
  const pkg = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const sub = `.${spec.slice(pkg.length)}`;
  const dir = join(root, "node_modules", pkg);
  let pj: { exports?: Exports; module?: string; main?: string };
  try {
    pj = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
  if (pj.exports && typeof pj.exports === "object" && !Array.isArray(pj.exports) && Object.keys(pj.exports).some((k) => k.startsWith("."))) {
    const map = pj.exports as Record<string, Exports>;
    let target: string | null = null;
    if (sub in map) target = pickCondition(map[sub]);
    else {
      for (const [k, v] of Object.entries(map)) {
        if (!k.includes("*")) continue;
        const [a, b] = k.split("*");
        if (sub.startsWith(a) && sub.endsWith(b)) {
          const star = sub.slice(a.length, sub.length - b.length);
          const t = pickCondition(v);
          if (t) target = t.replace("*", star);
          break;
        }
      }
    }
    return target ? firstFile(join(dir, target)) : null;
  }
  if (sub === ".") return firstFile(join(dir, pj.module ?? pj.main ?? "index"));
  return firstFile(join(dir, sub.slice(2)));
}

function resolveFrom(root: string, fromAbs: string, spec: string): string | null {
  if (spec.startsWith(".")) return firstFile(join(dirname(fromAbs), spec));
  const aliased = aliasTarget(spec);
  if (aliased !== null) return firstFile(join(root, aliased));
  if (spec.startsWith("@ai-matrx/")) return resolvePackage(root, spec);
  return null; // other npm packages are not this guard's business
}

const clientCache = new Map<string, boolean>();
function isUseClient(abs: string): boolean {
  if (clientCache.has(abs)) return clientCache.get(abs)!;
  let head = "";
  try {
    head = readFileSync(abs, "utf8").slice(0, 6000);
  } catch {
    /* unreadable → not client */
  }
  const yes = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/.test(head);
  clientCache.set(abs, yes);
  return yes;
}

export function findServerCallsClient(root: string): Finding[] {
  const files: string[] = [];
  for (const dir of new Set(SOURCE_ROOTS as readonly string[])) walk(root, dir, files, true);
  const scope = join(root, "node_modules", "@ai-matrx");
  if (existsSync(scope)) {
    for (const pkg of readdirSync(scope)) {
      const dist = join("node_modules", "@ai-matrx", pkg, "dist");
      if (existsSync(join(root, dist))) walk(root, dist, files, true);
    }
  }
  const findings: Finding[] = [];
  for (const rel of files) {
    if (rel.startsWith("scripts/")) continue;
    const abs = join(root, rel);
    let src: string;
    try {
      src = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (!/(?:^|\n)\s*import\s+["']server-only["']/.test(src)) continue;
    const body = src.replace(/\/\*[\s\S]*?\*\//g, "");
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(body))) {
      const named = m[1].match(/\{([\s\S]*)\}/);
      if (!named) continue;
      const target = resolveFrom(root, abs, m[2]);
      if (!target || !isUseClient(target)) continue;
      for (const part of named[1].split(",")) {
        const p = part.trim();
        if (!p || p.startsWith("type ")) continue;
        const local = (p.split(/\s+as\s+/)[1] ?? p).trim();
        if (new RegExp(`(?<![\\w$.])${local.replace(/\$/g, "\\$")}\\s*\\(`).test(body)) {
          findings.push({ file: rel, name: local, from: m[2], target: posix.normalize(relative(root, target)) });
        }
      }
    }
  }
  return findings;
}

/**
 * THE VALUE-IMPORT HALF (2026-10-07). A server module reading ANY non-component value —
 * a constant, a function referenced, a template-literal ingredient — from a "use client" file
 * gets a client REFERENCE, not the value: `AppletIntroPage` (server) put USE_ON_RETURN into a
 * sign-up URL and the link carried `function(){throw Error("Attempted to call ...")}=1`.
 * "Server module" = reachable from a route entry (page/layout/route/…) or a "server-only" file
 * without crossing a "use client" boundary. Allowed from a client file: JSX tags (<Foo />),
 * types. Anything else (`USE_ON_RETURN`, `useThing()`, `Foo.bar`) is a finding.
 */
const ENTRY = /^app\/.*\/?(?:page|layout|route|template|default|loading|not-found|sitemap|robots|opengraph-image|twitter-image|icon)\.[cm]?[jt]sx?$/;

export function findServerValueImports(root: string): Finding[] {
  const files: string[] = [];
  for (const dir of new Set(SOURCE_ROOTS as readonly string[])) walk(root, dir, files, true);
  const read = new Map<string, string>();
  const srcOf = (abs: string): string => {
    let v = read.get(abs);
    if (v === undefined) {
      try {
        v = readFileSync(abs, "utf8");
      } catch {
        v = "";
      }
      read.set(abs, v);
    }
    return v;
  };
  const queue: string[] = [];
  const seen = new Set<string>();
  for (const rel of files) {
    const abs = join(root, rel);
    if (rel.startsWith("scripts/") || isUseClient(abs)) continue;
    if (ENTRY.test(rel) || /(?:^|\n)\s*import\s+["']server-only["']/.test(srcOf(abs))) {
      seen.add(abs);
      queue.push(abs);
    }
  }
  const findings: Finding[] = [];
  while (queue.length) {
    const abs = queue.pop()!;
    const body = srcOf(abs).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(body))) {
      const target = resolveFrom(root, abs, m[2]);
      if (!target || !CODE.test(target)) continue;
      if (!isUseClient(target)) {
        if (!seen.has(target) && !target.includes("node_modules") && !relative(root, target).startsWith("scripts/")) {
          seen.add(target);
          queue.push(target);
        }
        continue;
      }
      const named = m[1].match(/\{([\s\S]*)\}/);
      if (!named || target.includes("node_modules")) continue;
      const tsrc = srcOf(target);
      for (const part of named[1].split(",")) {
        const p = part.trim();
        if (!p || p.startsWith("type ")) continue;
        const imported = p.split(/\s+as\s+/)[0].trim();
        const local = (p.split(/\s+as\s+/)[1] ?? p).trim();
        if (new RegExp(`export\\s+(?:interface|type)\\s+${imported}\\b`).test(tsrc)) continue;
        const esc = local.replace(/\$/g, "\\$");
        const rest = body.replace(new RegExp(IMPORT_RE.source, "g"), "");
        const uses = [...rest.matchAll(new RegExp(`(?<![\\w$.])${esc}(?![\\w$])`, "g"))];
        if (uses.some((u) => !/(?:<\/?|typeof\s+)$/.test(rest.slice(Math.max(0, u.index! - 8), u.index!)))) {
          findings.push({ file: relative(root, abs), name: local, from: m[2], target: posix.normalize(relative(root, target)) });
        }
      }
    }
  }
  return findings;
}

/**
 * SHRINK-ONLY BASELINE for value imports (2026-10-07): server-reachable modules that read a value
 * from a "use client" file, found when the value half landed. Each is either a real server-side
 * read to move into a neutral module, or client-only code the graph cannot prove is never run on
 * the server. A new finding fails; a baseline entry that no longer fires fails too (delete it).
 * Key: "<file>|<name>".
 */
const BASELINE = new Set<string>([
  "../aidream/apps/shared/chat/src/host/defaults/navigation.ts|useWindowPathname",
  "../aidream/apps/shared/chat/src/host/defaults/navigation.ts|useWindowSearchParams",
  "features/organizations/addressing/teamAddress.ts|getTeamOrganizationId",
  "lib/coming-soon/announce.ts|confirm",
  "app/(core)/chat/talk/a/[agentId]/page.tsx|voiceChatAgentHref",
  "app/(core)/chat/talk/[conversationId]/page.tsx|voiceChatAgentHref",
  "lib/scoped-config/effectiveKnobs.ts|registerDirectiveHandler",
]);

function report(all: Finding[]): number {
  const keyOf = (f: Finding) => `${f.file}|${f.name}`;
  const findings = all.filter((f) => !BASELINE.has(keyOf(f)));
  const live = new Set(all.map(keyOf));
  const stale = [...BASELINE].filter((k) => !live.has(k));
  if (stale.length) {
    console.error(`check:server-calls-client — ${stale.length} baseline entr${stale.length === 1 ? "y" : "ies"} no longer fire; delete from BASELINE:`);
    for (const k of stale) console.error(`  ${k}`);
    return 1;
  }
  if (findings.length === 0) {
    console.log("check:server-calls-client — no server-only module calls a \"use client\" export.");
    return 0;
  }
  console.error(`check:server-calls-client — ${findings.length} server-only call(s) into a "use client" module; the build fails when the page renders.`);
  for (const f of findings) console.error(`  ${f.file}: ${f.name} from "${f.from}" (${f.target} is "use client")`);
  console.error("\nFix: import the function from a server-safe module (no \"use client\"); a package fix ships IN the package.");
  return 1;
}

function selfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "server-calls-client-"));
  const put = (rel: string, body: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  };
  try {
    const ds = "node_modules/@ai-matrx/design-system";
    put(`${ds}/package.json`, JSON.stringify({ name: "@ai-matrx/design-system", exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" }, "./cn": { import: "./dist/cn.js" } } }));
    put(`${ds}/dist/index.js`, '"use client";\nexport { cn } from "./cn.js";\nexport function Button() { return null; }\n');
    put(`${ds}/dist/cn.js`, "export function cn(...a) { return a.join(' '); }\n");
    const rc = "node_modules/@ai-matrx/rich-content";
    put(`${rc}/package.json`, JSON.stringify({ name: "@ai-matrx/rich-content", exports: { "./levels/*": { import: "./dist/levels/*.js" } } }));
    // The 0.2.20 shape: a server-only module calls cn from the "use client" barrel.
    put(`${rc}/dist/levels/server/RichContentServer.js`, 'import "server-only";\nimport { cn } from "@ai-matrx/design-system";\nexport const X = () => cn("a");\n');
    // Rendering a client component from the server is legal.
    put("features/x/Page.tsx", 'import "server-only";\nimport { Button } from "@ai-matrx/design-system";\nexport default function P() { return <Button />; }\n');
    const red = findServerCallsClient(dir);
    if (red.length !== 1 || red[0].name !== "cn") {
      console.error("self-test FAILED: expected exactly the cn() call to be reported", red);
      return 1;
    }
    // The 0.2.25 shape: cn from the server-safe subpath.
    put(`${rc}/dist/levels/server/RichContentServer.js`, 'import "server-only";\nimport { cn } from "@ai-matrx/design-system/cn";\nexport const X = () => cn("a");\n');
    const green = findServerCallsClient(dir);
    if (green.length !== 0) {
      console.error("self-test FAILED: the server-safe import was reported", green);
      return 1;
    }
    // The value-import half: a server module (route-reachable) using a client file's constant.
    put("app/x/page.tsx", 'import { Intro } from "@/features/x/Intro";\nexport default function P() { return <Intro />; }\n');
    put("features/x/Intro.tsx", 'import { Use, USE_ON_RETURN } from "./Use";\nexport function Intro() { return <Use href={`/a?${USE_ON_RETURN}=1`} />; }\n');
    put("features/x/Use.tsx", '"use client";\nexport const USE_ON_RETURN = "use";\nexport function Use(p: { href: string }) { return <a href={p.href} />; }\nexport interface UseProps { a: 1 }\n');
    const vRed = findServerValueImports(dir);
    if (vRed.length !== 1 || vRed[0].name !== "USE_ON_RETURN") {
      console.error("self-test FAILED: expected exactly the USE_ON_RETURN value import", vRed);
      return 1;
    }
    put("features/x/Intro.tsx", 'import { Use } from "./Use";\nimport { USE_ON_RETURN } from "./consts";\nexport function Intro() { return <Use href={`/a?${USE_ON_RETURN}=1`} />; }\n');
    put("features/x/consts.ts", 'export const USE_ON_RETURN = "use";\n');
    const vGreen = findServerValueImports(dir);
    if (vGreen.length !== 0) {
      console.error("self-test FAILED: the neutral-module import was reported", vGreen);
      return 1;
    }
    console.log("check:server-calls-client self-test passed — red on a server-only call into \"use client\", green on the server-safe import and on rendering a client component.");
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) process.exit(selfTest());
const rootIdx = args.indexOf("--root");
const scanRoot = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
process.exit(report([...findServerCallsClient(scanRoot), ...findServerValueImports(scanRoot)]));
