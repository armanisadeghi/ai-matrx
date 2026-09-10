// features/admin/components/AdminSectionShell.tsx
//
// THE route-tab shell for an /administration section: back link, section icon +
// title, a tab strip whose tabs are routes (pending spinner on the clicked tab,
// every tab disabled while the transition runs), and the one scrolling body.
// The section layout owns the viewport height through this shell; each tab is
// its own route. A section supplies only its title, icon, aria label, and tabs
// — anything else a section needs (a surface runtime provider, a route that
// renders without the shell) stays in that section's LayoutClient.

"use client";

import React, { useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, type LucideIcon } from "lucide-react";

import AppLink from "@/components/navigation/AppLink";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { cn } from "@/lib/utils";

export interface AdminSectionTab {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Active only on this exact pathname (the section root). Ignored by `activeMatch="longest"`. */
  exact?: boolean;
}

export interface AdminSectionShellProps {
  title: string;
  icon: LucideIcon;
  /** Accessible name of the tab strip, e.g. "Users and access sections". */
  navLabel: string;
  tabs: readonly AdminSectionTab[];
  /**
   * `prefix` (default): a tab is active on its exact href (when `exact`) or any
   * pathname starting with it. `longest`: the longest tab href that owns the
   * pathname (equal, or a `/`-bounded prefix) wins, so a nested tab such as
   * `/jurisdiction-rules/verification` lights alone, not with its parent.
   */
  activeMatch?: "prefix" | "longest";
  /** Surface Context "Locate" anchor for the tab strip (`data-surface-value`). */
  navSurfaceValue?: string;
  children: React.ReactNode;
}

function activeTabHref(
  pathname: string,
  tabs: readonly AdminSectionTab[],
  activeMatch: "prefix" | "longest",
): Set<string> {
  if (activeMatch === "longest") {
    let best: string | null = null;
    for (const tab of tabs) {
      const owns = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
      if (owns && (best === null || tab.href.length > best.length)) {
        best = tab.href;
      }
    }
    return new Set(best === null ? [] : [best]);
  }
  return new Set(
    tabs
      .filter((tab) =>
        tab.exact ? pathname === tab.href : pathname.startsWith(tab.href),
      )
      .map((tab) => tab.href),
  );
}

export function AdminSectionShell({
  title,
  icon: SectionIcon,
  navLabel,
  tabs,
  activeMatch = "prefix",
  navSurfaceValue,
  children,
}: AdminSectionShellProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useClippedContentGuard(bodyRef, { label: `${title} admin section body` });

  const active = activeTabHref(pathname, tabs, activeMatch);

  const handleNavigate = (href: string) => {
    if (pathname === href || isPending) return;
    setPendingHref(href);
    startTransition(() => router.push(href));
  };

  return (
    <div className="flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden bg-textured">
      <div className="flex shrink-0 flex-col border-b border-border bg-card sm:flex-row sm:items-center sm:gap-2 sm:px-4">
        <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-2 sm:h-12 sm:border-b-0 sm:border-r sm:px-0 sm:pr-3">
          <AppLink
            href="/administration"
            aria-label="Back to administration"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:-ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
          </AppLink>
          <SectionIcon className="h-4 w-4 shrink-0 text-primary" />
          <span className="whitespace-nowrap text-sm font-medium">{title}</span>
        </div>
        <nav
          aria-label={navLabel}
          data-surface-value={navSurfaceValue}
          className="flex h-11 min-w-0 items-center gap-1 overflow-x-auto px-2 sm:h-12 sm:px-0"
        >
          {tabs.map((tab) => {
            const navigating = isPending && pendingHref === tab.href;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.href}
                type="button"
                onClick={() => handleNavigate(tab.href)}
                disabled={isPending}
                className={cn(
                  "inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9",
                  active.has(tab.href)
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {navigating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TabIcon className="h-4 w-4" />
                )}
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div ref={bodyRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}
