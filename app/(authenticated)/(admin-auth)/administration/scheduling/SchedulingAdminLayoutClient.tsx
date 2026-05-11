// app/(authenticated)/(admin-auth)/administration/scheduling/SchedulingAdminLayoutClient.tsx

"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  CalendarRange,
  CalendarCheck,
  ListChecks,
  LayoutDashboard,
  Loader2,
  Wand2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    label: "Overview",
    href: "/administration/scheduling",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Tasks",
    href: "/administration/scheduling/tasks",
    icon: ListChecks,
  },
  {
    label: "Runs",
    href: "/administration/scheduling/runs",
    icon: Activity,
  },
  {
    label: "Orphan leases",
    href: "/administration/scheduling/orphan-leases",
    icon: AlertTriangle,
  },
  {
    label: "Cron tester",
    href: "/administration/scheduling/cron-tester",
    icon: Wand2,
  },
  {
    label: "Scanner health",
    href: "/administration/scheduling/scanner-health",
    icon: CalendarCheck,
  },
  {
    label: "Templates",
    href: "/administration/scheduling/templates",
    icon: CalendarRange,
  },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

export function SchedulingAdminLayoutClient({
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
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <div className="border-b border-border px-4 bg-card flex items-center gap-2">
        <Link
          href="/administration"
          className="text-muted-foreground hover:text-foreground transition-colors p-2 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-1.5 pr-2 border-r border-border h-12">
          <CalendarClock className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-sm">Scheduling</span>
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
