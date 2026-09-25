/**
 * @jest-environment node
 */
/**
 * THERE IS ONE SCOPE TREE (lane SCOPE-ADMIN-CANONICAL, 2026-09-25).
 *
 * Scope types and scopes live in `state.scopesTree` (features/scopes/redux),
 * loaded by `ensureScopeTree` and written through `scopeTreeMutations` →
 * `scopesService`. The second tree — `features/agent-context/redux/scope/
 * {scopeTypesSlice,scopesSlice,types}.ts`, mounted as `state.scopeTypes` /
 * `state.scopes` — was deleted. This fails if any of it comes back: the
 * directory, an import of it, or its reducer keys in the root reducer.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "features", "components", "lib", "hooks", "utils", "providers"];
const SKIP = new Set(["node_modules", ".next", "__snapshots__"]);
const IMPORT_OF_THE_OLD_TREE =
  /from\s+["'][^"']*agent-context\/redux\/scope\/(scopeTypesSlice|scopesSlice|types)["']/;

function* sources(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) yield p;
  }
}

it("the second scope tree's module directory is gone", () => {
  expect(existsSync(join(ROOT, "features/agent-context/redux/scope"))).toBe(false);
});

it("nothing imports the second scope tree", () => {
  const offenders: string[] = [];
  for (const top of SCAN) {
    for (const file of sources(join(ROOT, top))) {
      if (IMPORT_OF_THE_OLD_TREE.test(readFileSync(file, "utf8"))) {
        offenders.push(relative(ROOT, file));
      }
    }
  }
  expect(offenders).toEqual([]);
});

it("the root reducer mounts no scopeTypes / scopes keys beside scopesTree", () => {
  const src = readFileSync(join(ROOT, "lib/redux/rootReducer.ts"), "utf8");
  expect(src).not.toMatch(/^\s*scopeTypes\s*:/m);
  expect(src).not.toMatch(/^\s*scopes\s*:/m);
  expect(src).toMatch(/^\s*scopesTree\s*:/m);
});
