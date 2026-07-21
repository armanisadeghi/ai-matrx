/**
 * Server-side admin route catalog validation — filesystem discovery.
 *
 * Shared by check-admin-catalog.ts script. Do not import from client components.
 */

import { join } from "path";
import {
  discoverRoutesFromPageFiles,
  scanRoutesFsSync,
} from "@/utils/route-discovery/scan-fs";
import {
  CATALOG_EXEMPT_ROUTES,
  getAdminCatalogPaths,
  isRouteCataloged,
  type AdminCatalogCheckResult,
} from "@/features/admin/utils/admin-route-catalog";

export const ADMIN_ROUTE_ROOT = join(
  process.cwd(),
  "app",
  "(admin)",
  "administration",
);

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

  const missingRoutes: string[] = [];

  for (const route of discoveredRoutes) {
    if (CATALOG_EXEMPT_ROUTES.has(route)) continue;
    if (isRouteCataloged(route, catalogSet)) continue;

    missingRoutes.push(route);
  }

  const staleCatalogLinks = catalogPaths.filter((path) => {
    if (!path) return false;
    if (discoveredSet.has(path)) return false;
    return true;
  });

  return {
    discoveredRoutes,
    catalogPaths,
    missingRoutes,
    staleCatalogLinks,
    scannerDrift,
  };
}
