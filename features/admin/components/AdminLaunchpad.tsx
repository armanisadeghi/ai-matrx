"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconExternalLink, IconRefresh, IconSearch } from "@tabler/icons-react";
import IconResolver from "@/components/official/icons/IconResolver";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminDomainHref,
  adminNavigationRegistry,
  type AdminNavigationDestination,
} from "@/features/admin/constants/admin-navigation";
import { cn } from "@/lib/utils";
import { matchesSearch } from "@/utils/search-scoring";
import { useVisibilityAwarePageRefresh } from "@/features/launchpad/hooks/useVisibilityAwarePageRefresh";

const getLaunchpadColumnCount = (viewportWidth: number) => {
  if (viewportWidth >= 2_500) return 7;
  if (viewportWidth >= 2_250) return 6;
  if (viewportWidth >= 1_900) return 5;
  if (viewportWidth >= 1_536) return 4;
  if (viewportWidth >= 1_280) return 3;
  if (viewportWidth >= 768) return 2;
  return 1;
};

interface LaunchpadSearchItem extends AdminNavigationDestination {
  domainName: string;
  sectionName: string;
}

const launchpadDomains = adminNavigationRegistry.filter(
  (domain) => domain.slug !== "launchpad",
);

const totalDestinationCount = launchpadDomains.reduce(
  (domainTotal, domain) =>
    domainTotal +
    domain.sections.reduce(
      (sectionTotal, section) => sectionTotal + section.destinations.length,
      0,
    ),
  0,
);

const launchpadSearchFields = [
  { get: (item: LaunchpadSearchItem) => item.title, weight: "title" as const },
  {
    get: (item: LaunchpadSearchItem) => item.description,
    weight: "body" as const,
  },
  { get: (item: LaunchpadSearchItem) => item.link, weight: "body" as const },
  {
    get: (item: LaunchpadSearchItem) => item.domainName,
    weight: "body" as const,
  },
  {
    get: (item: LaunchpadSearchItem) => item.sectionName,
    weight: "body" as const,
  },
];

/**
 * Dense administration launcher backed exclusively by adminNavigationRegistry.
 * A single one-shot timer refreshes stale code without polling; hidden tabs
 * wait until they become visible, and focused form controls get a short grace
 * period so the reload never interrupts typing.
 */
export default function AdminLaunchpad() {
  const [searchQuery, setSearchQuery] = useState("");
  const [columnCount, setColumnCount] = useState(1);
  const normalizedQuery = searchQuery.trim();

  useVisibilityAwarePageRefresh();

  useEffect(() => {
    const updateColumnCount = () => {
      setColumnCount(getLaunchpadColumnCount(window.innerWidth));
    };

    updateColumnCount();
    window.addEventListener("resize", updateColumnCount);
    return () => window.removeEventListener("resize", updateColumnCount);
  }, []);

  const visibleDomains = launchpadDomains.flatMap((domain) => {
    const sections = domain.sections.flatMap((section) => {
      const destinations = normalizedQuery
        ? section.destinations.filter((destination) =>
            matchesSearch(
              {
                ...destination,
                domainName: domain.name,
                sectionName: section.name,
              },
              searchQuery,
              launchpadSearchFields,
            ),
          )
        : section.destinations;

      return destinations.length > 0 ? [{ ...section, destinations }] : [];
    });

    return sections.length > 0 ? [{ ...domain, sections }] : [];
  });

  const visibleDestinationCount = visibleDomains.reduce(
    (domainTotal, domain) =>
      domainTotal +
      domain.sections.reduce(
        (sectionTotal, section) => sectionTotal + section.destinations.length,
        0,
      ),
    0,
  );

  const domainColumns = Array.from({ length: columnCount }, () => ({
    domains: [] as typeof visibleDomains,
    weight: 0,
  }));

  for (const domain of visibleDomains) {
    const lightestColumn = domainColumns.reduce((lightest, candidate) =>
      candidate.weight < lightest.weight ? candidate : lightest,
    );
    lightestColumn.domains.push(domain);
    lightestColumn.weight += domain.sections.reduce(
      (weight, section) => weight + section.destinations.length + 1,
      2,
    );
  }

  return (
    <div className="matrx-touch-targets h-full w-full overflow-y-auto bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <span className="shell-hide-sidebar" aria-hidden="true" />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex min-w-0 items-center gap-3 xl:w-80 xl:shrink-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm dark:bg-sky-500 dark:text-slate-950">
              <IconResolver iconName="Rocket" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight">
                Admin Launchpad
              </h1>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                Keep this page open. Every destination launches in a new tab.
              </p>
            </div>
          </div>

          <div className="relative min-w-0 flex-1">
            <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search every admin destination…"
              aria-label="Search administration destinations"
              className="h-9 border-slate-300 bg-white pl-9 shadow-none dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 xl:justify-end">
            <div className="text-right text-[11px] leading-tight text-slate-500 dark:text-slate-400">
              <div>
                {normalizedQuery
                  ? `${visibleDestinationCount} of ${totalDestinationCount}`
                  : `${totalDestinationCount} destinations`}
              </div>
              <div>Refreshes hourly when visible</div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-slate-300 bg-white px-2.5 dark:border-slate-700 dark:bg-slate-900"
              onClick={() => window.location.reload()}
            >
              <IconRefresh className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh now</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="p-3">
        {visibleDomains.length > 0 ? (
          <div
            className="grid items-start gap-3"
            style={{
              gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
            }}
          >
            {domainColumns.map((column, columnIndex) => (
              <div key={columnIndex} className="min-w-0">
                {column.domains.map((domain) => (
                  <section
                    key={domain.slug}
                    className="mb-3 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <Link
                      href={adminDomainHref(domain)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-2.5 border-b border-slate-200 bg-slate-50 px-3 py-2 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                      title={`Open ${domain.name} overview in a new tab`}
                    >
                      <span className={cn("shrink-0", domain.iconColor)}>
                        <IconResolver
                          iconName={domain.iconName}
                          className="h-4 w-4"
                        />
                      </span>
                      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {domain.name}
                      </h2>
                      <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                        {domain.sections.reduce(
                          (total, section) =>
                            total + section.destinations.length,
                          0,
                        )}
                      </span>
                      <IconExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-colors group-hover:text-sky-600 dark:group-hover:text-sky-400" />
                    </Link>

                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {domain.sections.map((section) => (
                        <div key={section.name} className="py-1">
                          <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                            <IconResolver
                              iconName={section.iconName}
                              className="h-3 w-3 shrink-0"
                            />
                            <span className="min-w-0 truncate">
                              {section.name}
                            </span>
                          </div>
                          <div>
                            {section.destinations.map((destination) => (
                              <Link
                                key={destination.link}
                                href={destination.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`${destination.description} — Opens in a new tab`}
                                className="group flex min-h-8 items-center gap-2 px-3 py-1 text-sm transition-colors hover:bg-sky-50 focus-visible:bg-sky-50 focus-visible:outline-none dark:hover:bg-sky-950/40 dark:focus-visible:bg-sky-950/40"
                              >
                                <IconResolver
                                  iconName={destination.iconName}
                                  className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-colors group-hover:text-sky-600 dark:group-hover:text-sky-400"
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {destination.title}
                                </span>
                                {destination.isNew && (
                                  <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                    New
                                  </span>
                                )}
                                <IconExternalLink className="h-3 w-3 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:text-slate-600" />
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            No administration destinations match &ldquo;{searchQuery}&rdquo;.
          </div>
        )}
      </main>
    </div>
  );
}
