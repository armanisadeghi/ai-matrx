"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/styles/themes/utils";
import {
  LayoutDashboard,
  MessageSquare,
  Send,
  BarChart3,
  AlertCircle,
} from "lucide-react";
import { CxDashboardErrorBoundary } from "@/features/cx-dashboard/components/CxDashboardErrorBoundary";

const NAV_ITEMS = [
  {
    href: "/administration/cx-dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/administration/cx-dashboard/conversations",
    label: "Conversations",
    icon: MessageSquare,
  },
  {
    href: "/administration/cx-dashboard/requests",
    label: "Requests",
    icon: Send,
  },
  {
    href: "/administration/cx-dashboard/usage",
    label: "Usage & Cost",
    icon: BarChart3,
  },
  {
    href: "/administration/cx-dashboard/errors",
    label: "Errors",
    icon: AlertCircle,
  },
];

export function CxDashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-card/50 px-4">
        <nav className="flex items-center gap-1 h-9 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-auto">
        <CxDashboardErrorBoundary>{children}</CxDashboardErrorBoundary>
      </div>
    </div>
  );
}
