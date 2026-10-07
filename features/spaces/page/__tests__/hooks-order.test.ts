/**
 * Round 26, D11: "React has detected a change in the order of Hooks called by SpacePageScreen" — a hook
 * (useSpaceBuilder) ran after the loading / missing early returns, so it was called on some renders only.
 * Every hook in SpacePageScreen runs before its first early return.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

it("SpacePageScreen calls no hook after its first early return", () => {
  const src = readFileSync(join(__dirname, "..", "SpacePage.tsx"), "utf8");
  const start = src.indexOf("function SpacePageScreen(");
  expect(start).toBeGreaterThan(-1);
  const firstReturn = src.indexOf("\n  if (doc === undefined) return", start);
  expect(firstReturn).toBeGreaterThan(start);
  // The component ends at the next top-level declaration (or the file's end).
  const nextTop = src.slice(firstReturn).search(/\n(export )?(function|const) [A-Z]/);
  const after = src.slice(firstReturn, nextTop === -1 ? undefined : firstReturn + nextTop);
  const lateHooks = [...after.matchAll(/(?<![\w.])use[A-Z]\w*\(/g)].map((m) => m[0]);
  expect(lateHooks).toEqual([]);
});
