"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { findTab, getTabTreeNodes } from "@/features/settings/registry";
import { SettingsTabHost } from "@/features/settings/components/SettingsTabHost";
import { flattenLeaves } from "@/components/official/settings/tree/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createSettingsScope } from "@/features/surfaces/manifests/settings.manifest";
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
 *
 * Also the surface-runtime emitter for `matrx-user/settings`
 * (`features/surfaces/manifests/settings.manifest.ts`): active tab (from the
 * URL), the visible sections tree, and the autosave flush status.
 */
export function SettingsTabContent({ tabId, basePath }: Props) {
  const router = useRouter();
  const store = useAppStore();
  const isAdmin = useAppSelector(selectIsAdmin);

  const treeNodes = useMemo(() => getTabTreeNodes(isAdmin), [isAdmin]);
  const activeTab = useMemo(
    () => (tabId ? (findTab(tabId) ?? null) : null),
    [tabId],
  );

  const getScope = () => {
    // Read the flush flag imperatively so the Run-time scope is live without
    // subscribing this component to every preferences write.
    const isSaving =
      store.getState().userPreferences._meta?.isLoading ?? false;
    const activePath = activeTab
      ? tabIdToHref(basePath, activeTab.id)
      : undefined;
    return createSettingsScope({
      settings_sections: flattenLeaves(treeNodes).map((leaf) => ({
        id: leaf.id,
        label: leaf.label,
        path: tabIdToHref(basePath, leaf.id),
      })),
      is_admin_view: isAdmin,
      is_saving: isSaving,
      ...(activeTab
        ? {
            active_tab_id: activeTab.id,
            active_tab_label: activeTab.label,
            active_tab_description: activeTab.description,
            active_tab_path: activePath,
            active_tab_persistence: activeTab.persistence,
            active_tab: {
              id: activeTab.id,
              label: activeTab.label,
              description: activeTab.description ?? null,
              path: activePath as string,
              persistence: activeTab.persistence,
              requires_admin: activeTab.requiresAdmin ?? false,
            },
          }
        : {}),
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/settings"
      getScope={getScope}
      isEditable={false}
    >
      <SettingsTabHost
        activeTab={activeTab}
        treeNodes={treeNodes}
        onNavigate={(id) => router.push(tabIdToHref(basePath, id))}
      />
    </SurfaceRuntimeProvider>
  );
}

export default SettingsTabContent;
