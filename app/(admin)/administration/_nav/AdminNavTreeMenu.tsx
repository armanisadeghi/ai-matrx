"use client";

import React, { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ListTree, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { matchesSearch } from "@/utils/search-scoring";
import { adminCategories } from "../categories";

type AdminCategory = (typeof adminCategories)[number];
type AdminFeature = AdminCategory["features"][number];

function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

function sortByTitle<T extends { title: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );
}

const sortedCategories: AdminCategory[] = sortByName(adminCategories).map(
  (category) => ({
    ...category,
    features: sortByTitle(category.features),
  }),
);

const flatFeatures = sortedCategories.flatMap((category) =>
  category.features.map((feature) => ({
    ...feature,
    categoryName: category.name,
  })),
);

const featureSearchFields = [
  {
    get: (f: (typeof flatFeatures)[number]) => f.title,
    weight: "title" as const,
  },
  {
    get: (f: (typeof flatFeatures)[number]) => f.description,
    weight: "body" as const,
  },
  {
    get: (f: (typeof flatFeatures)[number]) => f.link,
    weight: "body" as const,
  },
  {
    get: (f: (typeof flatFeatures)[number]) => f.categoryName,
    weight: "body" as const,
  },
];

const iconSlot =
  "flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4 [&>svg]:max-w-none";

export default function AdminNavTreeMenu() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [searchQuery, setSearchQuery] = useState("");

  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return flatFeatures.filter((feature) =>
      matchesSearch(feature, q, featureSearchFields),
    );
  }, [searchQuery]);

  const showSearchResults = searchQuery.trim().length > 0;

  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-800 hover:bg-accent dark:text-gray-300"
                aria-label="Browse all admin tools"
              >
                <ListTree className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Browse all tools</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent
        align="start"
        className="max-h-[80vh] w-72 overflow-y-auto"
      >
        <div className="p-2 pb-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools…"
              className="h-8 pl-7 text-xs"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        {showSearchResults ? (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {searchResults.length} result
              {searchResults.length === 1 ? "" : "s"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {searchResults.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                No tools match &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              searchResults.map((feature) => {
                const active = pathname === feature.link;
                return (
                  <DropdownMenuItem
                    key={feature.link}
                    onSelect={() => router.push(feature.link)}
                    className={cn("gap-2", active && "bg-accent/60")}
                  >
                    <span className={cn(iconSlot, "text-muted-foreground")}>
                      {feature.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {feature.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate max-w-[5rem]">
                      {feature.categoryName}
                    </span>
                  </DropdownMenuItem>
                );
              })
            )}
          </>
        ) : (
          sortedCategories.map((category) => (
            <DropdownMenuSub key={category.name}>
              <DropdownMenuSubTrigger className="gap-2">
                <span className={cn(iconSlot, "text-muted-foreground")}>
                  {category.icon}
                </span>
                <span className="truncate">
                  {category.name}{" "}
                  <span className="text-muted-foreground">
                    ({category.features.length})
                  </span>
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="max-h-[80vh] w-72 overflow-y-auto">
                  {category.features.map((feature: AdminFeature) => {
                    const active = pathname === feature.link;
                    return (
                      <DropdownMenuItem
                        key={feature.link}
                        onSelect={() => router.push(feature.link)}
                        className={cn("gap-2", active && "bg-accent/60")}
                      >
                        <span className={cn(iconSlot, "text-muted-foreground")}>
                          {feature.icon}
                        </span>
                        <span className="truncate">{feature.title}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
