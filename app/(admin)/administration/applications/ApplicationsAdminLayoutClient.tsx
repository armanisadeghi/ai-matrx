// app/(admin)/administration/applications/ApplicationsAdminLayoutClient.tsx

"use client";

import React from "react";
import { usePathname } from "next/navigation";
import {
  HardDrive,
  History,
  LayoutDashboard,
  LibraryBig,
  MonitorCog,
} from "lucide-react";
import {
  AdminSectionShell,
  type AdminSectionTab,
} from "@/features/admin/components/AdminSectionShell";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_APPLICATIONS_SURFACE_NAME,
  createAdminApplicationsScope,
} from "@/features/surfaces/manifests/admin-applications.manifest";

const NAV_ITEMS: AdminSectionTab[] = [
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
      <AdminSectionShell
        title="Applications"
        icon={MonitorCog}
        navLabel="Applications sections"
        tabs={NAV_ITEMS}
      >
        {children}
      </AdminSectionShell>
    </SurfaceRuntimeProvider>
  );
}
