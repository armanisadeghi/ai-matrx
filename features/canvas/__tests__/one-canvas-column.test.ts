/**
 * THERE IS ONE CANVAS. It is the @ai-matrx/canvas column, placed by
 * `ShellCanvasColumn`, mounted once per layout: the app shell, the public
 * layout and the link layout. A route never mounts, wraps or forks a canvas of
 * its own — it opens things INTO the one canvas.
 *
 * Static: scans every tracked .ts/.tsx outside packages/canvas.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROOT = process.cwd();

function trackedSources(): string[] {
  return execSync("git ls-files '*.ts' '*.tsx'", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((p) => p && !p.startsWith("packages/canvas/") && !p.includes("__tests__/one-canvas-column"));
}

const isTest = (path: string) => /(__tests__\/|\.test\.tsx?$|\.spec\.tsx?$)/.test(path);

function filesMatching(pattern: RegExp, { includeTests = true } = {}): string[] {
  return trackedSources().filter((path) => {
    if (!includeTests && isTest(path)) return false;
    try {
      return pattern.test(readFileSync(`${ROOT}/${path}`, "utf8"));
    } catch {
      return false; // deleted in the working tree
    }
  });
}

describe("one canvas", () => {
  it("only ShellCanvasColumn renders the canvas column, and nothing renders CanvasFrame", () => {
    expect(filesMatching(/<CanvasColumn[\s/>]/)).toEqual(["features/canvas/host/ShellCanvasColumn.tsx"]);
    expect(filesMatching(/<CanvasFrame[\s/>]/)).toEqual([]);
  });

  it("ShellCanvasColumn is mounted only by the three layouts", () => {
    expect(filesMatching(/<ShellCanvasColumn[\s/>]/).sort()).toEqual(
      ["app/(link)/layout.tsx", "app/(public)/layout.tsx", "features/shell/components/AppShell.tsx"].sort(),
    );
  });

  it("only the host binds the canvas to the store (tests may mount their own)", () => {
    expect(filesMatching(/<CanvasProvider[\s/>]/, { includeTests: false })).toEqual(["features/canvas/host/CanvasHostProvider.tsx"]);
  });
});
