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
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <div className="border-b border-border px-4 bg-card flex items-center gap-2">
        <Link
          href="/administration"
          className="text-muted-foreground hover:text-foreground transition-colors p-2 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-1.5 pr-2 border-r border-border h-12">
          <Network className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Relationships</span>
        </div>
        <nav className="flex items-center h-12 gap-1 overflow-x-auto">
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
                  "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap",
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
