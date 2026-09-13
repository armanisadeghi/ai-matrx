/**
 * Surface ROUTE COVERAGE check — the guard that was missing on 2026-08-17.
 *
 * `check:surface-drift` validates manifests against themselves. It cannot see
 * the two failure modes that let a route go undeclared for months:
 *
 *   1. A PHANTOM mapping — `route-to-surface.ts` points live routes at a
 *      surface name that has no manifest. Those routes resolve to a surface
 *      that cannot bind an agent, cannot emit values, and cannot be audited.
 *      This is an ERROR: it is unambiguous, and it is exactly what hid
 *      `matrx-user/agent-shortcuts` (ten live routes, no manifest, no DB row).
 *
 *   2. An UNDECLARED route — a live `(core)` route that resolves to no surface
 *      at all. Some of these are correct (redirects, token-accept flows,
 *      feature admin maps, marketing landings), so this is REPORTED, never
 *      failed. The number is the campaign's honest backlog.
 *
 *   3. A DEAD `urlPattern` — a manifest that declares an address no live app
 *      route can produce (added 2026-09-12). The first two checks are both
 *      blind to it: (1) only reads `SURFACE_ROUTE_MAPPINGS`, which marketing
 *      does not use (it resolves through `resolveMarketingSurface`), and (2)
 *      asks "does this route resolve to A surface", which the marketing
 *      resolver answers `matrx-user/marketing` for EVERY `/marketing/**`
 *      path — so the whole family read as covered while 23 manifests pointed
 *      at `/marketing/brands/[brandId]/sites/[siteId]/…`, a tree that became a
 *      single redirector when the agency-model routes shipped. The page
 *      surface never resolved, the header named the HUB, and every marketing
 *      write target was unreachable. This is an ERROR: a manifest addressing
 *      nothing is a surface no agent can ever be pointed at.
 *
 * Loud, and only fails on the unambiguous cases — per the house rule that
 * checks scream rather than block.
 *
 * `--self-test` proves check 3 still fires, by running the detector against a
 * synthetic manifest carrying the exact dead pattern from that incident.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALL_MANIFESTS } from "@/features/surfaces/manifests/registry";
import {
  SURFACE_ROUTE_MAPPINGS,
  surfaceFromPathname,
} from "@/features/surfaces/utils/route-to-surface";

const CORE_ROOT = "app/(core)";

/**
 * Routes that resolve to no surface ON PURPOSE. Each entry is a prefix and a
 * reason. Keep this list short and justified — it is an admission, not a
 * dumping ground. A route added here without a real reason re-creates the
 * blindness this script exists to remove.
 */
const DELIBERATELY_UNMAPPED: readonly { prefix: string; reason: string }[] = [
  { prefix: "/knowledge-graph", reason: "permanentRedirect to /knowledge/graph" },
  { prefix: "/invitations/", reason: "token-accept flow, no agent surface" },
  { prefix: "/welcome", reason: "onboarding landing" },
  { prefix: "/features", reason: "static feature directory" },
  { prefix: "/voice", reason: "module landing; /voice/playground maps to chat-voice" },
  { prefix: "/surfaces", reason: "the surfaces hub itself (meta configuration UI)" },
  { prefix: "/masterwork", reason: "declared by the Masterwork campaign, not here" },
  {
    prefix: "/legal",
    reason:
      "vertical index; the workspace under /legal/ca-wc is declared as matrx-user/legal-ca-wc",
  },
  {
    prefix: "/dictionary/admin",
    reason: "FeatureAdminPage route map, not a working surface",
  },
  {
    prefix: "/tool-call-visualization/admin",
    reason: "FeatureAdminPage route map, not a working surface",
  },
];

/** Every `page.tsx` under app/(core), as a URL path with dynamic segments intact. */
function collectCoreRoutes(): string[] {
  const routes: string[] = [];
  const walk = (dir: string, url: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (!statSync(full).isDirectory()) {
        if (entry === "page.tsx") routes.push(url || "/");
        continue;
      }
      // Route groups `(x)` contribute no URL segment.
      const isGroup = entry.startsWith("(") && entry.endsWith(")");
      walk(full, isGroup ? url : `${url}/${entry}`);
    }
  };
  walk(CORE_ROOT, "");
  return routes.sort();
}

/** Substitute a plausible concrete value for each dynamic segment. */
function toConcretePath(route: string): string {
  return route
    .replace(/\[\[?\.\.\.[^\]]+\]?\]/g, "sample")
    .replace(/\[[^\]]+\]/g, "11111111-1111-1111-1111-111111111111");
}

/**
 * Every `page.tsx` in the whole `app/` tree (all route groups — manifests
 * address `(admin)`, `(public)` and `(core)` alike), as a URL path with
 * dynamic segments intact.
 *
 * One exclusion: a CATCH-ALL route whose page only forwards. A redirect-only
 * leaf like `/chat` is still a real address (it is where the user types), but
 * `marketing/brands/[brandId]/[[...rest]]` is a legacy DOOR standing in for a
 * whole retired tree — count its tail-absorbing shape as live and every dead
 * address under it reads as covered, which is exactly how 23 marketing
 * manifests kept pointing at a tree that no longer renders anything.
 */
function isRedirectOnlyPage(file: string): boolean {
  const src = readFileSync(file, "utf8");
  if (!/\b(permanentRedirect|redirect)\s*\(/.test(src)) return false;
  // A real page renders something. Look for a CLOSING or self-closing JSX tag
  // — `<Foo` alone is not enough, because every typed `Promise<{…}>` or
  // `Record<string, …>` in a redirector's signature looks like an opening tag.
  return !/<\/[A-Za-z]|\/>/.test(src);
}

function collectAppRoutes(): string[] {
  const routes: string[] = [];
  const walk = (dir: string, url: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (!statSync(full).isDirectory()) {
        if (entry === "page.tsx" || entry === "page.dev.tsx") {
          const isCatchAll = /\[\[?\.\.\./.test(url);
          if (isCatchAll && isRedirectOnlyPage(full)) continue;
          routes.push(url || "/");
          // An OPTIONAL catch-all leaf (`[[...path]]`) also serves its base
          // path with zero segments — `/user-settings` is a real address even
          // though the only page file sits under `[[...path]]`.
          const optionalLeaf = url.match(/^(.*)\/\[\[\.\.\.[^\]]+\]\]$/);
          if (optionalLeaf) routes.push(optionalLeaf[1] || "/");
        }
        continue;
      }
      if (entry === "api") continue;
      const isGroup = entry.startsWith("(") && entry.endsWith(")");
      const isSlot = entry.startsWith("@");
      walk(full, isGroup || isSlot ? url : `${url}/${entry}`);
    }
  };
  walk("app", "");
  return routes.sort();
}

/**
 * Path → comparable segments. A dynamic segment (`[id]`, `:id`) becomes `*`;
 * a catch-all (`[...rest]`, `[[...rest]]`) becomes `**` and absorbs the tail.
 */
function segmentsOf(path: string): string[] {
  return path
    .split("?")[0]
    .split("#")[0]
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (/^\[\[?\.\.\..+\]\]?$/.test(segment)) return "**";
      if (segment.startsWith("[") || segment.startsWith(":")) return "*";
      return segment;
    });
}

/**
 * Does a declared `urlPattern` address a live route? A literal pattern
 * segment must be a literal route segment — a dynamic route segment does NOT
 * satisfy it, or `/marketing/[brandId]/…` would "cover" the retired
 * `/marketing/brands/…` shape and hide the whole class again.
 */
export function urlPatternMatchesRoute(
  pattern: string,
  routeSegments: readonly string[],
): boolean {
  const isPrefix = pattern.trimEnd().endsWith("*") && !pattern.endsWith("]*");
  const segments = segmentsOf(pattern.replace(/\*+\s*$/, ""));
  for (let i = 0; i < segments.length; i += 1) {
    const routeSegment = routeSegments[i];
    if (routeSegment === "**") return true; // catch-all absorbs the tail
    if (routeSegment === undefined) return false;
    const declared = segments[i];
    if (declared === "**") return true;
    if (declared === "*" ? routeSegment !== "*" : routeSegment !== declared) {
      return false;
    }
  }
  return isPrefix || routeSegments.length === segments.length;
}

function isDeliberatelyUnmapped(route: string): string | null {
  const hit = DELIBERATELY_UNMAPPED.find(
    (entry) => route === entry.prefix || route.startsWith(entry.prefix),
  );
  return hit ? hit.reason : null;
}

function main(): void {
  const manifestNames = new Set(ALL_MANIFESTS.map((m) => m.surfaceName));

  // ── 1. Phantom mappings (ERROR) ──────────────────────────────────────
  const phantoms = SURFACE_ROUTE_MAPPINGS.filter(
    (mapping) => !manifestNames.has(mapping.surface),
  );

  // ── 2. Undeclared routes (REPORT) ────────────────────────────────────
  const routes = collectCoreRoutes();
  const undeclared: string[] = [];
  const excused: string[] = [];
  for (const route of routes) {
    if (surfaceFromPathname(toConcretePath(route))) continue;
    if (isDeliberatelyUnmapped(route)) excused.push(route);
    else undeclared.push(route);
  }

  console.log(
    `Surface route coverage: ${routes.length} (core) routes, ${manifestNames.size} manifests, ${SURFACE_ROUTE_MAPPINGS.length} prefix mappings.`,
  );
  console.log(
    `  resolved: ${routes.length - undeclared.length - excused.length}   deliberately unmapped: ${excused.length}   UNDECLARED: ${undeclared.length}`,
  );

  if (undeclared.length > 0) {
    console.warn(
      `\n${undeclared.length} (core) route${undeclared.length === 1 ? "" : "s"} resolve to NO surface. Each is either a surface waiting to be declared (see the surface-authoring skill) or an entry for DELIBERATELY_UNMAPPED in this script — with a reason:`,
    );
    for (const route of undeclared) console.warn(`  - ${route}`);
  }

  // ── 3. Dead urlPatterns (ERROR) ──────────────────────────────────────
  const appRoutes = collectAppRoutes().map(segmentsOf);
  const deadPatterns: { surface: string; pattern: string }[] = [];
  for (const manifest of ALL_MANIFESTS) {
    const pattern = manifest.urlPattern;
    if (!pattern) continue;
    const alive = appRoutes.some((route) =>
      urlPatternMatchesRoute(pattern, route),
    );
    if (!alive) {
      deadPatterns.push({ surface: manifest.surfaceName, pattern });
    }
  }
  console.log(
    `  urlPatterns: ${ALL_MANIFESTS.filter((m) => m.urlPattern).length} declared over ${appRoutes.length} live app routes   DEAD: ${deadPatterns.length}`,
  );

  if (deadPatterns.length > 0) {
    console.error(
      `\nDEAD urlPattern${deadPatterns.length === 1 ? "" : "s"}: the manifest declares an address NO live app route can produce, so the surface can never be resolved from a URL and its write targets are unreachable. Point it at the live route (or delete the pattern):`,
    );
    for (const { surface, pattern } of deadPatterns) {
      console.error(`  - ${surface} -> ${pattern} (no live route)`);
    }
  }

  if (phantoms.length > 0) {
    console.error(
      `\nPHANTOM surface mapping${phantoms.length === 1 ? "" : "s"}: route-to-surface points live routes at a surface with NO manifest. Those routes cannot bind an agent, emit values, or be audited. Declare the manifest or remove the mapping:`,
    );
    for (const phantom of phantoms) {
      console.error(`  - ${phantom.prefix} -> ${phantom.surface} (no manifest)`);
    }
  }

  process.exit(phantoms.length > 0 || deadPatterns.length > 0 ? 1 : 0);
}

/**
 * Prove the dead-urlPattern detector still fires, using the exact pattern that
 * went undetected for the whole marketing family, against the live route tree.
 */
function selfTest(): void {
  const appRoutes = collectAppRoutes().map(segmentsOf);
  const cases: { pattern: string; shouldBeAlive: boolean; why: string }[] = [
    {
      pattern: "/marketing/brands/[brandId]/sites/[siteId]/pages/[pageId]",
      shouldBeAlive: false,
      why: "the retired brand-first page workspace (only a redirector lives there now)",
    },
    {
      pattern: "/marketing/[brandId]/websites/[siteId]/pages/[pageId]",
      shouldBeAlive: true,
      why: "the live page workspace",
    },
    {
      pattern: "/chat",
      shouldBeAlive: true,
      why: "a plain live route",
    },
    {
      pattern: "/marketing/reports*",
      shouldBeAlive: true,
      why: "a prefix pattern over a live subtree",
    },
  ];

  let failures = 0;
  for (const { pattern, shouldBeAlive, why } of cases) {
    const alive = appRoutes.some((route) =>
      urlPatternMatchesRoute(pattern, route),
    );
    const ok = alive === shouldBeAlive;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${pattern} → ${alive ? "alive" : "DEAD"} (expected ${shouldBeAlive ? "alive" : "DEAD"}: ${why})`,
    );
  }
  if (failures > 0) {
    console.error(
      `\nSELF-TEST FAILED: the dead-urlPattern detector no longer distinguishes a retired address from a live one.`,
    );
    process.exit(1);
  }
  console.log("\nSelf-test passed: dead-urlPattern detection is live.");
  process.exit(0);
}

if (process.argv.includes("--self-test")) selfTest();
else main();
