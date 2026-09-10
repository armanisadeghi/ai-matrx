// app/(admin)/administration/automation/scheduling/SchedulingAdminLayoutClient.tsx

"use client";

import React from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  LayoutDashboard,
  ListChecks,
  ServerCog,
  Zap,
} from "lucide-react";
import {
  AdminSectionShell,
  type AdminSectionTab,
} from "@/features/admin/components/AdminSectionShell";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { ADMIN_SCHEDULING_SURFACE_NAME } from "@/features/surfaces/manifests/admin-scheduling.manifest";
import { buildAdminSchedulingScope } from "@/features/scheduling/lib/admin-scheduling-scope";

const NAV_ITEMS: AdminSectionTab[] = [
  {
    label: "Overview",
    href: "/administration/automation/scheduling",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Tasks",
    href: "/administration/automation/scheduling/tasks",
    icon: ListChecks,
  },
  {
    label: "Runs",
    href: "/administration/automation/scheduling/runs",
    icon: Activity,
  },
  {
    label: "System jobs",
    href: "/administration/automation/scheduling/system-jobs",
    icon: ServerCog,
  },
  {
    label: "Orphan leases",
    href: "/administration/automation/scheduling/orphan-leases",
    icon: AlertTriangle,
  },
  {
    label: "Cron tester",
    href: "/administration/automation/scheduling/cron-tester",
    icon: Zap,
  },
  {
    label: "Scanner health",
    href: "/administration/automation/scheduling/scanner-health",
    icon: CalendarCheck,
  },
  {
    label: "Templates",
    href: "/administration/automation/scheduling/templates",
    icon: CalendarRange,
  },
];

export function SchedulingAdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // The shell is the only component mounted on all eight tabs, so it owns the
  // surface's outer runtime. `active_tab` comes from the pathname here; each
  // tab publishes its own values into the module store the builder reads. The
  // Cron tester nests its own provider inside this one and wins there by
  // depth — see features/scheduling/lib/admin-scheduling-scope.ts.
  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_SCHEDULING_SURFACE_NAME}
      getScope={() => buildAdminSchedulingScope(pathname)}
    >
      <AdminSectionShell
        title="Scheduling"
        icon={CalendarClock}
        navLabel="Scheduling sections"
        tabs={NAV_ITEMS}
        navSurfaceValue="active_tab"
      >
        {children}
      </AdminSectionShell>
    </SurfaceRuntimeProvider>
  );
}
