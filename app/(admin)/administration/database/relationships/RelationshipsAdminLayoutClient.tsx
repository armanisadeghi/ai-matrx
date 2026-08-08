// app/(admin)/administration/database/relationships/RelationshipsAdminLayoutClient.tsx

"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  LayoutDashboard,
  Link2,
  ListChecks,
  Loader2,
  Network,
  Search,
  ShieldQuestion,
  Waypoints,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    label: "Overview",
    href: "/administration/database/relationships",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Rules",
    href: "/administration/database/relationships/rules",
    icon: ListChecks,
  },
  {
    label: "Entity Types",
    href: "/administration/database/relationships/entity-types",
    icon: Boxes,
  },
  {
    label: "Sharing",
    href: "/administration/database/relationships/sharing",
    icon: Link2,
  },
  {
    label: "Explorer",
    href: "/administration/database/relationships/explorer",
    icon: Search,
  },
  {
    label: "Reachability",
    href: "/administration/database/relationships/reachability",
    icon: Waypoints,
  },
  {
    label: "Exposure Audit",
    href: "/administration/database/relationships/exposure-audit",
    icon: ShieldQuestion,
  },
  {
    label: "Actions",
    href: "/administration/agents/relationships/actions",
    icon: Zap,
  },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

export function RelationshipsAdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  const handleNavigate = (href: string) => {
    if (pathname === href || isPending) return;
    setPendingHref(href);
    startTransition(() => router.push(href));
  };

  return (
    <div className="flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden bg-textured">
      <div className="flex shrink-0 flex-col border-b border-border bg-card sm:flex-row sm:items-center sm:gap-2 sm:px-4">
        <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-2 sm:h-12 sm:border-b-0 sm:border-r sm:px-0 sm:pr-3">
          <Link
            href="/administration"
            aria-label="Back to administration"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:-ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Network className="h-4 w-4 shrink-0 text-primary" />
          <span className="whitespace-nowrap text-sm font-medium">
            Relationships
          </span>
        </div>
        <nav
          aria-label="Relationship sections"
          className="flex h-11 min-w-0 items-center gap-1 overflow-x-auto px-2 sm:h-12 sm:px-0"
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            const navigating = isPending && pendingHref === item.href;
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => handleNavigate(item.href)}
                disabled={isPending}
                className={cn(
                  "inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                {navigating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <item.icon className="w-4 h-4" />
                )}
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
