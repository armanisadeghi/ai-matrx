/**
 * @jest-environment node
 */
/**
 * THE SCOPES CHOKEPOINT HAS NO RETIREMENT QUEUE (lane SCOPE-ADMIN-2, 2026-09-25).
 *
 * The last five duplicate paths beside `scopesService` were retired:
 *   - features/scope-system/redux/contextItemsSlice.ts  (a second catalog cache;
 *     `list_scope_type_items` + the only `context.system_context_item` reader)
 *   - features/scope-system/redux/templatesSlice.ts     (a second template path)
 *   - features/scope-system/redux/scopeValuesSlice.ts   (a second cell write,
 *     `set_scope_context_value`, and a third copy of the definitions)
 *   - features/agent-context/{service/hierarchyService,redux/hierarchyThunks}.ts
 *     (`get_user_full_context` read beside the service)
 *
 * Catalogs live on `scopesTree.contextItemsByTypeId` (contextItemCatalog.ts),
 * values on `contextValues` (scopeContextView.ts), templates on
 * `scopeTemplates`, and the full-context read is `scopesService.fetchUserFullContext`.
 * This fails if any of it comes back: a deleted module, an import of one, a
 * reducer key, an allowlist entry, or a scope RPC / context table called by
 * name outside the one service.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "features", "components", "lib", "hooks", "utils", "providers"];
const SKIP = new Set(["node_modules", ".next", "__snapshots__", "__tests__"]);

const RETIRED = [
  "features/scope-system/redux/contextItemsSlice.ts",
  "features/scope-system/redux/templatesSlice.ts",
  "features/scope-system/redux/scopeValuesSlice.ts",
  "features/scope-system/components/TemplateGalleryDrawer.tsx",
];

/** The reads/writes those paths made directly, which only the service may make. */
const DOOR_NAMES = [
  "get_user_full_context",
  "get_user_nav_tree",
  "list_scope_type_items",
  "set_scope_context_value",
  "get_scope_context",
  "list_templates",
  "apply_template_by_key",
];
const CALL_OF_A_DOOR = new RegExp(
  `\\.rpc\\(\\s*["'](${DOOR_NAMES.join("|")})["']`,
);
const READ_OF_SYSTEM_ITEMS = /\.from\(\s*["']system_context_item["']/;

/** Where those names may legitimately be called. */
const ALLOWED = new Set([
  "features/scopes/service/scopesService.ts",
  // Service-role admin CRUD for system_context_item (a server route, on the
  // chokepoint allowlist for that reason — not a duplicate client path).
  "app/api/admin/system-context/route.ts",
]);

function* sources(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

function allSources(): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  for (const top of SCAN) {
    for (const file of sources(join(ROOT, top))) {
      out.push({ path: relative(ROOT, file), text: readFileSync(file, "utf8") });
    }
  }
  return out;
}

it("the retired modules are gone", () => {
  expect(RETIRED.filter((p) => existsSync(join(ROOT, p)))).toEqual([]);
});

it("nothing imports a retired module", () => {
  const importOfRetired =
    /from\s+["'][^"']*scope-system\/(redux\/(contextItemsSlice|templatesSlice|scopeValuesSlice)|components\/TemplateGalleryDrawer)["']/;
  // …and the relative spelling from inside scope-system itself.
  const relativeImportOfRetired =
    /from\s+["'](\.{1,2}\/)+(redux\/)?(contextItemsSlice|templatesSlice|scopeValuesSlice|TemplateGalleryDrawer)["']/;
  const offenders = allSources()
    .filter(
      (f) =>
        importOfRetired.test(f.text) ||
        (f.path.startsWith("features/scope-system/") && relativeImportOfRetired.test(f.text)),
    )
    .map((f) => f.path);
  expect(offenders).toEqual([]);
});

it("the root reducer mounts no second catalog, values or templates key", () => {
  const src = readFileSync(join(ROOT, "lib/redux/rootReducer.ts"), "utf8");
  expect(src).not.toMatch(/^\s*contextItems\s*:/m);
  expect(src).not.toMatch(/^\s*scopeValues\s*:/m);
  expect(src).not.toMatch(/^\s*templates\s*:/m);
  expect(src).toMatch(/^\s*contextValues\s*:/m);
  expect(src).toMatch(/^\s*scopeTemplates\s*:/m);
});

it("the chokepoint allowlist names none of the retired paths", () => {
  const cfg = readFileSync(join(ROOT, "eslint.config.mjs"), "utf8");
  const offenders = [
    ...RETIRED,
    "features/agent-context/service/hierarchyService.ts",
    "features/agent-context/redux/hierarchyThunks.ts",
  ].filter((p) => cfg.includes(`"${p}"`));
  expect(offenders).toEqual([]);
});

it("no file outside the service calls a scope door or reads system context items by name", () => {
  const offenders = allSources()
    .filter((f) => !ALLOWED.has(f.path))
    .filter((f) => CALL_OF_A_DOOR.test(f.text) || READ_OF_SYSTEM_ITEMS.test(f.text))
    .map((f) => f.path);
  expect(offenders).toEqual([]);
});
