#!/usr/bin/env node
/**
 * The agent builder's render closure — every repo file reachable by import from
 * app/(core)/agents/[id]/build. The builder is FORBIDDEN to change (owner, 2026-10-03:
 * pixel-identical by design), so a rollout codemod treats every file in this closure as
 * excluded. The walk follows STATIC `@/…` and relative imports and stays inside the builder's own
 * code (the route and `features/agents/**`): a shared primitive the builder also renders (a door in
 * components/ui, the shell) is the platform's, not the builder's — following it reaches the whole app.
 *
 *   node scripts/ui-rollout/builder-closure.mjs            # prints the closure, one path per line
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const START = join(ROOT, "app/(core)/agents/[id]/build");
const OWNED = ["app/(core)/agents/[id]/build", "features/agents/"];
const EXT = [".tsx", ".ts", "/index.tsx", "/index.ts", ".jsx", ".js"];
// STATIC imports only: a dynamic `import()` is a lazily opened overlay/window, not the builder's
// own render tree (following them reaches ~3,600 files — the whole app).
const SPEC = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/g;

function resolveSpec(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of EXT) if (existsSync(base + e)) return base + e;
  return null;
}

export function builderClosure() {
  const seen = new Set();
  const stack = ["page.tsx", "layout.tsx", "loading.tsx"].map((f) => join(START, f)).filter(existsSync);
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(SPEC)) {
      const spec = m[1];
      // A type-only import renders nothing.
      if (/^import\s+type\s/.test(m[0])) continue;
      const r = resolveSpec(f, spec);
      if (r && !seen.has(r) && OWNED.some((o) => relative(ROOT, r).startsWith(o))) stack.push(r);
    }
  }
  return new Set([...seen].map((f) => relative(ROOT, f)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of [...builderClosure()].sort()) console.log(f);
}
