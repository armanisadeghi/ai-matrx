// app/(admin)/administration/applications/ApplicationsAdminLayoutClient.tsx

"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  HardDrive,
  History,
  LayoutDashboard,
  LibraryBig,
  Loader2,
  MonitorCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_APPLICATIONS_SURFACE_NAME,
  createAdminApplicationsScope,
} from "@/features/surfaces/manifests/admin-applications.manifest";

const NAV_ITEMS = [
  {
    label: "Overview",
    href: "/administration/applications",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Configuration",
    href: "/administration/applications/configuration",
    icon: MonitorCog,
  },
  {
    label: "Catalogs",
    href: "/administration/applications/catalogs",
    icon: LibraryBig,
  },
  {
    label: "Installations",
    href: "/administration/applications/installations",
    icon: HardDrive,
  },
  {
    label: "History",
    href: "/administration/applications/history",
    icon: History,
  },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

type ApplicationsTab =
  "overview" | "configuration" | "catalogs" | "installations" | "history";

/** Derives the active tab from the pathname — route-tabbed, so reliable. */
function tabFromPathname(pathname: string): ApplicationsTab {
  if (pathname.startsWith("/administration/applications/configuration"))
    return "configuration";
  if (pathname.startsWith("/administration/applications/catalogs"))
    return "catalogs";
  if (pathname.startsWith("/administration/applications/installations"))
    return "installations";
  if (pathname.startsWith("/administration/applications/history"))
    return "history";
  return "overview";
}

export function ApplicationsAdminLayoutClient({
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

  // Only active_tab is guaranteed on every load — each tab's own data lives
  // in its own client component with no shared state today (see the
  // manifest's readinessNote). getScope is read lazily at Run time.
  const getSurfaceScope = () =>
    createAdminApplicationsScope({
      active_tab: tabFromPathname(pathname),
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_APPLICATIONS_SURFACE_NAME}
      getScope={getSurfaceScope}
    >
      <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-textured">
        <div className="border-b border-border px-4 bg-card flex items-center gap-2">
          <Link
            href="/administration"
            className="text-muted-foreground hover:text-foreground transition-colors p-2 -ml-2"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-1.5 pr-2 border-r border-border h-12">
            <MonitorCog className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Applications</span>
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
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
