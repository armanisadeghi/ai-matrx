"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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

const iconSlot =
  "flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4 [&>svg]:max-w-none";

export default function AdminNavTreeMenu() {
  const router = useRouter();
  const pathname = usePathname() ?? "";

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
        className="max-h-[80vh] w-64 overflow-y-auto"
      >
        {sortedCategories.map((category) => (
          <DropdownMenuSub key={category.name}>
            <DropdownMenuSubTrigger className="gap-2">
              <span className={cn(iconSlot, "text-muted-foreground")}>
                {category.icon}
              </span>
              <span className="truncate">{category.name}</span>
              <span className="ml-auto pl-2 text-xs text-muted-foreground">
                {category.features.length}
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
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
