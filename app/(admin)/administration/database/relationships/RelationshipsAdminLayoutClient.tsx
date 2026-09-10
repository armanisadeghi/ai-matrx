// app/(admin)/administration/database/relationships/RelationshipsAdminLayoutClient.tsx

"use client";

import React from "react";
import {
  Boxes,
  LayoutDashboard,
  Link2,
  ListChecks,
  Network,
  Search,
  ShieldQuestion,
  Workflow,
  Waypoints,
  Zap,
} from "lucide-react";
import {
  AdminSectionShell,
  type AdminSectionTab,
} from "@/features/admin/components/AdminSectionShell";

const NAV_ITEMS: AdminSectionTab[] = [
  {
    label: "Overview",
    href: "/administration/database/relationships",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Planner",
    href: "/administration/database/relationships/planner",
    icon: Workflow,
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
    href: "/administration/agents/relationships/directives",
    icon: Zap,
  },
];

export function RelationshipsAdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminSectionShell
      title="Relationships"
      icon={Network}
      navLabel="Relationship sections"
      tabs={NAV_ITEMS}
    >
      {children}
    </AdminSectionShell>
  );
}
