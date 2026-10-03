/**
 * Every SurfaceRuntimeProvider already merges its descendants' scope
 * contributions (registry `withScopeContributions`). A provider that ALSO
 * spreads `getRegisteredSurfaceScopeContributions(...)` into its own
 * `getScope` emits each contributed value twice, the registry rejects it as
 * "a descendant contribution ... tried to replace the provider-owned value",
 * and every agent launch from that page loses its scope (2026-10-02, mandate
 * record page, `mandate_label`).
 *
 * Guard: no file that renders a SurfaceRuntimeProvider may call
 * getRegisteredSurfaceScopeContributions.
 */
import { execSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function filesRenderingProvider(): string[] {
  const out = execSync(
    `git grep -l "<SurfaceRuntimeProvider" -- '*.tsx' ':!**/*.test.tsx' ':!node_modules' ':!packages/chat/src/surfaces/runtime/SurfaceRuntimeContext.tsx'`,
    { cwd: ROOT, encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean);
}

describe("surface providers never hand-merge contributions", () => {
  it("finds provider files to check", () => {
    expect(filesRenderingProvider().length).toBeGreaterThan(0);
  });

  it("no provider file calls getRegisteredSurfaceScopeContributions", () => {
    const offenders = filesRenderingProvider().filter((file) =>
      /getRegisteredSurfaceScopeContributions\s*\(/.test(
        readFileSync(path.join(ROOT, file), "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
