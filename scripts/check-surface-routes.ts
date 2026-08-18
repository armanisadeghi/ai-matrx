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
 * Loud, and only fails on the unambiguous case — per the house rule that
 * checks scream rather than block.
 */

import { readdirSync, statSync } from "node:fs";
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

  if (phantoms.length > 0) {
    console.error(
      `\nPHANTOM surface mapping${phantoms.length === 1 ? "" : "s"}: route-to-surface points live routes at a surface with NO manifest. Those routes cannot bind an agent, emit values, or be audited. Declare the manifest or remove the mapping:`,
    );
    for (const phantom of phantoms) {
      console.error(`  - ${phantom.prefix} -> ${phantom.surface} (no manifest)`);
    }
    process.exit(1);
  }

  process.exit(0);
}

main();
