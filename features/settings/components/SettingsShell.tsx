"use client";

/**
 * @registry-status: sub-component
 * Body of `userPreferencesWindow`. Mounted by the registered shell at
 * features/settings/components/SettingsShellOverlay.tsx, and also used
 * standalone by the dev-only /settings-shell-demo page. Do NOT register
 * separately — covered by `userPreferencesWindow`.
 */

import { useCallback, useMemo, useState } from "react";
import { Check, Loader2, Settings as SettingsIcon } from "lucide-react";
import { useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { SettingsTree } from "@/components/official/settings/tree/SettingsTree";
import { SettingsDrawerNav } from "@/components/official/settings/tree/SettingsDrawerNav";
import type { SettingsTreeNode } from "@/components/official/settings/tree/types";
import { getTabTreeNodes, findTab } from "../registry";
import { SettingsTabHost } from "./SettingsTabHost";
import { SettingsPresentationProvider } from "./SettingsPresentationContext";

export type SettingsShellProps = {
  /** Controls whether the shell is mounted. */
  isOpen: boolean;
  /** Called when the user closes the shell (X, back-to-root, swipe-dismiss, etc.). */
  onClose: () => void;
  /** Tab id to activate on first open. */
  initialTabId?: string;
  /** Show admin-gated tabs. Default false. */
  isAdmin?: boolean;
};

/**
 * The public settings surface.
 *
 * Desktop → mounts inside WindowPanel (draggable/resizable/minimizable). Tree
 * in the sidebar, tab host in the main area, breadcrumb in the tab header,
 * persistence status in the footer.
 *
 * Mobile → mounts inside SettingsDrawerNav (iOS-style bottom-sheet push-nav).
 *
 * Tabs come from `features/settings/registry.ts`. State for which tab is
 * active lives inside the shell (Phase 4 scope); Phase 8 will lift it into
 * the window session so deep-links and tab restoration work.
 */
export function SettingsShell({
  isOpen,
  onClose,
  initialTabId,
  isAdmin = false,
}: SettingsShellProps) {
  const isMobile = useIsMobile();
  const [activeTabId, setActiveTabId] = useState<string | null>(
    initialTabId ?? null,
  );

  const treeNodes = useMemo<SettingsTreeNode[]>(
    () => getTabTreeNodes(isAdmin),
    [isAdmin],
  );

  // Surface saved / saving status from the userPreferences slice meta.
  // Settings auto-save through the unified sync engine (debounced ~250ms +
  // pagehide flush) — there is no manual save action. The footer message
  // below reflects that: we never need a "Save" button because we never
  // hold unsaved state.
  const prefsMeta = useSelector((s: RootState) => s.userPreferences._meta);
  const isSaving = prefsMeta?.isLoading ?? false;

  // Stable callback for tab switching — passed into the presentation
  // context so descendants (breadcrumbs, "open profile" buttons in
  // other tabs, etc.) can swap tabs in-place instead of route-pushing.
  const activateTab = useCallback((id: string) => setActiveTabId(id), []);

  if (!isOpen) return null;

  const activeTab = activeTabId ? (findTab(activeTabId) ?? null) : null;

  const footerStatus = (
    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
      {isSaving ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving…
        </>
      ) : (
        <>
          <Check className="h-3 w-3 text-emerald-500" />
          Auto-saved · synced across your devices
        </>
      )}
    </span>
  );

  if (isMobile) {
    return (
      <SettingsPresentationProvider
        presentation="drawer"
        closeShell={onClose}
        setActiveTabId={activateTab}
      >
        <SettingsDrawerNav
          nodes={treeNodes}
          activeId={activeTabId}
          onActivate={setActiveTabId}
          renderTab={(node) => {
            const tab = findTab(node.id);
            return (
              <SettingsTabHost
                activeTab={tab ?? null}
                treeNodes={treeNodes}
                showBreadcrumb={false}
              />
            );
          }}
          open={isOpen}
          onOpenChange={(next) => {
            if (!next) onClose();
          }}
          title="Settings"
        />
      </SettingsPresentationProvider>
    );
  }

  return (
    <SettingsPresentationProvider
      presentation="window"
      closeShell={onClose}
      setActiveTabId={activateTab}
    >
      <WindowPanel
        title="Settings"
        width="72vw"
        height="78dvh"
        minWidth={640}
        minHeight={480}
        overlayId="userPreferencesWindow"
        urlSyncKey="userPreferencesWindow"
        onClose={onClose}
        sidebar={
          <SettingsTree
            nodes={treeNodes}
            activeId={activeTabId}
            onActivate={setActiveTabId}
          />
        }
        sidebarDefaultSize={240}
        sidebarMinSize={180}
        sidebarClassName="p-0"
        titleNode={
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <SettingsIcon className="h-3.5 w-3.5 text-muted-foreground" />
            Settings
          </span>
        }
        footerLeft={footerStatus}
        onCollectData={() => ({ activeTabId })}
      >
        <SettingsTabHost
          activeTab={activeTab}
          treeNodes={treeNodes}
          onNavigate={(id) => setActiveTabId(id)}
        />
      </WindowPanel>
    </SettingsPresentationProvider>
  );
}
