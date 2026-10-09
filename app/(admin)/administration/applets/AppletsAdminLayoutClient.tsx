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
    href: "/administration/applets",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "All Applets",
    href: "/administration/applets/all",
    icon: Boxes,
  },
  {
    label: "Categories",
    href: "/administration/applets/categories",
    icon: Tag,
  },
  {
    label: "Executions",
    href: "/administration/applets/executions",
    icon: Activity,
  },
  {
    label: "Analytics",
    href: "/administration/applets/analytics",
    icon: BarChart3,
  },
  {
    label: "Rate Limits",
    href: "/administration/applets/rate-limits",
    icon: ShieldAlert,
  },
];

export function AppletsAdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // The app editor renders its own full-page chrome, without the section shell.
  if (pathname.includes("/applets/edit/")) {
    return <>{children}</>;
  }

  return (
    <AdminSectionShell
      title="Applets"
      icon={Boxes}
      navLabel="Applets sections"
      tabs={NAV_ITEMS}
    >
      {children}
    </AdminSectionShell>
  );
}
