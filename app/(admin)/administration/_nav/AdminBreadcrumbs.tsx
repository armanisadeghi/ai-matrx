"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronRight, ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getAdminCrumbs, type AdminCrumb } from "./route-tree";

function CrumbDropdown({ crumb }: { crumb: AdminCrumb }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const hasOptions = crumb.options.length > 0;

  const trigger = (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-sm transition-colors",
        "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        crumb.isLast ? "font-medium text-foreground" : "text-muted-foreground",
      )}
    >
      <span className="max-w-[180px] truncate">{crumb.label}</span>
      {hasOptions && <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />}
    </button>
  );

  // No siblings to switch between — render a plain (clickable when it's a page) crumb.
  if (!hasOptions) {
    if (crumb.isPage) {
      return (
        <button
          type="button"
          onClick={() => router.push(crumb.fullPath)}
          className={cn(
            "rounded-sm px-1.5 py-0.5 text-sm transition-colors hover:bg-accent hover:text-foreground",
            crumb.isLast
              ? "font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          <span className="max-w-[180px] truncate">{crumb.label}</span>
        </button>
      );
    }
    return (
      <span
        className={cn(
          "px-1.5 py-0.5 text-sm",
          crumb.isLast
            ? "font-medium text-foreground"
            : "text-muted-foreground",
        )}
      >
        {crumb.label}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[70vh] w-60 overflow-y-auto"
      >
        {crumb.isPage && (
          <>
            <DropdownMenuItem onSelect={() => router.push(crumb.fullPath)}>
              <span className="font-medium">{crumb.label}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Switch
        </DropdownMenuLabel>
        {crumb.options.map((option) => {
          const active = pathname === option.fullPath;
          return (
            <DropdownMenuItem
              key={option.fullPath}
              onSelect={() => router.push(option.fullPath)}
              className={cn("gap-2", active && "bg-accent/60")}
            >
              {active ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <span className="truncate">{option.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AdminBreadcrumbs() {
  const pathname = usePathname() ?? "";
  const crumbs = getAdminCrumbs(pathname);

  return (
    <nav aria-label="breadcrumb" className="flex items-center">
      <ol className="flex flex-wrap items-center gap-0.5">
        {crumbs.map((crumb, index) => (
          <li key={crumb.fullPath} className="inline-flex items-center gap-0.5">
            <CrumbDropdown crumb={crumb} />
            {index < crumbs.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
