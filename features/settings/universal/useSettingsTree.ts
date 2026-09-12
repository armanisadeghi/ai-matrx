"use client";

// features/settings/universal/useSettingsTree.ts
//
// ONE place that joins the static tab registry with the taxonomy-driven
// configuration sections, so the route sidebar, the window tree, the mobile
// drawer, the breadcrumb and the tab host all see the SAME nodes and resolve
// the SAME ids. A settings surface that built its own list would be the second
// surface this campaign exists to prevent.

import type { SettingsTreeNode } from "@/components/official/settings/tree/types";
import { findTab, getTabTreeNodes } from "../registry";
import type { SettingsTabDef } from "../types";
import { buildConfigTreeNodes, configTabDef, isConfigTabId } from "./configTree";
import { useUniversalSettings } from "./UniversalSettingsContext";

export function useSettingsTree(isAdmin: boolean): {
  nodes: SettingsTreeNode[];
  resolveTab: (tabId: string | null | undefined) => SettingsTabDef | null;
} {
  const { domains } = useUniversalSettings();
  const nodes = [...getTabTreeNodes(isAdmin), ...buildConfigTreeNodes(domains)];
  const resolveTab = (tabId: string | null | undefined): SettingsTabDef | null => {
    if (!tabId) return null;
    if (isConfigTabId(tabId)) return configTabDef(tabId, domains);
    return findTab(tabId) ?? null;
  };
  return { nodes, resolveTab };
}
