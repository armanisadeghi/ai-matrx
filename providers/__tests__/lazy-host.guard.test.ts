/**
 * THE RICH-CONTENT HOST LOADS LAZILY. providers/richContentHost.ts, features/rich-content-host/app-bindings.tsx
 * and the rich-document registrations cost ~630 kB gzip; every page's first load pays for them if any layout
 * reaches them through a STATIC import. They may be reached only through `import()` (the loader in
 * providers/RichContentHostProvider.tsx). This walks the static import graph from every app/**\/layout.tsx.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const FORBIDDEN = [
  "providers/richContentHost.ts",
  "features/rich-content-host/app-bindings.tsx",
  "features/rich-content-host/rich-document-registrations.ts",
];
const EXTS = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];

function resolveSpec(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const e of EXTS) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

/** Static edges only: `import … from "x"`, `import "x"`, `export … from "x"` — never `import("x")`, never `import type`. */
export function staticImports(source: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(?:import\s+(?!type\b)(?:[^"';]*?\s+from\s+)?|export\s+(?!type\b)[^"';]*?\s+from\s+)["']([^"']+)["']/g;
  for (let m = re.exec(source); m; m = re.exec(source)) out.push(m[1]);
  return out;
}

function layouts(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) layouts(p, acc);
    else if (e.name === "layout.tsx") acc.push(p);
  }
  return acc;
}

/** The first static chain from `entries` to a forbidden file, or null. */
export function findChain(entries: string[], read: (f: string) => string | null = (f) => fs.readFileSync(f, "utf8")): string[] | null {
  const forbidden = new Set(FORBIDDEN.map((f) => path.join(ROOT, f)));
  const parent = new Map<string, string | null>();
  const queue: string[] = [];
  for (const e of entries) {
    parent.set(e, null);
    queue.push(e);
  }
  while (queue.length) {
    const file = queue.shift()!;
    if (forbidden.has(file)) {
      const chain: string[] = [];
      for (let f: string | null = file; f; f = parent.get(f) ?? null) chain.unshift(path.relative(ROOT, f));
      return chain;
    }
    const src = read(file);
    if (src == null) continue;
    for (const spec of staticImports(src)) {
      const r = resolveSpec(spec, file);
      if (r && !parent.has(r)) {
        parent.set(r, file);
        queue.push(r);
      }
    }
  }
  return null;
}

describe("the rich-content host is never in a layout's static import graph", () => {
  const entries = layouts(path.join(ROOT, "app"));

  test("there are layouts to walk", () => {
    expect(entries.length).toBeGreaterThan(50);
  });

  test("no app layout reaches the host, its app bindings or the rich-document registrations statically", () => {
    const chain = findChain(entries);
    expect(chain ? `static chain: ${chain.join(" -> ")}` : null).toBeNull();
  });

  test("the forbidden files exist (a rename must move this guard with it)", () => {
    for (const f of FORBIDDEN) expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
  });

  test("the loader reaches the host only through import()", () => {
    const provider = fs.readFileSync(path.join(ROOT, "providers/RichContentHostProvider.tsx"), "utf8");
    expect(provider).toMatch(/configureRichContentHostLoader\(\s*\(\)\s*=>\s*import\(["']\.\/richContentHost["']\)/);
    expect(staticImports(provider).some((s) => s.includes("richContentHost"))).toBe(false);
  });

  test("the walker sees a planted static import and ignores import()", () => {
    const entry = path.join(ROOT, "app/layout.tsx");
    const files: Record<string, string> = {
      [entry]: `import "@/providers/richContentHost";`,
    };
    expect(findChain([entry], (f) => files[f] ?? null)).not.toBeNull();
    files[entry] = `const x = () => import("@/providers/richContentHost");`;
    expect(findChain([entry], (f) => files[f] ?? null)).toBeNull();
  });
});
