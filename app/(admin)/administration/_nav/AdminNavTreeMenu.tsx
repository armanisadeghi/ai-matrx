"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListTree, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { matchesSearch } from "@/utils/search-scoring";
import { adminNavigation } from "../categories";
import {
  adminDomainHref,
  findAdminNavigationLocation,
} from "@/features/admin/constants/admin-navigation";

const flatDestinations = adminNavigation.flatMap((domain) =>
  domain.sections.flatMap((section) =>
    section.destinations.map((item) => ({
      ...item,
      domainName: domain.name,
      sectionName: section.name,
    })),
  ),
);

const searchFields = [
  {
    get: (item: (typeof flatDestinations)[number]) => item.title,
    weight: "title" as const,
  },
  {
    get: (item: (typeof flatDestinations)[number]) => item.description,
    weight: "body" as const,
  },
  {
    get: (item: (typeof flatDestinations)[number]) => item.domainName,
    weight: "body" as const,
  },
  {
    get: (item: (typeof flatDestinations)[number]) => item.sectionName,
    weight: "body" as const,
  },
];

const iconSlot =
  "flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4 [&>svg]:max-w-none";

export default function AdminNavTreeMenu() {
  const pathname = usePathname() ?? "";
  const [searchQuery, setSearchQuery] = useState("");
  const activeLocation = findAdminNavigationLocation(pathname);

  const searchResults = (() => {
    const query = searchQuery.trim();
    if (!query) return [];
    return flatDestinations.filter((item) =>
      matchesSearch(item, query, searchFields),
    );
  })();

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
                aria-label="Browse administration"
              >
                <ListTree className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Browse administration</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent
        align="start"
        className="max-h-[80vh] w-80 overflow-y-auto"
      >
        <div className="p-2 pb-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search administration…"
              className="h-8 pl-7 text-xs"
              onKeyDown={(event) => event.stopPropagation()}
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
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No destinations match &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              searchResults.map((item) => (
                <DropdownMenuItem
                  key={item.link}
                  asChild
                  className={cn(
                    "gap-2",
                    activeLocation?.destination.link === item.link &&
                      "bg-accent/60",
                  )}
                >
                  <Link href={item.link}>
                    <span className={cn(iconSlot, "text-muted-foreground")}>
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {item.title}
                    </span>
                    <span className="max-w-24 truncate text-[10px] text-muted-foreground">
                      {item.domainName} → {item.sectionName}
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))
            )}
          </>
        ) : (
          adminNavigation.map((domain) => (
            <DropdownMenuSub key={domain.name}>
              <DropdownMenuSubTrigger className="gap-2">
                <span className={cn(iconSlot, "text-muted-foreground")}>
                  {domain.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{domain.name}</span>
                <span className="text-xs text-muted-foreground">
                  {domain.sections.reduce(
                    (count, section) => count + section.destinations.length,
                    0,
                  )}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="max-h-[80vh] w-80 overflow-y-auto">
                  <DropdownMenuItem asChild className="gap-2 font-medium">
                    <Link href={adminDomainHref(domain)}>
                      <span className={cn(iconSlot, "text-muted-foreground")}>
                        {domain.icon}
                      </span>
                      <span className="truncate">{domain.name} overview</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {domain.sections.map((section, sectionIndex) => (
                    <div key={section.name}>
                      {sectionIndex > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <span className={iconSlot}>{section.icon}</span>
                        {section.name}
                      </DropdownMenuLabel>
                      {section.destinations.map((item) => (
                        <DropdownMenuItem
                          key={item.link}
                          asChild
                          className={cn(
                            "gap-2",
                            activeLocation?.destination.link === item.link &&
                              "bg-accent/60",
                          )}
                        >
                          <Link href={item.link}>
                            <span
                              className={cn(iconSlot, "text-muted-foreground")}
                            >
                              {item.icon}
                            </span>
                            <span className="truncate">{item.title}</span>
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
