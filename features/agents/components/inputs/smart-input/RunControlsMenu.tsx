"use client";

/**
 * RunControlsMenu — THE run-controls trigger for the Smart Input, in two
 * variants:
 *
 *   - "gear" (SlidersHorizontal) — production toolbar (chat rooms, agent run)
 *   - "plus" (Plus)              — the `/chat/new` hero input
 *
 * Presentation is picked by variant + host environment:
 *
 *   - Desktop "plus"      — `PlusAttachMenu`: the lightweight anchored attach
 *     popover (ResourcePickerMenu) + one quick row (model override select,
 *     working-doc switch, All-options button → the window at Quickset).
 *   - Desktop "gear"      — opens the `runControlsWindow` overlay on its
 *     **Quickset** tab: a real, non-blocking WindowPanel (minimize to tray,
 *     maximize, drag, snap). Dialogs launched from inside it (e.g. "Preview
 *     full prompt") stack ABOVE it — the old fullscreen-popover z-order trap
 *     is structurally gone.
 *   - Mobile              — TabbedBottomSheet (tabs → first-level list).
 *     NEVER a window on mobile.
 *   - Inside a Dialog or a popped-out window — anchored tabbed popover
 *     fallback (an overlay window would render behind the modal / in the
 *     wrong browser window).
 *
 * Tab definitions, badges, and tab content all live in the shared core:
 * `RunControlsTabPanel.tsx` (also consumed by RunControlsWindow).
 */

import { useState } from "react";
import { SlidersHorizontal, Plus, Maximize2, Minimize2 } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useDialogContainer } from "@/components/ui/dialog";
import { usePopoutContainer } from "@/features/window-panels/popout/usePopoutContainer";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { TabbedBottomSheet } from "@/components/official/bottom-sheet/TabbedBottomSheet";
import { useOpenRunControlsWindow } from "@/features/overlays/openers/runControlsWindow";
import { PlusAttachMenu } from "./PlusAttachMenu";
import { useAttachResource } from "@/features/agents/components/inputs/resources/attach-resource";
import { useConversationDocumentsBridge } from "@/features/agents/hooks/useWorkingDocument";
import {
  RunControlsTabPanel,
  useRunControlsState,
  type RunControlsTab,
} from "./RunControlsTabPanel";
import type { Resource } from "@/features/agents/resources/types";

export interface RunControlsMenuProps {
  conversationId: string;
  variant?: "gear" | "plus";
  includeAttach?: boolean;
  align?: "start" | "end";
  side?: "top" | "bottom";
}

export function RunControlsMenu({
  conversationId,
  variant = "gear",
  includeAttach = variant === "plus",
  align = variant === "plus" ? "start" : "end",
  side = variant === "plus" ? "top" : "bottom",
}: RunControlsMenuProps) {
  const isMobile = useIsMobile();
  const dialogContainer = useDialogContainer();
  const popoutContainer = usePopoutContainer();
  const openRunControlsWindow = useOpenRunControlsWindow();

  // The always-mounted trigger owns the documents bridge (hydration + context
  // sync); the window and every tab panel only read the slice.
  useConversationDocumentsBridge(conversationId);

  const rc = useRunControlsState(conversationId, includeAttach);

  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [tab, setTab] = useState<RunControlsTab>(rc.defaultTab);
  const activeTab = rc.resolveTab(tab);

  const attachResource = useAttachResource(conversationId);
  const handleResourceSelected = (resource: Resource) => {
    attachResource(resource);
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setFullscreen(false);
  };

  // The popover/sheet fallbacks host tab content inline; the window derives
  // everything itself from the overlay data.
  const panelProps = {
    ...rc.panelProps,
    onResourceSelected: handleResourceSelected,
    onClose: () => setOpen(false),
  };

  // An overlay window can't serve a composer hosted inside a modal Dialog
  // (windows sit below the dialog layer) or a popped-out window (overlays
  // render in the main browser window). Those hosts keep the anchored popover.
  const useWindowPresentation = !isMobile && !dialogContainer && !popoutContainer;

  const TriggerIcon = variant === "plus" ? Plus : SlidersHorizontal;

  const triggerButton = (
    <button
      type="button"
      tabIndex={variant === "plus" ? -1 : undefined}
      title="Chat Options"
      aria-label="Chat Options"
      onClick={
        useWindowPresentation && variant === "gear"
          ? () =>
              openRunControlsWindow({
                conversationId,
                initialTab: "quickset",
              })
          : isMobile
            ? () => handleOpenChange(true)
            : undefined
      }
      className={cn(
        "relative flex items-center justify-center rounded-full transition-colors",
        variant === "plus" ? "h-9 w-9" : "h-8 w-8",
        "text-muted-foreground/70 hover:text-foreground hover:bg-muted/60",
      )}
    >
      <TriggerIcon className={variant === "plus" ? "h-5 w-5" : "h-4 w-4"} />
      {rc.addedCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold leading-none text-primary-foreground ring-2 ring-background">
          {rc.addedCount}
        </span>
      ) : rc.isCustomized ? (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
      ) : null}
    </button>
  );

  if (useWindowPresentation) {
    if (variant === "plus") {
      return (
        <PlusAttachMenu
          conversationId={conversationId}
          trigger={triggerButton}
          align={align}
          side={side}
        />
      );
    }
    return triggerButton;
  }

  if (isMobile) {
    return (
      <>
        {triggerButton}
        <TabbedBottomSheet
          open={open}
          onOpenChange={handleOpenChange}
          title="Chat options"
          tabs={rc.tabs.map((t) => ({
            id: t.id,
            label: t.label,
            icon: t.icon,
            trailing: rc.tabTrailing(t.id),
            content: (
              <RunControlsTabPanel {...panelProps} activeTab={t.id} fill />
            ),
          }))}
        />
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>

      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        className={cn(
          "p-0 border-border",
          fullscreen
            ? "flex h-[calc(100vh-2rem)] w-[calc(100vw-1rem)] flex-col"
            : "w-[min(680px,calc(100vw-1rem))]",
        )}
        container={dialogContainer ?? undefined}
      >
        <div
          role="tablist"
          aria-label="Run controls"
          className="flex shrink-0 overflow-x-auto border-b border-border [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {rc.tabs.map((t) => {
            const Icon = t.icon;
            const on = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`runctl-tab-${t.id}-${conversationId}`}
                aria-selected={on}
                aria-controls={`runctl-panel-${conversationId}`}
                onClick={() => setTab(t.id)}
                className={cn(
                  "-mb-px flex shrink-0 items-center justify-center gap-1 whitespace-nowrap border-b px-2 py-1.5 text-[11px] font-medium transition-colors sm:gap-1.5 sm:px-2.5 sm:py-2 sm:text-xs",
                  on
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t.label}</span>
                {rc.tabTrailing(t.id)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-label={
              fullscreen ? "Exit full screen" : "Expand to full screen"
            }
            title={fullscreen ? "Exit full screen" : "Expand to full screen"}
            className="sticky right-0 ml-auto flex shrink-0 items-center justify-center border-l border-border bg-background px-2.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <div
          role="tabpanel"
          id={`runctl-panel-${conversationId}`}
          aria-labelledby={`runctl-tab-${activeTab}-${conversationId}`}
          className={cn(fullscreen && "flex min-h-0 flex-1 flex-col")}
        >
          <RunControlsTabPanel
            {...panelProps}
            activeTab={activeTab}
            fill={fullscreen}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
