/**
 * emit-bundle-boundary — the source guard that keeps `@babel/standalone` out
 * of the workflow run-surface bundle.
 *
 * `emitRendererCache` → `compileEmitRenderer` → the agent-apps compiler → a
 * STATIC `import { transform } from "@babel/standalone"`. The ONLY thing
 * keeping that out of every chunk that can show a workflow run is the
 * `next/dynamic` boundary in `DbEmitRenderer.tsx`. A run surface that imports
 * the cache directly — to warm it, to invalidate it, to read a version —
 * walks around the boundary and pulls Babel in eagerly. That is the D115
 * shape (+14 GB peak build RSS, 12 OOM'd Vercel builds), and a build autopsy
 * is a terrible way to find it, so it is a red test here instead.
 *
 * The rule: a consumer OUTSIDE `features/workflow-emit/` may import
 * `DbEmitRenderer`, `surface`, and `types` — nothing else.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");

/** Modules a consumer outside the feature is allowed to reach for. */
const PUBLIC_MODULES = new Set(["DbEmitRenderer", "surface", "types"]);

/** Every file outside the feature that renders or references an emission. */
const CONSUMERS = [
  "features/workflow-runtime/components/run/RunEmissions.tsx",
  "features/workflow-runtime/components/run/RunStage.tsx",
  "features/workflow-runtime/components/WorkflowRunBoard.tsx",
];

function importedEmitModules(source: string): string[] {
  const found: string[] = [];
  const pattern = /from\s+["'](?:@\/features\/workflow-emit|\.\.\/\.\.\/workflow-emit)\/([\w./-]+)["']/g;
  let match = pattern.exec(source);
  while (match !== null) {
    found.push(match[1]);
    match = pattern.exec(source);
  }
  return found;
}

describe("workflow-emit bundle boundary", () => {
  it.each(CONSUMERS)(
    "%s reaches workflow-emit only through its lazy public entry points",
    (relative) => {
      const source = readFileSync(join(ROOT, relative), "utf8");
      for (const moduleName of importedEmitModules(source)) {
        expect(PUBLIC_MODULES.has(moduleName)).toBe(true);
      }
      // The renderer host must genuinely reach the feature — a regex that
      // silently matched nothing would make this whole guard vacuous.
      if (relative.endsWith("RunEmissions.tsx")) {
        expect(importedEmitModules(source)).toContain("DbEmitRenderer");
      }
    },
  );

  it("DbEmitRenderer keeps the impl behind next/dynamic — never a static import", () => {
    const source = readFileSync(
      join(ROOT, "features/workflow-emit/DbEmitRenderer.tsx"),
      "utf8",
    );
    // The impl may only be referenced as a TYPE and inside the dynamic().
    expect(source).toContain('dynamic(');
    expect(source).toContain('import("./DbEmitRendererImpl")');
    expect(source).not.toMatch(
      /^import\s+\{[^}]*DbEmitRendererImpl[^}]*\}\s+from/m,
    );
  });
});
