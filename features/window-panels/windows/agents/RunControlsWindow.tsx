"use client";

/**
 * RunControlsWindow — the canonical desktop presentation of the run controls
 * ("Chat Options"): Attach / Context / Document / Overrides / Tools / Skills /
 * Sandbox / Settings / Preferences / Creator for one conversation.
 *
 * A real WindowPanel, not a popover: non-blocking (the chat behind stays
 * interactive), minimizable to the tray, maximizable to full screen,
 * draggable, snappable. Dialogs opened from inside it (e.g. "Preview full
 * prompt") render at the dialog layer (z-10000) ABOVE the window (z~1000),
 * so nothing can get buried behind the panel — the failure mode the old
 * fullscreen popover had.
 *
 * One fixed body size across every tab; the sidebar hosts the tab list.
 * All tab content + state comes from the shared RunControlsTabPanel core.
 */

import { useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import { useIsMobile } from "@/hooks/use-mobile";
import { TabbedBottomSheet } from "@/components/official/bottom-sheet/TabbedBottomSheet";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  RunControlsTabPanel,
  useRunControlsState,
  type RunControlsTab,
} from "@/features/agents/components/inputs/smart-input/RunControlsTabPanel";
import { useAttachResource } from "@/features/agents/components/inputs/resources/attach-resource";
import { cn } from "@/lib/utils";
import type { Resource } from "@/features/agents/resources/types";

const OVERLAY_ID = "runControlsWindow" as const;

function RunControlsWindowInner({
  conversationId,
  includeAttach,
  initialTab,
  onClose,
}: {
  conversationId: string;
  includeAttach: boolean;
  initialTab: string | null;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const rc = useRunControlsState(conversationId, includeAttach);

  const [tab, setTab] = useState<RunControlsTab>(() => {
    const wanted = rc.tabs.find((t) => t.id === initialTab);
    return wanted ? wanted.id : rc.defaultTab;
  });
  const activeTab = rc.resolveTab(tab);

  const attachResource = useAttachResource(conversationId);
  const close = () => dispatch(closeOverlay({ overlayId: OVERLAY_ID }));
  const handleResourceSelected = async (resource: Resource) => {
    return attachResource(resource);
  };

  // Mobile: never a draggable window — iOS-style bottom sheet with the same
  // tabs (level 1 list → drill into a tab), matching RunControlsMenu's mobile
  // presentation.
  if (isMobile) {
    return (
      <TabbedBottomSheet
        open
        onOpenChange={(next) => {
          if (!next) {
            close();
            onClose();
          }
        }}
        title="Chat options"
        tabs={rc.tabs.map((t) => ({
          id: t.id,
          label: t.label,
          icon: t.icon,
          trailing: rc.tabTrailing(t.id),
          content: (
            <RunControlsTabPanel
              {...rc.panelProps}
              activeTab={t.id}
              fill
              onResourceSelected={handleResourceSelected}
              onClose={close}
            />
          ),
        }))}
      />
    );
  }

  return (
    <WindowPanel
      id="run-controls-window"
      overlayId={OVERLAY_ID}
      onClose={onClose}
      title="Chat Options"
      // Chat options should complement the conversation, not obscure it. Keep
      // a compact, comfortably inset starting rect on the left; users can
      // still drag, resize, snap, maximize, or pop it out as usual.
      initialRect={{ x: 72, y: 56, width: 480, height: 640 }}
      height={640}
      minWidth={380}
      minHeight={420}
      sidebarDefaultSize={148}
      sidebarMinSize={120}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      sidebar={
        <nav
          aria-label="Run controls"
          className="flex h-full flex-col gap-0.5 overflow-y-auto p-1.5"
        >
          {rc.tabs.map((t) => {
            const Icon = t.icon;
            const on = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  on
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t.label}</span>
                {rc.tabTrailing(t.id)}
              </button>
            );
          })}
        </nav>
      }
    >
      <RunControlsTabPanel
        {...rc.panelProps}
        activeTab={activeTab}
        fill
        onResourceSelected={handleResourceSelected}
        onClose={close}
      />
    </WindowPanel>
  );
}

interface RunControlsWindowProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string | null;
  includeAttach?: boolean;
  initialTab?: string | null;
}

export default function RunControlsWindow({
  isOpen,
  onClose,
  conversationId,
  includeAttach = false,
  initialTab = null,
}: RunControlsWindowProps) {
  if (!isOpen || !conversationId) return null;
  return (
    <RunControlsWindowInner
      // Remount when the caller asks for a different landing tab so
      // Advanced Settings / Sandbox / etc. actually switch (overlay update
      // alone leaves the prior useState tab stuck).
      key={`${conversationId}:${initialTab ?? "default"}`}
      conversationId={conversationId}
      includeAttach={includeAttach}
      initialTab={initialTab}
      onClose={onClose}
    />
  );
}
