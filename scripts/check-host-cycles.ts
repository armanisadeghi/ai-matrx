#!/usr/bin/env tsx
/**
 * NO STATIC IMPORT CYCLE MAY PASS THROUGH THE CONTENT-IR HOST OR MATRX-ENVELOPE.
 *
 * G11C / G13 (2026-10-07): every fresh load of a note fell to "This page stopped working" —
 * "Cannot access 'matrxDirectiveHost' before initialization". `ContentIrHostBoundary` statically
 * imported `directiveHost`, whose door graph (DirectiveConsequence → useReferenceDoor →
 * item-presentation → google-workspace → components/official → KindInstanceRender) reached the
 * host again: 13 modules in one strongly-connected loop, so whichever module the bundler happened
 * to evaluate first read the other's `const` in its TDZ. A41c52e1aa made the read lazy; the loop
 * stayed, and the next eager read added anywhere on it would bring the crash back.
 *
 * The cut: the host reads its directive host from a leaf slot (`features/content-ir/host/
 * directiveHostSlot.ts`) that `directiveHost` fills at its own evaluation — the content-ir host no
 * longer imports the door/presentation graph at all.
 *
 * The rule enforced here: no file under the SCOPE sits on a cycle of STATIC edges (the only edges
 * evaluated synchronously, so the only ones that can hit a TDZ). `import()` and worker edges are
 * asynchronous and are not followed.
 *
 *   pnpm check:host-cycles              # scan this checkout
 *   pnpm check:host-cycles --root <dir> # scan another tree (e.g. a git archive)
 *   pnpm check:host-cycles:self-test    # proves the guard goes red, then green
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildImportGraph, shortestPath } from "./lib/import-graph";

const SCOPE = ["features/content-ir/host/", "features/matrx-envelope/"];

export function findHostCycles(root: string): string[][] {
  const graph = buildImportGraph(root);
  const cycles: string[][] = [];
  const seen = new Set<string>();
  for (const file of [...graph.keys()].sort()) {
    if (!SCOPE.some((s) => file.startsWith(s)) || seen.has(file)) continue;
    const cycle = shortestPath(graph, file, file, (e) => e.kind === "static");
    if (!cycle) continue;
    for (const f of cycle) seen.add(f); // one report per loop, not one per member
    cycles.push(cycle);
  }
  return cycles;
}

function report(cycles: string[][]): number {
  if (cycles.length === 0) {
    console.log("check:host-cycles — no static import cycle passes through content-ir/host or matrx-envelope.");
    return 0;
  }
  console.error(
    `check:host-cycles — ${cycles.length} static import cycle(s) through content-ir/host or matrx-envelope. ` +
      "A module on a cycle can be evaluated before the one it reads — 'Cannot access X before initialization'.",
  );
  for (const cycle of cycles) {
    console.error(`\n  ${cycle[0]}`);
    for (const step of cycle.slice(1)) console.error(`    → ${step}`);
  }
  console.error(
    "\nFix: invert the edge that points back up — the lower module reads a value from a leaf slot the higher module fills " +
      "(features/content-ir/host/directiveHostSlot.ts is the model), never a static import of the higher module.",
  );
  return 1;
}

function selfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "host-cycles-"));
  const put = (rel: string, body: string) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  };
  try {
    // The G13 shape: host → directive host → door → presentation → … → host.
    put("features/content-ir/host/Host.tsx", 'import { dh } from "@/features/matrx-envelope/directiveHost";\nexport const host = { get directives() { return dh; } };\n');
    put("features/matrx-envelope/directiveHost.tsx", 'import { door } from "./door";\nexport const dh = { door };\n');
    put("features/matrx-envelope/door.ts", 'import { present } from "@/features/item-presentation/registry";\nexport const door = present;\n');
    put("features/item-presentation/registry.tsx", 'import { Render } from "@/features/content-ir/studio/Render";\nexport const present = Render;\n');
    put("features/content-ir/studio/Render.tsx", 'import { host } from "@/features/content-ir/host/Host";\nexport const Render = () => host;\n');
    const red = findHostCycles(dir);
    if (red.length !== 1 || !red[0].includes("features/item-presentation/registry.tsx")) {
      console.error("self-test FAILED: the G13 loop was not reported exactly once", red);
      return 1;
    }
    // The cut: the host reads a leaf slot the directive host fills.
    put("features/content-ir/host/slot.ts", "let h: unknown;\nexport const provide = (x: unknown) => { h = x; };\nexport const provided = () => h;\n");
    put("features/content-ir/host/Host.tsx", 'import { provided } from "./slot";\nexport const host = { get directives() { return provided(); } };\n');
    put("features/matrx-envelope/directiveHost.tsx", 'import { door } from "./door";\nimport { provide } from "@/features/content-ir/host/slot";\nexport const dh = { door };\nprovide(dh);\n');
    const green = findHostCycles(dir);
    if (green.length !== 0) {
      console.error("self-test FAILED: the slot shape was reported as a cycle", green);
      return 1;
    }
    // A bare side-effect import is an edge too — and must not be swallowed by the statement after it.
    put("features/content-ir/host/Host.tsx", 'import { provided } from "./slot";\nimport "@/features/matrx-envelope/directiveHost";\nimport { x } from "./slot";\nexport const host = { get directives() { return provided(); } };\n');
    if (findHostCycles(dir).length !== 1) {
      console.error("self-test FAILED: a bare side-effect import back into the loop was not seen");
      return 1;
    }
    put("features/content-ir/host/Host.tsx", 'import { provided } from "./slot";\nexport const host = { get directives() { return provided(); } };\n');
    // An import() edge back to the host is asynchronous and must stay green; a type-only one is erased.
    put("features/content-ir/studio/Render.tsx", 'import type { host } from "@/features/content-ir/host/Host";\nexport const Render = () => import("@/features/matrx-envelope/directiveHost");\n');
    if (findHostCycles(dir).length !== 0) {
      console.error("self-test FAILED: an import() or type-only edge was counted as a static cycle");
      return 1;
    }
    console.log("check:host-cycles self-test passed — red on the G13 loop, green on the slot, import() and type-only shapes.");
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) process.exit(selfTest());
const rootIdx = args.indexOf("--root");
process.exit(report(findHostCycles(rootIdx >= 0 ? args[rootIdx + 1] : process.cwd())));
