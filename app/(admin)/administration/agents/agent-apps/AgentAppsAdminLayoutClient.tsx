"use client";

import React from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Boxes,
  LayoutDashboard,
  ShieldAlert,
  Tag,
} from "lucide-react";
import {
  AdminSectionShell,
  type AdminSectionTab,
} from "@/features/admin/components/AdminSectionShell";

const NAV_ITEMS: AdminSectionTab[] = [
  {
    label: "Dashboard",
    href: "/administration/agents/agent-apps",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Apps",
    href: "/administration/agents/agent-apps/apps",
    icon: Boxes,
  },
  {
    label: "Categories",
    href: "/administration/agents/agent-apps/categories",
    icon: Tag,
  },
  {
    label: "Executions",
    href: "/administration/agents/agent-apps/executions",
    icon: Activity,
  },
  {
    label: "Analytics",
    href: "/administration/agents/agent-apps/analytics",
    icon: BarChart3,
  },
  {
    label: "Rate Limits",
    href: "/administration/agents/agent-apps/rate-limits",
    icon: ShieldAlert,
  },
];

export function AgentAppsAdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // The app editor renders its own full-page chrome, without the section shell.
  if (pathname.includes("/agent-apps/edit/")) {
    return <>{children}</>;
  }

  return (
    <AdminSectionShell
      title="Agent Apps"
      icon={Boxes}
      navLabel="Agent apps sections"
      tabs={NAV_ITEMS}
    >
      {children}
    </AdminSectionShell>
  );
}
