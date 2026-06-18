// UI-facing navigation links with icons — built from
// `features/shell/constants/nav-data.ts` (data-only). Import this when you need
// React nodes for sidebars/menus.

import React from "react";
import type { LucideIcon } from "lucide-react";
import {
  primaryNavItems,
  adminNavItems,
  settingsItem,
  adminItemOnSurface,
  type AdminNavSurface,
  type ShellNavItem,
  type ShellNavChild,
} from "@/features/shell/constants/nav-data";
import { shellIconComponents } from "@/features/shell/shellIconMap";
import { faviconRouteData } from "@/constants/favicon-route-data";
import type { FaviconConfig } from "@/constants/favicon-route-data";

export type { FaviconConfig, AdminNavSurface };

const iconClassName =
  "text-neutral-700 dark:text-neutral-200 h-5 w-5 flex-shrink-0";

function buildIconNode(iconName: string): React.ReactNode {
  const Icon = shellIconComponents[iconName] as LucideIcon | undefined;
  if (!Icon) return null;
  return <Icon className={iconClassName} />;
}

function faviconForHref(href: string): FaviconConfig | undefined {
  return faviconRouteData.find((e) => e.href === href)?.favicon;
}

function shellItemToNavigationLink(item: ShellNavItem): NavigationLink {
  return {
    label: item.label,
    href: item.href,
    icon: buildIconNode(item.iconName),
    section: item.section,
    category: item.category,
    profileMenu: item.profileMenu,
    dashboard: item.dashboard,
    description: item.description,
    color: item.color,
    favicon: faviconForHref(item.href),
    adminSurfaces: item.adminSurfaces,
  };
}

// A group child becomes a first-class NavigationLink so it still appears as a
// dashboard tile / profile entry even though the sidebar nests it. Missing
// presentation fields fall back to the parent group's values.
function shellChildToNavigationLink(
  child: ShellNavChild,
  parent: ShellNavItem,
): NavigationLink {
  return {
    label: child.label,
    href: child.href,
    icon: buildIconNode(child.iconName),
    section: parent.section,
    profileMenu: child.profileMenu,
    dashboard: child.dashboard,
    description: child.description ?? parent.description,
    color: child.color ?? parent.color,
    favicon: faviconForHref(child.href),
  };
}

// Flatten the nested primary nav into a single link list: each top-level item
// followed by its children. Group parents carry `dashboard: false` /
// `profileMenu: false`, so the downstream flag filters keep the dashboard +
// profile menu showing the real destinations (the children) — nesting the
// sidebar never removes a tile.
function flattenPrimaryNav(items: ShellNavItem[]): NavigationLink[] {
  const out: NavigationLink[] = [];
  for (const item of items) {
    out.push(shellItemToNavigationLink(item));
    for (const child of item.children ?? []) {
      out.push(shellChildToNavigationLink(child, item));
    }
  }
  return out;
}

export interface NavigationLink {
  label: string;
  href: string;
  icon: React.ReactNode;
  section?: "primary" | "admin";
  category?: string;
  profileMenu?: boolean;
  dashboard?: boolean;
  favicon?: FaviconConfig;
  description?: string;
  color?: string;
  /** Echo of nav-data admin routing; primary links leave this unset. */
  adminSurfaces?: AdminNavSurface[];
}

// Flat (legacy / transitional) sidebars can't nest — they take a flat
// NavigationLink[]. To avoid dropping destinations there, expand the new
// org-node groups (parent `dashboard: false`) into their leaf children, while
// leaving umbrella groups (Agents, Transcripts, Knowledge, Reports — parent
// `dashboard: true`) as a single entry exactly as before.
function flattenForFlatSidebar(items: ShellNavItem[]): NavigationLink[] {
  const out: NavigationLink[] = [];
  for (const item of items) {
    const children = item.children ?? [];
    if (children.length > 0 && item.dashboard === false) {
      for (const child of children) {
        out.push(shellChildToNavigationLink(child, item));
      }
    } else {
      out.push(shellItemToNavigationLink(item));
    }
  }
  return out;
}

export const primaryLinks = [
  ...flattenForFlatSidebar(primaryNavItems),
  shellItemToNavigationLink(settingsItem),
];

const adminNavSidebarSource = adminNavItems.filter((item) =>
  adminItemOnSurface(item, "sidebar"),
);
const adminNavHeaderMenuSource = adminNavItems.filter((item) =>
  adminItemOnSurface(item, "headerMenu"),
);

const allAdminNavigationLinks = adminNavItems.map(shellItemToNavigationLink);

export const adminSidebarLinks = adminNavSidebarSource.map(
  shellItemToNavigationLink,
);

export const adminNavigationLinks = adminNavHeaderMenuSource.map(
  shellItemToNavigationLink,
);

export const allNavigationLinks: NavigationLink[] = [
  ...flattenPrimaryNav(primaryNavItems),
  shellItemToNavigationLink(settingsItem),
  ...allAdminNavigationLinks,
];

export const profileMenuLinks = allNavigationLinks.filter(
  (link) => link.profileMenu === true,
);

export const dashboardLinks = allNavigationLinks.filter(
  (link) => link.dashboard === true,
);

export const adminLinksByCategory = adminNavigationLinks.reduce(
  (acc, link) => {
    const category = link.category || "Other";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(link);
    return acc;
  },
  {} as Record<string, NavigationLink[]>,
);

export const navigationLinks = profileMenuLinks;
export const appSidebarLinks = primaryLinks;
