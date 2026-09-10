"use client";

import React from "react";
import { usePathname } from "next/navigation";
import {
  AppWindow,
  FileText,
  Folder,
  GitBranch,
  LayoutDashboard,
  List,
  Network,
  SquareStack,
  Zap,
} from "lucide-react";
import {
  AdminSectionShell,
  type AdminSectionTab,
} from "@/features/admin/components/AdminSectionShell";

const NAV_ITEMS: AdminSectionTab[] = [
  {
    label: "Dashboard",
    href: "/administration/agents/system-agents",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Agents",
    href: "/administration/agents/system-agents/agents",
    icon: SquareStack,
  },
  {
    label: "Lineage",
    href: "/administration/agents/system-agents/lineage",
    icon: GitBranch,
  },
  {
    label: "Shortcuts",
    href: "/administration/agents/system-agents/shortcuts",
    icon: Zap,
  },
  {
    label: "All Shortcuts",
    href: "/administration/agents/system-agents/shortcuts/all",
    icon: List,
  },
  {
    label: "Categories",
    href: "/administration/agents/system-agents/categories",
    icon: Folder,
  },
  {
    label: "Content Blocks",
    href: "/administration/agents/system-agents/content-blocks",
    icon: FileText,
  },
  {
    label: "Apps",
    href: "/administration/agents/system-agents/apps",
    icon: AppWindow,
  },
  // Leaves this hub on purpose. Orchestras have exactly ONE home
  // (`/agents/orchestras`); a second admin copy of that surface is precisely
  // the drift this route was just cured of. An admin builds a SYSTEM Orchestra
  // there by choosing a builtin as the conductor — the picker's System tab —
  // and the missing piece was never a page, it was this link.
  {
    label: "Orchestras",
    href: "/agents/orchestras",
    icon: Network,
  },
];

/**
 * Section shell for the admin "System Agents" hub. The shell is suppressed for
 * specific "fullscreen" detail routes (shortcut editor, agent builder/runner)
 * so those pages can render their own chrome without double headers.
 */
export function SystemAgentsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // The shell is suppressed for two classes of pages:
  //   1. Deep shortcut edit routes — they render their own back-button chrome.
  //   2. Any agent detail page under /system-agents/agents/<id>/... — these
  //      include build, run, shortcuts, apps, and their nested editors. The
  //      agent list page at `/system-agents/agents` keeps the shell.
  const isShortcutEditPage = pathname.includes("/system-agents/edit/");
  const isAgentDetailPage =
    /\/system-agents\/agents\/[^/]+(\/.*)?$/.test(pathname) &&
    pathname !== "/administration/agents/system-agents/agents";
  if (isShortcutEditPage || isAgentDetailPage) {
    return <>{children}</>;
  }

  return (
    <AdminSectionShell
      title="System Agents"
      icon={Zap}
      navLabel="System agents sections"
      tabs={NAV_ITEMS}
      activeMatch="longest"
    >
      {children}
    </AdminSectionShell>
  );
}
