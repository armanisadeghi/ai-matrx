#!/usr/bin/env node
// check:client-door-reexports — a "use client" module may not re-export from
// BOTH an @ai-matrx/<pkg> root entry and one of that package's subpath entries
// (e.g. `@ai-matrx/design-system` beside `@ai-matrx/design-system/controls`).
//
// Why: in a production Turbopack build whose client graph consumes ONLY the
// subpath export, the unused root re-export is tree-shaken out of the merged
// client chunk while the merged module still names it, and the build dies with
// "TurbopackInternalError: ModuleId not found for ident: .../dist/index.js
// [app-client] (ecmascript) <locals>" (EcmascriptModuleContent::new_merged).
// lab.aimatrx.com failed this way on every release v0.4.2866–v0.4.2880 through
// components/ui/button.tsx. Bigger builds hide it because another importer
// happens to consume the root. Remedy: import the root export at its call
// sites instead, or drop "use client" from a re-export-only door (the package
// entries carry their own directive).
//
//   node scripts/client-door-reexports/check.mjs              # scan tracked files
//   node scripts/client-door-reexports/check.mjs a.tsx b.tsx  # scan only these files
//   node scripts/client-door-reexports/check.mjs --self-test  # prove it fails, then passes
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const REEXPORT = /^\s*export\s+(?:type\s+)?(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s+from\s+["'](@ai-matrx\/[^"']+)["']/gm;

export function findings(source) {
  const head = source.replace(/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "");
  if (!/^["']use client["']/.test(head)) return [];
  const roots = new Set();
  const subs = new Map();
  for (const m of source.matchAll(REEXPORT)) {
    if (/^\s*export\s+type\b/.test(m[0])) continue; // type-only re-exports emit nothing
    const parts = m[1].split("/");
    const pkg = `${parts[0]}/${parts[1]}`;
    if (parts.length === 2) roots.add(pkg);
    else subs.set(pkg, [...(subs.get(pkg) ?? []), m[1]]);
  }
  // A module that also IMPORTS the root for its own code keeps the root in the
  // merged chunk (components/ui/textarea.tsx, verified with a lab build whose
  // only client import was its /controls Textarea) — not the crash shape.
  const imported = (p) => new RegExp(`^\\s*import\\s+(?!type\\b)[^;]*?from\\s+["']${p.replace("/", "\\/")}["']`, "m").test(source);
  return [...roots].filter((p) => subs.has(p) && !imported(p)).map((p) => `${p} root re-exported beside ${subs.get(p).join(", ")}`);
}

function selfTest() {
  const bad = `"use client";\nexport { Button } from "@ai-matrx/design-system/controls";\nexport { buttonVariants } from "@ai-matrx/design-system";\n`;
  const fixedA = bad.replace('"use client";\n', "");
  const fixedB = `"use client";\nexport { Button } from "@ai-matrx/design-system/controls";\n`;
  const typeOnly = `"use client";\nexport { Button } from "@ai-matrx/design-system/controls";\nexport type { X } from "@ai-matrx/design-system";\n`;
  const usesRoot = `"use client";\nimport { Textarea as T } from "@ai-matrx/design-system";\nexport { Textarea } from "@ai-matrx/design-system/controls";\nexport { Basic } from "@ai-matrx/design-system";\n`;
  const cases = [[bad, 1], [fixedA, 0], [fixedB, 0], [typeOnly, 0], [usesRoot, 0]];
  let ok = true;
  for (const [src, want] of cases) {
    const got = findings(src).length;
    if (got !== want) { ok = false; console.error(`self-test FAIL: expected ${want}, got ${got} for:\n${src}`); }
  }
  console.log(ok ? "check:client-door-reexports self-test PASSED (red on the v0.4.2880 button door, green on both remedies)" : "self-test FAILED");
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes("--self-test")) selfTest();

const explicit = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const files = explicit.length ? explicit : execFileSync("git", ["ls-files", "*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs"], { encoding: "utf8", maxBuffer: 1 << 28 })
  .split("\n").filter((f) => f && !f.includes("node_modules/"));
let count = 0;
for (const f of files) {
  let src;
  try { src = readFileSync(f, "utf8"); } catch { continue; }
  if (!src.includes("@ai-matrx/")) continue;
  for (const msg of findings(src)) { count++; console.error(`${f}: ${msg}`); }
}
if (count) {
  console.error(`\n${count} "use client" module(s) re-export an @ai-matrx package root beside its subpath — this crashes production Turbopack builds (see header). Import the root export at its call sites, or drop "use client" from a re-export-only door.`);
  process.exit(1);
}
console.log(`check:client-door-reexports: ${files.length} files, 0 findings`);
