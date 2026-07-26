"use client";

import { useState } from "react";
import { IconList, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { AdminDomainSection } from "@/features/admin/components/AdminDomainDirectory";
import {
  adminNavigationRegistry,
  type AdminNavigationDestination,
} from "@/features/admin/constants/admin-navigation";
import { matchesSearch } from "@/utils/search-scoring";
import {
  buildRouteSearchRows,
  filterRouteSearchRows,
} from "@/utils/route-discovery/filter-routes";
import {
  getAdminCatalogPaths,
  isRouteCataloged,
  normalizeCatalogLink,
} from "@/features/admin/utils/admin-route-catalog";
interface SearchDestination extends AdminNavigationDestination {
  domainName: string;
  sectionName: string;
}

const flatDestinations: SearchDestination[] = adminNavigationRegistry.flatMap(
  (domain) =>
    domain.sections.flatMap((section) =>
      section.destinations.map((item) => ({
        ...item,
        domainName: domain.name,
        sectionName: section.name,
      })),
    ),
);

const catalogPathSet = new Set(getAdminCatalogPaths());
const visibleCatalogLinkSet = new Set(
  flatDestinations
    .filter((item) => item.link.startsWith("/administration"))
    .map((item) => normalizeCatalogLink(item.link)),
);

const destinationSearchFields = [
  { get: (item: SearchDestination) => item.title, weight: "title" as const },
  {
    get: (item: SearchDestination) => item.description,
    weight: "body" as const,
  },
  { get: (item: SearchDestination) => item.link, weight: "body" as const },
  {
    get: (item: SearchDestination) => item.domainName,
    weight: "body" as const,
  },
  {
    get: (item: SearchDestination) => item.sectionName,
    weight: "body" as const,
  },
];

interface AdminDashboardClientProps {
  /** All filesystem routes under /administration (from server scan). */
  filesystemRoutes: string[];
}

export default function AdminDashboardClient({
  filesystemRoutes,
}: AdminDashboardClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const searchResults = (() => {
    if (!normalizedQuery) return [];
    return flatDestinations
      .filter((item) =>
        matchesSearch(item, searchQuery, destinationSearchFields),
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  })();

  const filesystemSearchResults = (() => {
    if (!normalizedQuery) return [];
    const rows = filterRouteSearchRows(
      buildRouteSearchRows(filesystemRoutes, "/administration"),
      searchQuery,
    );
    return rows.filter((row) => {
      if (visibleCatalogLinkSet.has(row.route)) return false;
      if (!isRouteCataloged(row.route, catalogPathSet)) return true;
      return !searchResults.some(
        (item) => normalizeCatalogLink(item.link) === row.route,
      );
    });
  })();

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="w-full bg-neutral-100 px-4 py-4 dark:bg-neutral-900">
        <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="whitespace-nowrap text-xl font-bold">
            Administration
          </h1>

          <div className="relative mx-0 w-full max-w-2xl flex-1 sm:mx-4">
            <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search domains, sections, routes, and tools…"
              className="w-full border-neutral-200 bg-white pl-9 shadow-sm focus-visible:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800"
            />
          </div>

          <Link
            href="/administration/utilities/all-routes"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <IconList className="h-4 w-4" />
            <span>All Routes</span>
          </Link>
        </div>

        {normalizedQuery ? (
          <div className="space-y-6">
            {searchResults.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Navigation registry ({searchResults.length})
                </p>
                <div className="divide-y divide-border/60 rounded-md border border-border bg-card">
                  {searchResults.map((item) => (
                    <Link
                      key={item.link}
                      href={item.link}
                      className="flex items-baseline gap-3 px-3 py-1.5 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      <span className="min-w-0 shrink-0 text-sm font-medium text-foreground">
                        {item.title}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground/70">
                        {item.domainName} → {item.sectionName}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {filesystemSearchResults.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Detail routes ({filesystemSearchResults.length})
                </p>
                <div className="divide-y divide-border/60 rounded-md border border-dashed border-amber-500/40 bg-card">
                  {filesystemSearchResults.map((row) => (
                    <Link
                      key={row.href}
                      href={row.href}
                      className="flex items-baseline gap-3 px-3 py-1.5 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      <span className="min-w-0 shrink-0 text-sm font-medium text-foreground">
                        {row.label}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                        {row.route}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground/70">
                        {row.category}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {searchResults.length === 0 &&
              filesystemSearchResults.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No results found for &ldquo;{searchQuery}&rdquo;
                </div>
              )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
            {adminNavigationRegistry.map((domain) => (
              <AdminDomainSection key={domain.slug} domain={domain} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
