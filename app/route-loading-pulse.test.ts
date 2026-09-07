import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function findLoadingBoundaries(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findLoadingBoundaries(path);
    return entry.name === "loading.tsx" ? [path] : [];
  });
}

describe("route loading boundaries", () => {
  it("use a pulsing skeleton or re-export a pulsing parent boundary", () => {
    const offenders = findLoadingBoundaries(join(process.cwd(), "app")).filter(
      (path) => {
        const source = readFileSync(path, "utf8");
        const pulses = /\b[\w$]*Skeletons?\b|animate-pulse/.test(source);
        const reexportsParentLoading =
          /export\s*\{\s*default\s*\}\s*from\s*["'][^"']*loading["']/.test(
            source,
          );
        return !pulses && !reexportsParentLoading;
      },
    );

    expect(offenders).toEqual([]);
  });
});
