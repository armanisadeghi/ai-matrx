/**
 * Shared route search/filter for route index pages and the admin dashboard.
 */

import { formatTitleCase } from "@/utils/text/text-case-converter";

export interface RouteSearchRow {
  /** Route segment path (no basePath prefix). */
  route: string;
  /** Full URL path including basePath. */
  href: string;
  /** Human label for display. */
  label: string;
  /** First path segment / group key. */
  category: string;
}

export function buildRouteSearchRows(
  routes: readonly string[],
  basePath: string,
): RouteSearchRow[] {
  const normalizedBase = basePath.endsWith("/")
    ? basePath.slice(0, -1)
    : basePath;

  return routes.map((route) => {
    const parts = route.split("/");
    const segment = parts[parts.length - 1] ?? route;
    const category = parts.length > 1 ? formatTitleCase(parts[0]!) : "Root";

    return {
      route,
      href: `${normalizedBase}/${route}`,
      label: formatTitleCase(segment.replace(/[[\].]/g, " ").trim()),
      category,
    };
  });
}

/** Case-insensitive match across route path, label, and category. */
export function filterRouteSearchRows(
  rows: readonly RouteSearchRow[],
  query: string,
): RouteSearchRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];

  return rows.filter(
    (row) =>
      row.route.toLowerCase().includes(q) ||
      row.label.toLowerCase().includes(q) ||
      row.category.toLowerCase().includes(q) ||
      row.href.toLowerCase().includes(q),
  );
}
