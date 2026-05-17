"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { findTab, getTabTreeNodes } from "@/features/settings/registry";
import { SettingsTabHost } from "@/features/settings/components/SettingsTabHost";
import { tabIdToHref } from "./routing";

interface Props {
  /** Tab id resolved from the URL (e.g. "general.notifications"). `null` for
   *  the route's index landing. */
  tabId: string | null;
  basePath: string;
}

/**
 * Bridges the route page (which has a tab id from the URL) to the existing
 * `SettingsTabHost` (which expects a `SettingsTabDef`). All the heavy lifting
 * — Suspense, error boundary, breadcrumb, empty state — comes from
 * `SettingsTabHost`. We just resolve the id and wire breadcrumb navigation
 * back to `router.push`.
 */
export function SettingsTabContent({ tabId, basePath }: Props) {
  const router = useRouter();
  const isAdmin = useAppSelector(selectIsAdmin);

  const treeNodes = useMemo(() => getTabTreeNodes(isAdmin), [isAdmin]);
  const activeTab = useMemo(
    () => (tabId ? (findTab(tabId) ?? null) : null),
    [tabId],
  );

  return (
    <SettingsTabHost
      activeTab={activeTab}
      treeNodes={treeNodes}
      onNavigate={(id) => router.push(tabIdToHref(basePath, id))}
    />
  );
}

export default SettingsTabContent;
