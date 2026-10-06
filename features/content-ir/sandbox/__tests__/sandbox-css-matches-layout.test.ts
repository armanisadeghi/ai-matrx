/**
 * The kind sandbox frame's stylesheet must load the SAME stylesheet stack as
 * the app's root layout, in the same order. On 2026-10-06 the frame imported
 * only globals.css, so the copy bar inside every DB-authored kind rendered
 * unstyled (the palette CSS lives in @ai-matrx/design-system/styles.css).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

function layoutCssImports(): string[] {
  const src = readFileSync(resolve(ROOT, "app/layout.tsx"), "utf8");
  return [...src.matchAll(/^import\s+["']([^"']+\.css)["'];?/gm)].map((m) =>
    m[1] === "./globals.css" ? "app/globals.css" : m[1],
  );
}

function sandboxCssImports(): string[] {
  const src = readFileSync(resolve(ROOT, "features/content-ir/sandbox/runtime/sandbox.css"), "utf8");
  return [...src.matchAll(/^@import\s+["']([^"']+)["'];?/gm)].map((m) =>
    m[1].endsWith("app/globals.css") ? "app/globals.css" : m[1],
  );
}

describe("kind sandbox stylesheet", () => {
  it("imports exactly the root layout's stylesheets, in order", () => {
    const layout = layoutCssImports();
    expect(layout).toContain("@ai-matrx/design-system/styles.css");
    expect(sandboxCssImports()).toEqual(layout);
  });
});
