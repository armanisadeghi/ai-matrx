"use client";

import React, { Suspense, useState } from "react";
import { IconChevronRight, IconList, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import FeatureSectionLinkComponent from "@/components/animated/my-custom-demos/feature-section-link-component";
import { Input } from "@/components/ui/input";
import { adminNavigation } from "@/app/(admin)/administration/categories";
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
import { adminDomainHref } from "@/features/admin/constants/admin-navigation";

type AdminDomain = (typeof adminNavigation)[number];
type AdminSection = AdminDomain["sections"][number];
type AdminDestination = AdminSection["destinations"][number];

interface SearchDestination extends AdminDestination {
  domainName: string;
  sectionName: string;
}

const flatDestinations: SearchDestination[] = adminNavigation.flatMap(
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

function domainDestinationCount(domain: AdminDomain): number {
  return domain.sections.reduce(
    (count, section) => count + section.destinations.length,
    0,
  );
}

function getDomainBgClass(iconColor?: string) {
  const colorMap: Record<string, string> = {
    "text-amber-600": "bg-amber-500 dark:bg-amber-600",
    "text-blue-600": "bg-blue-500 dark:bg-blue-600",
    "text-indigo-600": "bg-indigo-500 dark:bg-indigo-600",
    "text-purple-600": "bg-purple-500 dark:bg-purple-600",
    "text-green-600": "bg-green-500 dark:bg-green-600",
    "text-cyan-600": "bg-cyan-500 dark:bg-cyan-600",
    "text-pink-600": "bg-pink-500 dark:bg-pink-600",
    "text-orange-600": "bg-orange-500 dark:bg-orange-600",
    "text-red-600": "bg-red-500 dark:bg-red-600",
    "text-teal-600": "bg-teal-500 dark:bg-teal-600",
    "text-violet-600": "bg-violet-500 dark:bg-violet-600",
    "text-rose-600": "bg-rose-500 dark:bg-rose-600",
    "text-sky-600": "bg-sky-500 dark:bg-sky-600",
    "text-emerald-600": "bg-emerald-500 dark:bg-emerald-600",
    "text-lime-600": "bg-lime-500 dark:bg-lime-600",
  };
  return colorMap[iconColor ?? "text-blue-600"] ?? "bg-blue-500 dark:bg-blue-600";
}

interface AdminDashboardClientProps {
  /** All filesystem routes under /administration (from server scan). */
  filesystemRoutes: string[];
}

function DomainView({ domain }: { domain: AdminDomain }) {
  return (
    <div className="h-full w-full overflow-y-auto bg-textured">
      <div className="w-full px-4 py-5">
        <Link
          href="/administration"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <IconChevronRight className="h-4 w-4 rotate-180" />
          All domains
        </Link>

        <div className="mb-5 flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white ${getDomainBgClass(domain.iconColor)}`}
          >
            {domain.icon}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground">
              {domain.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {domain.sections.length} section
              {domain.sections.length === 1 ? "" : "s"} ·{" "}
              {domainDestinationCount(domain)} destinations
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {domain.sections.map((section) => (
            <section key={section.name}>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="flex h-6 w-6 items-center justify-center text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
                  {section.icon}
                </span>
                <h2>{section.name}</h2>
                <span className="text-xs font-normal text-muted-foreground">
                  {section.destinations.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {section.destinations.map((item, index) => (
                  <FeatureSectionLinkComponent
                    key={item.link}
                    title={item.title}
                    description={item.description}
                    icon={item.icon}
                    index={index}
                    link={item.link}
                    isNew={item.isNew}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminPageContent({ filesystemRoutes }: AdminDashboardClientProps) {
  const searchParams = useSearchParams();
  const selectedDomainName = searchParams.get("domain");
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const selectedDomain = selectedDomainName
    ? adminNavigation.find((domain) => domain.name === selectedDomainName)
    : undefined;

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

  if (selectedDomain) return <DomainView domain={selectedDomain} />;

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
            href="/administration/all-routes"
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {adminNavigation.map((domain) => (
              <div
                key={domain.name}
                className="group relative rounded-lg bg-white p-4 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl dark:bg-neutral-800"
              >
                <Link
                  href={adminDomainHref(domain.name)}
                  aria-label={`Open ${domain.name} administration`}
                  className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="pointer-events-none relative z-10 mb-3 flex items-center gap-3">
                  <div
                    className={`rounded-lg p-3 text-white ${getDomainBgClass(domain.iconColor)}`}
                  >
                    {domain.icon}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold transition-colors group-hover:text-blue-700 dark:group-hover:text-blue-400">
                      {domain.name}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {domain.sections.length} section
                      {domain.sections.length === 1 ? "" : "s"} ·{" "}
                      {domainDestinationCount(domain)} destinations
                    </p>
                  </div>
                </div>
                <div className="relative z-10 space-y-1">
                  {domain.sections.slice(0, 6).map((section) => (
                    <Link
                      key={section.name}
                      href={adminDomainHref(domain.name)}
                      className="flex h-6 items-center gap-2 rounded-sm text-sm text-gray-600 transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-gray-300 dark:hover:text-blue-400"
                    >
                      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center opacity-80 [&>svg]:h-3.5 [&>svg]:w-3.5">
                        {section.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {section.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {section.destinations.length}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboardClient({
  filesystemRoutes,
}: AdminDashboardClientProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Loading administration…
        </div>
      }
    >
      <AdminPageContent filesystemRoutes={filesystemRoutes} />
    </Suspense>
  );
}
