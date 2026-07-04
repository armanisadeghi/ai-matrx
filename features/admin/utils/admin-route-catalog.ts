/**
 * Admin route catalog validation — shared by check-admin-catalog.ts and UI.
 *
 * Compares filesystem routes under app/(admin)/administration against links
 * declared in features/admin/constants/admin-categories.ts.
 */

import { join } from "path";
import {
  discoverRoutesFromPageFiles,
  scanRoutesFsSync,
} from "@/utils/route-discovery/scan-fs";
import { adminCategoriesData } from "@/features/admin/constants/admin-categories";

export const ADMIN_ROUTE_ROOT = join(
  process.cwd(),
  "app",
  "(admin)",
  "administration",
);

export const ADMIN_BASE_PATH = "/administration";

/** Routes that intentionally omit a dashboard tile (meta / self-referential). */
export const CATALOG_EXEMPT_ROUTES = new Set<string>([
  // The all-routes index is listed; nothing else is exempt by default.
]);

export interface AdminCatalogCheckResult {
  discoveredRoutes: string[];
  catalogPaths: string[];
  /** Static routes with no catalog entry. */
  missingStatic: string[];
  /** Dynamic routes whose static parent is not cataloged. */
  missingDynamicParents: string[];
  /** Catalog links under /administration with no matching page file. */
  staleCatalogLinks: string[];
  /** Scanner vs page-file walk disagree — indicates a discovery bug. */
  scannerDrift: string[];
}

export function normalizeCatalogLink(link: string): string {
  const pathOnly = link.split("?")[0] ?? link;
  return pathOnly.replace(/^\/administration\/?/, "").replace(/\/$/, "");
}

export function getAdminCatalogPaths(): string[] {
  const paths = new Set<string>();

  for (const category of adminCategoriesData) {
    for (const feature of category.features) {
      if (!feature.link.startsWith("/administration")) continue;
      const normalized = normalizeCatalogLink(feature.link);
      if (normalized) paths.add(normalized);
    }
  }

  return [...paths].sort();
}

export function isDynamicRoute(route: string): boolean {
  return route.includes("[");
}

/** Static prefix before the first dynamic segment. */
export function staticParentRoute(route: string): string {
  const idx = route.indexOf("[");
  if (idx === -1) return route;
  return route.slice(0, idx).replace(/\/$/, "");
}

export function isRouteCataloged(
  route: string,
  catalogPaths: ReadonlySet<string>,
): boolean {
  if (CATALOG_EXEMPT_ROUTES.has(route)) return true;
  if (catalogPaths.has(route)) return true;

  if (isDynamicRoute(route)) {
    let path = staticParentRoute(route);
    while (path.length > 0) {
      if (catalogPaths.has(path)) return true;
      const lastSlash = path.lastIndexOf("/");
      if (lastSlash === -1) break;
      path = path.slice(0, lastSlash);
    }
    return false;
  }

  return false;
}

export function discoverAdministrationRoutes(): string[] {
  return scanRoutesFsSync(ADMIN_ROUTE_ROOT).sort();
}

export function checkAdminRouteCatalog(): AdminCatalogCheckResult {
  const discoveredRoutes = discoverAdministrationRoutes();
  const catalogPaths = getAdminCatalogPaths();
  const catalogSet = new Set(catalogPaths);

  const pageFileRoutes = discoverRoutesFromPageFiles(ADMIN_ROUTE_ROOT);
  const discoveredSet = new Set(discoveredRoutes);
  const scannerDrift = [
    ...pageFileRoutes.filter((r) => !discoveredSet.has(r)),
    ...discoveredRoutes.filter((r) => !pageFileRoutes.includes(r)),
  ].sort();

  const missingStatic: string[] = [];
  const missingDynamicParents: string[] = [];

  for (const route of discoveredRoutes) {
    if (CATALOG_EXEMPT_ROUTES.has(route)) continue;
    if (isRouteCataloged(route, catalogSet)) continue;

    if (isDynamicRoute(route)) {
      missingDynamicParents.push(route);
    } else {
      missingStatic.push(route);
    }
  }

  const staleCatalogLinks = catalogPaths.filter((path) => {
    if (!path) return false;
    if (discoveredSet.has(path)) return false;
    // Allow catalog entries that are parents of discovered routes (e.g. hubs).
    for (const route of discoveredRoutes) {
      if (route.startsWith(`${path}/`)) return false;
    }
    return true;
  });

  return {
    discoveredRoutes,
    catalogPaths,
    missingStatic,
    missingDynamicParents,
    staleCatalogLinks,
    scannerDrift,
  };
}
