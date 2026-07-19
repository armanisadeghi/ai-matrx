"use client";

import { useState } from "react";
import Link from "next/link";
import { Braces, ChevronRight, FolderTree, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  adminCategoriesData,
  getAdminCategoryLandingPath,
  type AdminCategory,
} from "@/features/admin/constants/admin-categories";
import { buildRouteSearchRows } from "@/utils/route-discovery/filter-routes";

interface AdminRoutesDirectoryProps {
  routes: string[];
}

interface CategorizedRoutes {
  category: AdminCategory;
  routes: ReturnType<typeof buildRouteSearchRows>;
}

function normalizeAdminLink(link: string): string | null {
  if (!link.startsWith("/administration/")) return null;
  return (link.split("?")[0] ?? link).replace("/administration/", "");
}

function categorizeRoutes(routes: string[]): {
  categorized: CategorizedRoutes[];
  uncategorized: ReturnType<typeof buildRouteSearchRows>;
} {
  const rows = buildRouteSearchRows(routes, "/administration");
  const featurePrefixes = adminCategoriesData
    .flatMap((category) =>
      category.features.flatMap((feature) => {
        const route = normalizeAdminLink(feature.link);
        return route ? [{ category, route }] : [];
      }),
    )
    .sort((a, b) => b.route.length - a.route.length);

  const grouped = new Map<string, ReturnType<typeof buildRouteSearchRows>>();
  const uncategorized: ReturnType<typeof buildRouteSearchRows> = [];

  for (const row of rows) {
    const match = featurePrefixes.find(
      (candidate) =>
        row.route === candidate.route ||
        row.route.startsWith(`${candidate.route}/`),
    );
    if (!match) {
      uncategorized.push(row);
      continue;
    }
    const existing = grouped.get(match.category.name) ?? [];
    existing.push(row);
    grouped.set(match.category.name, existing);
  }

  const categorized = adminCategoriesData
    .flatMap((category) => {
      const categoryRoutes = grouped.get(category.name);
      return categoryRoutes ? [{ category, routes: categoryRoutes }] : [];
    })
    .sort((a, b) => a.category.name.localeCompare(b.category.name));

  return { categorized, uncategorized };
}

function RouteRow({
  row,
}: {
  row: ReturnType<typeof buildRouteSearchRows>[number];
}) {
  const dynamic = row.route.includes("[");
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {row.label}
        </span>
        <span className="block truncate font-mono text-[11px] text-muted-foreground">
          {row.href}
        </span>
      </span>
      {dynamic ? (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          Dynamic
        </Badge>
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </>
  );

  if (dynamic) {
    return (
      <div className="flex min-h-12 items-center gap-3 px-3 py-2">
        <Braces className="h-4 w-4 shrink-0 text-muted-foreground" />
        {content}
      </div>
    );
  }

  return (
    <Link
      href={row.href}
      className="flex min-h-12 items-center gap-3 px-3 py-2 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
    >
      <FolderTree className="h-4 w-4 shrink-0 text-primary" />
      {content}
    </Link>
  );
}

export function AdminRoutesDirectory({ routes }: AdminRoutesDirectoryProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const { categorized, uncategorized } = categorizeRoutes(routes);

  const visibleCategories = categorized.flatMap((group) => {
    if (!normalizedQuery) return [group];
    const categoryMatches = group.category.name
      .toLowerCase()
      .includes(normalizedQuery);
    const matchingRoutes = categoryMatches
      ? group.routes
      : group.routes.filter(
          (row) =>
            row.label.toLowerCase().includes(normalizedQuery) ||
            row.route.toLowerCase().includes(normalizedQuery),
        );
    return matchingRoutes.length > 0
      ? [{ ...group, routes: matchingRoutes }]
      : [];
  });

  const visibleUncategorized = normalizedQuery
    ? uncategorized.filter(
        (row) =>
          row.label.toLowerCase().includes(normalizedQuery) ||
          row.route.toLowerCase().includes(normalizedQuery),
      )
    : uncategorized;
  const visibleRouteCount =
    visibleCategories.reduce((sum, group) => sum + group.routes.length, 0) +
    visibleUncategorized.length;

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-10 rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Administration Route Directory
            </h1>
            <p className="text-sm text-muted-foreground">
              {visibleRouteCount} of {routes.length} routes grouped by their
              management area.
            </p>
          </div>
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search routes or management areas…"
              className="pl-9 text-base sm:text-sm"
            />
          </div>
        </div>
      </div>

      {visibleCategories.map(({ category, routes: categoryRoutes }) => (
        <section
          key={category.name}
          className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
        >
          <Link
            href={getAdminCategoryLandingPath(category)}
            className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3 transition-colors hover:bg-accent"
          >
            <span>
              <span className="block text-sm font-semibold text-foreground">
                {category.name}
              </span>
              <span className="block text-xs text-muted-foreground">
                {categoryRoutes.length} route
                {categoryRoutes.length === 1 ? "" : "s"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              Open hub
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </Link>
          <div className="grid divide-y divide-border/60 md:grid-cols-2 md:[&>*:nth-child(odd)]:border-r">
            {categoryRoutes.map((row) => (
              <RouteRow key={row.route} row={row} />
            ))}
          </div>
        </section>
      ))}

      {visibleUncategorized.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-dashed border-amber-500/50 bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Internal and uncategorized routes
            </h2>
            <p className="text-xs text-muted-foreground">
              These pages need a catalog parent before they can graduate into a
              management area.
            </p>
          </div>
          <div className="divide-y divide-border/60">
            {visibleUncategorized.map((row) => (
              <RouteRow key={row.route} row={row} />
            ))}
          </div>
        </section>
      ) : null}

      {visibleRouteCount === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          No administration routes match &ldquo;{query}&rdquo;.
        </div>
      ) : null}
    </div>
  );
}
