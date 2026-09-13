"use client";

/**
 * @registry-status: sub-component
 * Body of `userPreferencesWindow`. Mounted by the registered shell at
 * features/settings/components/SettingsShellOverlay.tsx, and also used
 * standalone by the dev-only /settings-shell-demo page. Do NOT register
 * separately — covered by `userPreferencesWindow`.
 */

import { useCallback, useState } from "react";
import { Check, Loader2, Settings as SettingsIcon } from "lucide-react";
import { useSettingsControlSearch } from "../hooks/useSettingsSearch";
import type { SettingsControlSearchHit } from "../search/controlSearch";
import { useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useOverlaySurfaceRenderAck } from "@/features/window-panels/diagnostics/useOverlaySurfaceRenderAck";
import { useIsMobile } from "@/hooks/use-mobile";
import { SettingsTree } from "@/components/official/settings/tree/SettingsTree";
import { SettingsDrawerNav } from "@/components/official/settings/tree/SettingsDrawerNav";
import { UniversalSettingsProvider } from "../universal/UniversalSettingsContext";
import { useSettingsTree } from "../universal/useSettingsTree";
import { SettingsTabHost } from "./SettingsTabHost";
import { SettingsPresentationProvider } from "./SettingsPresentationContext";
import { SettingsDesignProvider } from "@/components/official/settings/SettingsDesignProvider";

export type SettingsShellProps = {
  /** Controls whether the shell is mounted. */
  isOpen: boolean;
  /** Called when the user closes the shell (X, back-to-root, swipe-dismiss, etc.). */
  onClose: () => void;
  /** Tab id to activate on first open. */
  initialTabId?: string;
  /** Exact control id to reveal once the lazy tab mounts. */
  initialControlId?: string;
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
 * Tabs come from `features/settings/registry.ts` PLUS the taxonomy-driven
 * Configuration sections, joined by `useSettingsTree` — the same join the
 * `/settings` route's rail makes. This shell used to call `getTabTreeNodes`
 * on its own, so the window and the mobile drawer were a SECOND settings
 * surface with no Configuration section in it: every registry-driven setting
 * was unreachable from the drawer while the route showed it. One surface.
 *
 * State for which tab is active lives inside the shell (Phase 4 scope); Phase
 * 8 will lift it into the window session so deep-links and tab restoration
 * work.
 */
export function SettingsShell(props: SettingsShellProps) {
  // The provider must sit ABOVE the tree and the tab body, exactly as
  // SettingsRouteShell mounts it: they are separate component trees that must
  // never disagree about which domains have settings. Mounted only while the
  // shell is open, so a closed overlay never reads the registry.
  if (!props.isOpen) return null;
  return (
    <UniversalSettingsProvider>
      <SettingsDesignProvider variant="compact">
        <SettingsShellBody {...props} />
      </SettingsDesignProvider>
    </UniversalSettingsProvider>
  );
}

function SettingsShellBody({
  isOpen,
  onClose,
  initialTabId,
  initialControlId,
  isAdmin = false,
}: SettingsShellProps) {
  const isMobile = useIsMobile();
  const [activeTabId, setActiveTabId] = useState<string | null>(
    initialTabId ?? null,
  );
  const [focusControlId, setFocusControlId] = useState(initialControlId);
  const [overlayQuery, setOverlayQuery] = useState("");

  const { nodes: treeNodes, resolveTab } = useSettingsTree(isAdmin);
  const controlResults = useSettingsControlSearch(overlayQuery, isAdmin);

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
  const activateControl = useCallback((hit: SettingsControlSearchHit) => {
    setActiveTabId(hit.tabId);
    setFocusControlId(hit.controlId);
  }, []);

  // Mobile intentionally renders the purpose-built push-navigation drawer
  // instead of WindowPanel. Acknowledge that alternate visible surface so the
  // shared watchdog does not demand geometry this presentation never owns.
  useOverlaySurfaceRenderAck("userPreferencesWindow", isOpen && isMobile);

  if (!isOpen) return null;

  const activeTab = resolveTab(activeTabId);

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
        focusControlId={focusControlId}
      >
        <SettingsDrawerNav
          nodes={treeNodes}
          activeId={activeTabId}
          onActivate={setActiveTabId}
          renderTab={(node) => {
            const tab = resolveTab(node.id);
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
      focusControlId={focusControlId}
    >
      <WindowPanel
        title="Settings"
        width="72vw"
        height="78dvh"
        minWidth={640}
        minHeight={480}
        overlayId="userPreferencesWindow"
        onClose={onClose}
        sidebar={
          <SettingsTree
            nodes={treeNodes}
            activeId={activeTabId}
            onActivate={setActiveTabId}
            query={overlayQuery}
            onQueryChange={setOverlayQuery}
            hasSearchResults={controlResults.length > 0}
            searchResults={overlayQuery && controlResults.length > 0 ? <OverlayControlSearchResults results={controlResults} onActivate={activateControl} /> : null}
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

function OverlayControlSearchResults({
  results,
  onActivate,
}: {
  results: SettingsControlSearchHit[];
  onActivate: (hit: SettingsControlSearchHit) => void;
}) {
  return (
    <div className="border-b border-border px-2 py-1" aria-label="Setting matches">
      {results.map((result) => (
        <button
          key={result.id}
          type="button"
          onClick={() => onActivate(result)}
          className="flex w-full flex-col rounded-sm px-2 py-1.5 text-left hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-sm text-foreground">{result.label}</span>
          <span className="text-xs text-muted-foreground">{result.location}</span>
        </button>
      ))}
    </div>
  );
}
