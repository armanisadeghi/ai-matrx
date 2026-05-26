"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Boxes,
  LayoutDashboard,
  Loader2,
  ShieldAlert,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/administration/agent-apps",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Apps",
    href: "/administration/agent-apps/apps",
    icon: Boxes,
  },
  {
    label: "Categories",
    href: "/administration/agent-apps/categories",
    icon: Tag,
  },
  {
    label: "Executions",
    href: "/administration/agent-apps/executions",
    icon: Activity,
  },
  {
    label: "Analytics",
    href: "/administration/agent-apps/analytics",
    icon: BarChart3,
  },
  {
    label: "Rate Limits",
    href: "/administration/agent-apps/rate-limits",
    icon: ShieldAlert,
  },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname.startsWith(href);
}

export function AgentAppsAdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  const isEditPage = pathname.includes("/agent-apps/edit/");
  if (isEditPage) {
    return <>{children}</>;
  }

  const handleNavigate = (href: string) => {
    if (pathname === href || isPending) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <div className="border-b border-border px-4 bg-card flex items-center gap-2">
        <Link
          href="/administration"
          className="text-muted-foreground hover:text-foreground transition-colors p-2 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
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
