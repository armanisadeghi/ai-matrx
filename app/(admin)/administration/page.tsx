"use client";

import React, { Suspense, useState } from "react";
import { IconChevronRight, IconList, IconSearch } from "@tabler/icons-react";
import FeatureSectionLinkComponent from "@/components/animated/my-custom-demos/feature-section-link-component";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { adminCategories } from "@/app/(admin)/administration/categories";
import { Input } from "@/components/ui/input";
import { matchesSearch } from "@/utils/search-scoring";

// IMPORTANT: All features and routes are defined in: app/(admin)/administration/categories.tsx
// The top navigation menu automatically extracts routes from categories.tsx via config.ts

type AdminFeature = (typeof adminCategories)[number]["features"][number];
type AdminCategory = (typeof adminCategories)[number];

function sortByTitle<T extends { title: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );
}

function sortCategories(categories: typeof adminCategories): AdminCategory[] {
  return [...categories]
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    )
    .map((category) => ({
      ...category,
      features: sortByTitle(category.features),
    }));
}

const sortedAdminCategories = sortCategories(adminCategories);

const featureSearchFields = [
  { get: (feature: AdminFeature) => feature.title, weight: "title" as const },
  {
    get: (feature: AdminFeature) => feature.description,
    weight: "body" as const,
  },
];

const categorySearchFields = [
  { get: (category: AdminCategory) => category.name, weight: "title" as const },
];

function filterFeaturesBySearch(
  features: readonly AdminFeature[],
  query: string,
): AdminFeature[] {
  return sortByTitle(
    features.filter((feature) =>
      matchesSearch(feature, query, featureSearchFields),
    ),
  );
}

function categoryHref(name: string) {
  return `/administration?category=${encodeURIComponent(name)}`;
}

function AdminPageContent() {
  const searchParams = useSearchParams();
  const selectedCategory = searchParams.get("category");
  const [searchQuery, setSearchQuery] = useState("");

  const getPreviewFeatures = (features: any[]) => {
    if (features.length <= 8) return features;
    return features.slice(0, 8);
  };

  const getCategoryBgClass = (iconColor?: string) => {
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
      "text-fuchsia-600": "bg-fuchsia-500 dark:bg-fuchsia-600",
    };
    return (
      colorMap[iconColor || "text-blue-600"] || "bg-blue-500 dark:bg-blue-600"
    );
  };

  const normalizedQuery = searchQuery.toLowerCase().trim();

  const filteredCategories = React.useMemo(() => {
    if (!normalizedQuery) return sortedAdminCategories;

    return sortedAdminCategories
      .map((category) => {
        const filteredFeatures = filterFeaturesBySearch(
          category.features,
          searchQuery,
        );

        if (filteredFeatures.length > 0) {
          return {
            ...category,
            features: filteredFeatures,
          };
        }

        if (matchesSearch(category, searchQuery, categorySearchFields)) {
          return category;
        }

        return null;
      })
      .filter(Boolean) as AdminCategory[];
  }, [normalizedQuery, searchQuery]);

  const searchResults = React.useMemo(() => {
    if (!normalizedQuery) return [];
    return filteredCategories
      .flatMap((category) =>
        category.features.map((feature) => ({
          ...feature,
          categoryName: category.name,
        })),
      )
      .sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
  }, [filteredCategories, normalizedQuery]);

  const searchResultCount = searchResults.length;

  if (selectedCategory) {
    const category = sortedAdminCategories.find(
      (c) => c.name === selectedCategory,
    );
    return (
      <div className="h-full w-full overflow-y-auto">
        <div className="py-4 bg-neutral-100 dark:bg-neutral-900 w-full">
          <div className="w-full px-4">
            <Link
              href="/administration"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-4"
            >
              <IconChevronRight className="w-4 h-4 rotate-180" />
              All categories
            </Link>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {category?.features.map((feature, index) => (
                <FeatureSectionLinkComponent
                  key={feature.title}
                  title={feature.title}
                  description={feature.description}
                  icon={feature.icon}
                  index={index}
                  link={feature.link}
                  isNew={feature.isNew}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="py-4 bg-neutral-100 dark:bg-neutral-900 w-full">
        <div className="w-full px-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <h1 className="text-xl font-bold whitespace-nowrap">
              Admin Dashboard Home
            </h1>

            <div className="flex-1 max-w-2xl w-full mx-0 sm:mx-4 relative">
              <div className="relative">
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search admin routes, tools, and categories..."
                  className="w-full pl-9 bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 shadow-sm focus-visible:ring-blue-500"
                />
              </div>
            </div>

            <Link
              href="/administration/all-routes"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors whitespace-nowrap shrink-0"
            >
              <IconList className="w-4 h-4" />
              <span>All Routes</span>
            </Link>
          </div>

          {normalizedQuery ? (
            <>
              {searchResults.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {searchResultCount} result
                    {searchResultCount === 1 ? "" : "s"}
                  </p>

                  <div className="divide-y divide-border/60 rounded-md border border-border bg-card">
                    {searchResults.map((feature) => (
                      <Link
                        key={feature.link}
                        href={feature.link}
                        className="flex items-baseline gap-3 px-3 py-1.5 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      >
                        <span className="min-w-0 shrink-0 text-sm font-medium text-foreground">
                          {feature.title}
                          {feature.isNew && (
                            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                              New
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {feature.description}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground/70">
                          {feature.categoryName}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No results found for &ldquo;{searchQuery}&rdquo;
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredCategories.map((category) => (
                <div
                  key={category.name}
                  className="bg-white dark:bg-neutral-800 rounded-lg shadow-lg p-4 transform transition-all duration-200 hover:scale-105 hover:shadow-xl relative group"
                >
                  <Link
                    href={categoryHref(category.name)}
                    className="flex items-center space-x-4 mb-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div
                      className={`p-3 rounded-lg text-white ${getCategoryBgClass(category.iconColor)}`}
                    >
                      {category.icon}
                    </div>
                    <h3 className="text-xl font-semibold group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
                      {category.name}
                    </h3>
                  </Link>
                  <div className="h-auto flex flex-col justify-between">
                    <div
                      className={`grid gap-x-3 gap-y-1 ${getPreviewFeatures(category.features).length >= 5 ? "grid-cols-2" : "grid-cols-1"}`}
                    >
                      {getPreviewFeatures(category.features).map((feature) => (
                        <Link
                          key={feature.title}
                          href={feature.link}
                          className={`flex items-center h-6 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${feature.isNew ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-gray-600 dark:text-gray-300"} hover:text-blue-700 dark:hover:text-blue-500 transition-colors duration-200`}
                        >
                          <div className="shrink-0 w-3.5 h-3.5 mr-1.5 [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:max-w-none opacity-80">
                            {feature.icon}
                          </div>
                          <span className="text-sm font-medium truncate">
                            {feature.title}
                            {feature.isNew && (
                              <span className="ml-2 text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 rounded-full text-amber-600 dark:text-amber-400">
                                New
                              </span>
                            )}
                          </span>
                        </Link>
                      ))}
                    </div>
                    {category.features.length > 8 && (
                      <Link
                        href={categoryHref(category.name)}
                        className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors duration-200 mt-2 pl-7 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span>See all {category.features.length} features</span>
                        <IconChevronRight className="w-4 h-4 ml-1" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
          Loading administration…
        </div>
      }
    >
      <AdminPageContent />
    </Suspense>
  );
}
