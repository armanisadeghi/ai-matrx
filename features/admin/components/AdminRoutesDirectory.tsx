"use client";

import { useState } from "react";
import Link from "next/link";
import { Braces, ChevronRight, FolderTree, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  adminDomainHref,
  adminNavigationRegistry,
  findAdminNavigationLocationByRoutePattern,
  type AdminNavigationDomain,
  type AdminNavigationSection,
} from "@/features/admin/constants/admin-navigation";
import { buildRouteSearchRows } from "@/utils/route-discovery/filter-routes";

interface AdminRoutesDirectoryProps {
  routes: string[];
}

type RouteRows = ReturnType<typeof buildRouteSearchRows>;

interface SectionRouteGroup {
  domain: AdminNavigationDomain;
  section: AdminNavigationSection;
  routes: RouteRows;
}

function groupRoutes(routes: string[]): {
  groups: SectionRouteGroup[];
  uncategorized: RouteRows;
} {
  const rows = buildRouteSearchRows(routes, "/administration");
  const grouped = new Map<string, RouteRows>();
  const uncategorized: RouteRows = [];

  for (const row of rows) {
    const location = findAdminNavigationLocationByRoutePattern(row.route);
    if (!location) {
      uncategorized.push(row);
      continue;
    }
    const key = `${location.domain.name}\u0000${location.section.name}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  const groups = adminNavigationRegistry.flatMap((domain) =>
    domain.sections.flatMap((section) => {
      const key = `${domain.name}\u0000${section.name}`;
      const sectionRoutes = grouped.get(key);
      return sectionRoutes ? [{ domain, section, routes: sectionRoutes }] : [];
    }),
  );

  return { groups, uncategorized };
}

function RouteRow({ row }: { row: RouteRows[number] }) {
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
  const { groups, uncategorized } = groupRoutes(routes);

  const visibleGroups = groups.flatMap((group) => {
    if (!normalizedQuery) return [group];
    const hierarchyMatches =
      group.domain.name.toLowerCase().includes(normalizedQuery) ||
      group.section.name.toLowerCase().includes(normalizedQuery);
    const matchingRoutes = hierarchyMatches
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
    visibleGroups.reduce((sum, group) => sum + group.routes.length, 0) +
    visibleUncategorized.length;

  const domains = adminNavigationRegistry.flatMap((domain) => {
    const domainGroups = visibleGroups.filter(
      (group) => group.domain.name === domain.name,
    );
    return domainGroups.length > 0 ? [{ domain, groups: domainGroups }] : [];
  });

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-10 rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Administration Route Directory
            </h1>
            <p className="text-sm text-muted-foreground">
              {visibleRouteCount} of {routes.length} explicitly registered
              routes.
            </p>
          </div>
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search domains, sections, or routes…"
              className="pl-9 text-base sm:text-sm"
            />
          </div>
        </div>
      </div>

      {domains.map(({ domain, groups: domainGroups }) => (
        <section key={domain.name} className="space-y-3">
          <Link
            href={adminDomainHref(domain.name)}
            className="inline-flex items-center gap-2 text-base font-semibold text-foreground hover:text-primary"
          >
            {domain.name}
            <ChevronRight className="h-4 w-4" />
          </Link>
          <div className="grid gap-4 xl:grid-cols-2">
            {domainGroups.map(({ section, routes: sectionRoutes }) => (
              <div
                key={section.name}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
              >
                <div className="border-b border-border bg-muted/40 px-4 py-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    {section.name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {sectionRoutes.length} route
                    {sectionRoutes.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="divide-y divide-border/60">
                  {sectionRoutes.map((row) => (
                    <RouteRow key={row.route} row={row} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {visibleUncategorized.length > 0 ? (
        <section className="overflow-hidden rounded-xl border-2 border-dashed border-red-500 bg-card">
          <div className="border-b border-red-500/40 bg-red-500/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">
              Unregistered administration routes
            </h2>
            <p className="text-xs text-muted-foreground">
              These routes must be declared in admin-navigation.ts.
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
