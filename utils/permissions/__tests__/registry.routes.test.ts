/**
 * registry.routes.test.ts — every share-registry destination is a REAL route.
 *
 * FOUND_DEFECTS D138. `platform.shareable_resource_registry.url_path_template`
 * was a second, DB-owned route authority that drifted from the `app/` tree: on
 * 2026-08-14, 24 of 73 active rows advertised URLs that resolve to no route at
 * all (`/apps/{id}` when the real route is `/agent-apps/{id}`, `/skills/{id}`,
 * `/workflows/{id}`, `/quizzes/{id}`, `/canvas/{id}`, `/runs/{id}`, …). Those
 * templates are rendered as links on the org sharing surfaces, so each one was a
 * 404 in a real user's face.
 *
 * Documentation did not stop it and could not: nothing connected the DB column
 * to the filesystem. This test does. It walks `app/**` for route leaves and
 * asserts that every non-empty template lands on one.
 *
 * WHEN THIS FAILS, there are exactly two correct fixes:
 *   1. the route exists under a different path  → correct the template (DB row +
 *      TS mirror + snapshot, in one commit);
 *   2. the route does not exist                 → set the template to '' (empty).
 * An empty template is the registry saying "this record has no signed-in
 * destination", and `getResourceSharePath` returns null so the surface renders
 * NO link. Never invent a plausible-looking path to make a link appear — that
 * guesswork is the defect itself.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SHAREABLE_RESOURCE_REGISTRY,
  getResourceSharePath,
} from "../registry";

const APP_DIR = join(__dirname, "..", "..", "..", "app");

/** Every route leaf in `app/`, as a URL path with `[param]` segments intact. */
function collectRoutes(dir: string, urlPath = ""): string[] {
  const out: string[] = [];
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    if (dirent.isFile()) {
      if (/^page(\.dev)?\.tsx$/.test(dirent.name)) out.push(urlPath || "/");
      continue;
    }
    if (!dirent.isDirectory() || dirent.name === "node_modules") continue;
    // A `_`-prefixed folder is a Next.js PRIVATE folder: opted out of routing
    // entirely, not flattened into its parent. Flattening it invents routes —
    // `app/_flashcard/[category]/[id]` becomes a root-level `/[category]/[id]`
    // that matches almost any two-segment URL, which silently made this very
    // guard pass on the `/apps/{id}` regression it exists to catch.
    if (dirent.name.startsWith("_")) continue;
    // Route groups `(core)` are organisational only and add no URL segment.
    const isGroup = /^\(.*\)$/.test(dirent.name);
    out.push(
      ...collectRoutes(
        join(dir, dirent.name),
        isGroup ? urlPath : `${urlPath}/${dirent.name}`,
      ),
    );
  }
  return out;
}

const ROUTES = Array.from(new Set(collectRoutes(APP_DIR)));

const MATCHERS = ROUTES.map((route) => ({
  route,
  re: new RegExp(
    `^${route
      .replace(/\[\[\.\.\.[^\]]+\]\]/g, "(.*)")
      .replace(/\[\.\.\.[^\]]+\]/g, "(.+)")
      .replace(/\[[^\]]+\]/g, "([^/]+)")}$`,
  ),
}));

function matchRoute(path: string): string | null {
  const pathname = path.split("?")[0];
  return MATCHERS.find((m) => m.re.test(pathname))?.route ?? null;
}

const ID = "00000000-0000-4000-8000-000000000000";
const ENTRIES = Object.values(SHAREABLE_RESOURCE_REGISTRY);

describe("shareable_resource_registry: url_path_template points at a real route", () => {
  it("the app route scan itself works (guards against a silently empty scan)", () => {
    expect(ROUTES.length).toBeGreaterThan(500);
    expect(matchRoute("/agents/abc")).toBe("/agents/[id]");
    expect(matchRoute("/definitely/not/a/route")).toBeNull();
    // The exact shape that defeated this guard once: a two-segment URL under a
    // path that has no route must NOT match. If a private-folder or catch-all
    // scan bug ever reintroduces a root-level `/[a]/[b]`, this fails here rather
    // than silently greenlighting every broken template below.
    expect(matchRoute("/apps/some-id")).toBeNull();
    expect(matchRoute("/skills/some-id")).toBeNull();
  });

  it.each(
    ENTRIES.filter((e) => e.urlPathTemplate !== "").map((e) => [
      e.resourceType,
      e.urlPathTemplate,
    ]),
  )("%s -> %s resolves to a real route", (_token, template) => {
    const path = template.replace(/\{id\}/g, ID);
    // A template keyed on something other than {id} (e.g. learn_doc's {slug})
    // cannot be resolved from an id. `getResourceSharePath` already refuses
    // those, so they are not link-producing and not this test's business.
    if (/\{[^}]*\}/.test(path)) return;
    expect(matchRoute(path)).not.toBeNull();
  });

  it("never hands a caller a path that resolves to no route", () => {
    const fabricated = ENTRIES.map((e) => ({
      token: e.resourceType,
      href: getResourceSharePath(e.resourceType, ID),
    }))
      .filter((r) => r.href !== null && matchRoute(r.href as string) === null)
      .map((r) => `${r.token} -> ${r.href}`);
    expect(fabricated).toEqual([]);
  });

  it("canvas_item degrades honestly: no route invented while D137 is open", () => {
    // `/canvas/{id}` has no route and the canonical canvas route is Arman's
    // call (D137). Until then the correct behaviour is NO link, never a guess.
    expect(getResourceSharePath("canvas_item", ID)).toBeNull();
    expect(SHAREABLE_RESOURCE_REGISTRY.canvas_item.urlPathTemplate).toBe("");
  });
});
