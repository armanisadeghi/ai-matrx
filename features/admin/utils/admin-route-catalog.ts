/**
 * Admin route catalog helpers — safe for client and server.
 *
 * Filesystem discovery lives in admin-route-catalog-server.ts (server-only).
 */

import { getDeclaredAdminRoutePatterns } from "@/features/admin/constants/admin-navigation";

export const ADMIN_BASE_PATH = "/administration";

/** Routes that intentionally omit a dashboard tile (meta / self-referential). */
export const CATALOG_EXEMPT_ROUTES = new Set<string>([
  // The all-routes index is listed; nothing else is exempt by default.
]);

export interface AdminCatalogCheckResult {
  discoveredRoutes: string[];
  catalogPaths: string[];
  /** Filesystem routes with no exact declaration in the navigation registry. */
  missingRoutes: string[];
  /** Catalog links under /administration with no matching page file. */
  staleCatalogLinks: string[];
  /** Scanner vs page-file walk disagree — indicates a discovery bug. */
  scannerDrift: string[];
  /** Registry entries that violate canonical domain-root nesting. */
  architectureErrors: string[];
}

export function normalizeCatalogLink(link: string): string {
  const pathOnly = link.split("?")[0] ?? link;
  return pathOnly.replace(/^\/administration\/?/, "").replace(/\/$/, "");
}

export function getAdminCatalogPaths(): string[] {
  return getDeclaredAdminRoutePatterns()
    .map(normalizeCatalogLink)
    .filter(Boolean)
    .sort();
}

export function isRouteCataloged(
  route: string,
  catalogPaths: ReadonlySet<string>,
): boolean {
  if (CATALOG_EXEMPT_ROUTES.has(route)) return true;
  return catalogPaths.has(route);
}
