"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DATABASE_MODULE_HOME,
  databaseSqlSubPages,
  databaseToolLabel,
  databaseToolPages,
  isActiveDatabaseToolPath,
} from "@/features/administration/database-hub/database-tools";

export function DatabaseAdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const currentSearch = searchParams.toString();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const currentPath = pathname;

  const isHub = currentPath === DATABASE_MODULE_HOME;
  const hasNestedSectionNavigation = currentPath.startsWith(
    `${DATABASE_MODULE_HOME}/relationships`,
  );

  const handleNavigate = (href: string) => {
    if (currentPath === href.split("?")[0] || isPending) return;
    setPendingHref(href);
    startTransition(() => router.push(href));
  };

  return (
    <div className="flex flex-col h-full">
      {!hasNestedSectionNavigation && (
        <div className="shrink-0 border-b border-border bg-card">
          {/* Row 1 — Hub + cross-module tools */}
          <nav
            aria-label="Database tools"
            className="flex flex-nowrap items-center gap-1 overflow-x-auto no-scrollbar px-2 py-1 border-b border-border/60"
          >
            <Link
              href={DATABASE_MODULE_HOME}
              onClick={(e) => {
                e.preventDefault();
                handleNavigate(DATABASE_MODULE_HOME);
              }}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:min-h-8",
                isHub
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {isPending && pendingHref === DATABASE_MODULE_HOME ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LayoutGrid className="h-3.5 w-3.5" />
              )}
              Hub
            </Link>

            <span className="text-border px-1">|</span>

            {databaseToolPages
              .filter((p) => p.section !== "sql" && !p.isDuplicate)
              .map((page) => {
                const active = isActiveDatabaseToolPath(
                  currentPath,
                  page.path,
                  currentSearch,
                );
                const pending = isPending && pendingHref === page.path;
                return (
                  <Link
                    key={page.path}
                    href={page.path}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) return;
                      e.preventDefault();
                      handleNavigate(page.path);
                    }}
                    className={cn(
                      "inline-flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:min-h-8",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      page.isDuplicate && "text-amber-700 dark:text-amber-400",
                    )}
                    title={page.duplicateNote ?? page.description}
                  >
                    {pending && <Loader2 className="h-3 w-3 animate-spin" />}
                    {databaseToolLabel(page)}
                  </Link>
                );
              })}
          </nav>

          {/* Row 2 — SQL sub-routes (only when inside /administration/database/*) */}
          {!isHub && currentPath.startsWith(DATABASE_MODULE_HOME + "/") && (
            <nav
              aria-label="SQL and schema tools"
              className="flex flex-nowrap overflow-x-auto no-scrollbar px-2"
            >
              {databaseSqlSubPages.map((page) => {
                const active = isActiveDatabaseToolPath(
                  currentPath,
                  page.path,
                  currentSearch,
                );
                const pending = isPending && pendingHref === page.path;
                return (
                  <Link
                    key={page.path}
                    href={page.path}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) return;
                      e.preventDefault();
                      handleNavigate(page.path);
                    }}
                    className={cn(
                      "inline-flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                    )}
                  >
                    {pending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {databaseToolLabel(page)}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
