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
import { buildAdminTree, getAdminCrumbs, type AdminCrumb } from "./route-tree";

function CrumbDropdown({ crumb }: { crumb: AdminCrumb }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const hasChildren = crumb.children.length > 0;

  const labelClass = cn(
    "max-w-[180px] truncate",
    crumb.isLast ? "font-medium text-foreground" : "text-muted-foreground",
  );

  // Leaf crumb (no children to drill into) — plain link / text.
  if (!hasChildren) {
    if (crumb.isPage) {
      return (
        <button
          type="button"
          onClick={() => router.push(crumb.fullPath)}
          className="rounded-sm px-1.5 py-0.5 text-sm transition-colors hover:bg-accent hover:text-foreground"
        >
          <span className={labelClass}>{crumb.label}</span>
        </button>
      );
    }
    return (
      <span className={cn("px-1.5 py-0.5 text-sm", labelClass)}>
        {crumb.label}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-sm transition-colors",
            "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          )}
        >
          <span className={labelClass}>{crumb.label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[70vh] w-60 overflow-y-auto"
      >
        {crumb.isPage && (
          <>
            <DropdownMenuItem onSelect={() => router.push(crumb.fullPath)}>
              <span className="font-medium">{crumb.label} overview</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Go to
        </DropdownMenuLabel>
        {crumb.children.map((child) => {
          const active =
            pathname === child.fullPath ||
            pathname.startsWith(`${child.fullPath}/`);
          return (
            <DropdownMenuItem
              key={child.fullPath}
              onSelect={() => router.push(child.fullPath)}
              className={cn("gap-2", active && "bg-accent/60")}
            >
              {active ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <span className="truncate">{child.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AdminBreadcrumbs({ routes }: { routes: string[] }) {
  const pathname = usePathname() ?? "";
  const tree = React.useMemo(() => buildAdminTree(routes), [routes]);
  const crumbs = getAdminCrumbs(tree, pathname);

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
