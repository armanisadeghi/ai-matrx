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
import {
  FileText,
  SlidersHorizontal,
  Plus,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@ai-matrx/design-system";
import { useDialogContainer } from "@ai-matrx/design-system";
import { usePopoutContainer } from "../../../../host/ui-slots";
import { cn } from "@ai-matrx/design-system";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { TabbedBottomSheet } from "@ai-matrx/design-system";
import { useOpenRunControlsWindow } from "../../../../host/window-openers";
import { PlusAttachMenu } from "./PlusAttachMenu";
import { ComposerPlusMenu } from "./composer/ComposerPlusMenu";
import type { ComposerMode, ComposerSize } from "./composer/composer-types";
import { mobileSheetShowsTab } from "./composer/composer-mode-visibility";
import {
  useAttachResource,
  useDetachResource,
} from "../resources/attach-resource";
import { useConversationDocumentsBridge } from "../../../hooks/useWorkingDocument";
import {
  RunControlsTabPanel,
  useRunControlsState,
  type RunControlsTab,
} from "./RunControlsTabPanel";
import type { Resource } from "../../../resources/types";
import { SmartInputMessageTemplatePicker } from "../../../../host/ui-slots";
import { useAppDispatch, useAppSelector } from "../../../../store/hooks";
import { selectUserInputText } from "../../../redux/execution-system/instance-user-input/instance-user-input.selectors";
import { setUserInputText } from "../../../redux/execution-system/instance-user-input/instance-user-input.slice";
import { prependTemplateToDraft } from "@ai-matrx/chat/agents/components/inputs/smart-input/prepend-template-to-draft";
import { Button } from "@ai-matrx/design-system/controls";

export interface RunControlsMenuProps {
  conversationId: string;
  variant?: "gear" | "plus";
  includeAttach?: boolean;
  align?: "start" | "end";
  side?: "top" | "bottom";
  /**
   * Compact chrome (single-row / landing): fold Documents & context + the
   * toggles that stacked shows as dedicated buttons into the `+` menu.
   * Never set this on stacked — those affordances already have their own
   * toolbar buttons and must not be duplicated.
   */
  foldToolbarExtras?: boolean;
  onRequestInputExpand?: () => void;
  /**
   * The three-mode composer (composer/composer-types.ts). Present = the
   * desktop `+` opens the mode-aware cascading ComposerPlusMenu; absent =
   * PlusAttachMenu exactly as before. Mobile keeps the bottom sheet either way.
   */
  composer?: {
    mode: ComposerMode;
    size: ComposerSize;
    surfaceKey?: string;
    /** The composer is narrow: Scope lives in the + menu. */
    folded?: boolean;
    /** Compact and narrow: live audio lives in the + menu too. */
    foldLiveAudio?: boolean;
    /** The + menu's Live audio row turns the composer's voice on. */
    onLiveAudio?: () => void;
  };
}

export function RunControlsMenu({
  conversationId,
  variant = "gear",
  includeAttach = variant === "plus",
  align = variant === "plus" ? "start" : "end",
  side = variant === "plus" ? "top" : "bottom",
  foldToolbarExtras = false,
  onRequestInputExpand,
  composer,
}: RunControlsMenuProps) {
  const dispatch = useAppDispatch();
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
  const inputText = useAppSelector(selectUserInputText(conversationId));

  const insertTemplate = (templateText: string) => {
    dispatch(
      setUserInputText({
        conversationId,
        text: prependTemplateToDraft(templateText, inputText),
      }),
    );
    onRequestInputExpand?.();
  };

  const attachResource = useAttachResource(conversationId);
  const detachResource = useDetachResource(conversationId);
  const handleResourceSelected = async (resource: Resource) => {
    return attachResource(resource);
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
    onResourceDeselected: detachResource,
    onClose: () => setOpen(false),
  };

  // An overlay window can't serve a composer hosted inside a modal Dialog
  // (windows sit below the dialog layer) or a popped-out window (overlays
  // render in the main browser window). Those hosts keep the anchored popover.
  const useWindowPresentation =
    !isMobile && !dialogContainer && !popoutContainer;

  const TriggerIcon = variant === "plus" ? Plus : SlidersHorizontal;

  const triggerButton = (
    <Button
      variant="quiet"
      // Something ADDED shows on the control itself: the count as its label,
      // tinted. Changed settings never tint it — a new chat on Custom (its own
      // model) with an organization chosen already counts as "customized", so
      // the + sat blue on every fresh chat (Arman, 2026-10-07). The window's
      // tabs carry their own dots for changed settings.
      tone={rc.addedCount > 0 ? "primary" : undefined}
      icon={<TriggerIcon />}
      tabIndex={variant === "plus" ? -1 : undefined}
      title="Chat Options"
      aria-label={
        rc.addedCount > 0 ? `Chat Options (${rc.addedCount} added)` : "Chat Options"
      }
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
      className="shrink-0"
    >
      {rc.addedCount > 0 ? String(rc.addedCount) : undefined}
    </Button>
  );

  if (useWindowPresentation) {
    if (variant === "plus" && composer) {
      return (
        <ComposerPlusMenu
          conversationId={conversationId}
          trigger={triggerButton}
          mode={composer.mode}
          size={composer.size}
          folded={composer.folded}
          foldLiveAudio={composer.foldLiveAudio}
          onLiveAudio={composer.onLiveAudio}
          side={side}
          surfaceKey={composer.surfaceKey}
          onRequestInputExpand={onRequestInputExpand}
        />
      );
    }
    if (variant === "plus") {
      return (
        <PlusAttachMenu
          conversationId={conversationId}
          trigger={triggerButton}
          align={align}
          side={side}
          foldToolbarExtras={foldToolbarExtras}
          onRequestInputExpand={onRequestInputExpand}
        />
      );
    }
    return triggerButton;
  }

  if (isMobile && variant === "plus" && composer) {
    // The phone + is the SAME menu as the desktop +, as the iOS sheet.
    return (
      <ComposerPlusMenu
        conversationId={conversationId}
        trigger={triggerButton}
        mode={composer.mode}
        size={composer.size}
        folded={composer.folded}
          foldLiveAudio={composer.foldLiveAudio}
          onLiveAudio={composer.onLiveAudio}
        side={side}
        surfaceKey={composer.surfaceKey}
        onRequestInputExpand={onRequestInputExpand}
        presentation="sheet"
        open={open}
        onOpenChange={handleOpenChange}
      />
    );
  }

  if (isMobile) {
    return (
      <>
        {triggerButton}
        <TabbedBottomSheet
          open={open}
          onOpenChange={handleOpenChange}
          title="Chat options"
          // 🚨 44px ON A PHONE (W-72, PB-08 dry run 2026-10-01): every panel
          // in this sheet (Attach, Context, Tools, Skills…) was built desktop-
          // dense — 28px rows, 14px tick boxes. The sheet's tab panels sit in
          // `matrx-touch-targets` (a `contents` box, so no layout moves), which
          // floors every row / button inside to 44px on touch only.
          tabs={[
            ...(variant === "plus"
              ? [
                  {
                    id: "message-templates",
                    label: "Templates",
                    icon: FileText,
                    content: (
                      <div className="matrx-touch-targets contents">
                        <SmartInputMessageTemplatePicker
                          onSelect={(templateText) => {
                            insertTemplate(templateText);
                            setOpen(false);
                          }}
                        />
                      </div>
                    ),
                  },
                ]
              : []),
            ...rc.tabs
              .filter(
                (t) => !composer || mobileSheetShowsTab(composer.mode, t.id),
              )
              .map((t) => ({
              id: t.id,
              label: t.label,
              icon: t.icon,
              trailing: rc.tabTrailing(t.id),
              // A pick in Attach (note, file, chat) returns to the tab list
              // so the person keeps setting up the chat (PB-08, 2026-10-01).
              content: ({ showIndex }: { showIndex: () => void }) => (
                <div className="matrx-touch-targets contents">
                  <RunControlsTabPanel
                    {...panelProps}
                    activeTab={t.id}
                    fill
                    onPicked={showIndex}
                  />
                </div>
              ),
            })),
          ]}
        />
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>

      <PopoverContent
        /* sizing: fixed — fixed fullscreen/compact run-controls panel layout, not a single content-sized value */
        align={align}
        side={side}
        sideOffset={8}
        className={cn(
          "p-0 border-border",
          fullscreen
            ? "flex h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] flex-col"
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
              <Button variant="quiet" pressed={!!(on)} icon={<Icon />} key={t.id} role="tab" aria-pressed={undefined} id={`runctl-tab-${t.id}-${conversationId}`} aria-selected={on} aria-controls={`runctl-panel-${conversationId}`} onClick={() => setTab(t.id)} className="-mb-px shrink-0">{t.label} {rc.tabTrailing(t.id)}</Button>
            );
          })}
          <Button variant="outline" icon={fullscreen ? <Minimize2 /> : <Maximize2 />} onClick={() => setFullscreen((v) => !v)} aria-label={
              fullscreen ? "Exit full screen" : "Expand to full screen"
            } title={fullscreen ? "Exit full screen" : "Expand to full screen"} className="sticky right-0 ml-auto shrink-0" />
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
