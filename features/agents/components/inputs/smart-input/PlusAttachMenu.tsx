"use client";

/**
 * PlusAttachMenu — the `+` quick menu on the Smart Input (desktop).
 *
 * Layout (top → bottom):
 *   1. ResourcePickerMenu (attach sources) — flex-1 scroll
 *   2. ONE combined row: Model + Overrides (inline drill-in) + Advanced Settings
 *      (full window @ settings tab — RunSettingsEditor)
 *   3. Working doc / Scratchpad switches
 *   4. ContextLensBar
 *   5. ComputeLensBar
 *   6. [compact only] auto-clear toggle (Enter-submits lives ONLY in
 *      Chat Options → Quickset; every version of this menu stays identical)
 *
 * Overrides drills in-place like Files / Tools — same panel, not a second
 * window. Advanced Settings opens the run-controls WindowPanel (RunSettingsEditor).
 *
 * Shell height is fixed at open (`PLUS_ATTACH_MENU_HEIGHT_CLASS`); only the
 * attach-list zone scrolls. Footer chrome is shrink-0 so capability filtering
 * and sub-picker navigation never resize the popover.
 */

import { useState, type ReactNode } from "react";
import { AppWindow, Cpu, RefreshCcw } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { ResourcePickerSubViewHeader } from "@/features/resource-manager/resource-picker/ResourcePickerSubViewHeader";
import { QuickRunModelSelect } from "@/features/agents/components/run-controls/RunModelPicker";
import { RunConfigOverrides } from "@/features/agents/components/run-controls/RunConfigOverrides";
import { useAttachResource } from "@/features/agents/components/inputs/resources/attach-resource";
import { useOpenRunControlsWindow } from "@/features/overlays/openers/runControlsWindow";
import { selectAttachmentCapabilities } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { selectWorkingDocEnabled } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { setConversationDocumentEnabledThunk } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import { setScratchpadGateThunk } from "@/features/agents/redux/execution-system/instance-working-document/scratchpad.thunks";
import { selectAutoClearConversation } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectShouldShowAutoClearToggle } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { setAutoClearMode } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { selectAgentIdFromInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { ContextLensBar } from "@/features/scopes/components/active-context/ContextLensBar";
import { ComputeLensBar } from "@/features/agents/components/inputs/smart-input/ComputeLensBar";
import { useSandboxBindingBlocked } from "@/features/agents/components/inputs/smart-input/use-compute-target-actions";
import { useOpenContextPreviewPanel } from "@/features/overlays/openers/contextPreviewPanel";
import { selectIsOverlayOpen } from "@/lib/redux/slices/overlaySlice";
import { useConversationDocumentsBridge } from "@/features/agents/hooks/useWorkingDocument";
import { selectIsManualExecutionMode } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { cn } from "@/lib/utils";
import type { Resource } from "@/features/agents/resources/types";

const MANUAL_MODE_SETTINGS_HINT =
  "Per-run settings are edited in the builder panel during test runs";

interface PlusAttachMenuProps {
  conversationId: string;
  /** The `+` button; becomes the PopoverTrigger. */
  trigger: ReactNode;
  align?: "start" | "end";
  side?: "top" | "bottom";
  /** See RunControlsMenu.foldToolbarExtras. */
  foldToolbarExtras?: boolean;
  /** Portal container when hosted inside a modal dialog. */
  container?: HTMLElement;
  /** Admin debug row at the bottom of the attach list. */
  onDebugClick?: () => void;
  showDebugActive?: boolean;
}

/** Fixed shell height — never use max-h alone; inner sections flex within this box. */
const PLUS_ATTACH_MENU_HEIGHT_CLASS = "h-[min(68vh,480px)]";

type PlusMenuView = "menu" | "overrides";

function DocumentSwitchesRow({ conversationId }: { conversationId: string }) {
  const dispatch = useAppDispatch();
  const workingDocEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId),
  );
  const scratchEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId, "scratch"),
  );

  return (
    <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-1.5">
        <span className="truncate text-[11px] font-medium text-muted-foreground">
          Working doc
        </span>
        <Switch
          checked={workingDocEnabled}
          onCheckedChange={(value) =>
            void dispatch(
              setConversationDocumentEnabledThunk({
                conversationId,
                kind: "working",
                enabled: value,
              }),
            )
          }
          aria-label="Toggle working document for this chat"
        />
      </label>
      <span className="h-4 w-px shrink-0 bg-border" />
      <label className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-1.5">
        <span className="truncate text-[11px] font-medium text-muted-foreground">
          Scratchpad
        </span>
        <Switch
          checked={scratchEnabled}
          onCheckedChange={(value) =>
            void dispatch(
              setScratchpadGateThunk({
                conversationId,
                enabled: value,
              }),
            )
          }
          aria-label="Toggle scratchpad for this chat"
        />
      </label>
    </div>
  );
}

function ContextLensMenuRow({ conversationId }: { conversationId: string }) {
  const openContextPreview = useOpenContextPreviewPanel();
  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId));
  const previewOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "contextPreviewPanel"),
  );

  return (
    <div className="flex w-full border-t border-border px-2 py-1.5">
      <ContextLensBar
        conversationId={conversationId}
        className="h-7 w-full max-w-full"
        previewOpen={previewOpen}
        onOpenPreview={() =>
          openContextPreview({
            conversationId,
            agentId: agentId ?? undefined,
          })
        }
      />
    </div>
  );
}

function ComputeLensMenuRow({
  conversationId,
  onOpenPanel,
}: {
  conversationId: string;
  onOpenPanel: () => void;
}) {
  const sandboxBlocked = useSandboxBindingBlocked(conversationId);
  if (sandboxBlocked) return null;

  return (
    <div className="flex w-full border-t border-border px-2 py-1.5">
      <ComputeLensBar
        conversationId={conversationId}
        className="h-7 w-full max-w-full"
        onOpenPanel={onOpenPanel}
      />
    </div>
  );
}

export function PlusAttachMenu({
  conversationId,
  trigger,
  align = "start",
  side = "top",
  foldToolbarExtras = false,
  container,
  onDebugClick,
  showDebugActive,
}: PlusAttachMenuProps) {
  useConversationDocumentsBridge(conversationId);

  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PlusMenuView>("menu");

  const attachmentCapabilities = useAppSelector(
    selectAttachmentCapabilities(conversationId),
  );
  const autoClear = useAppSelector(selectAutoClearConversation(conversationId));
  const shouldShowAutoClearToggle = useAppSelector(
    selectShouldShowAutoClearToggle(conversationId),
  );
  const isManualMode = useAppSelector(
    selectIsManualExecutionMode(conversationId),
  );

  const openRunControlsWindow = useOpenRunControlsWindow();
  const attachResource = useAttachResource(conversationId);
  const handleResourceSelected = async (resource: Resource) => {
    return attachResource(resource);
  };

  const closeMenu = () => {
    setOpen(false);
    setView("menu");
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setView("menu");
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        container={container}
        className={`flex ${PLUS_ATTACH_MENU_HEIGHT_CLASS} w-96 max-w-[calc(100vw-1rem)] flex-col overflow-hidden border-border p-0`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {view === "overrides" ? (
            <div className="flex min-h-full flex-col">
              <ResourcePickerSubViewHeader
                title="Overrides"
                icon={<Cpu className="h-3.5 w-3.5 shrink-0 text-primary" />}
                onBack={() => setView("menu")}
              />
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <RunConfigOverrides conversationId={conversationId} />
              </div>
            </div>
          ) : (
            <div className="min-h-full">
              <ResourcePickerMenu
                conversationId={conversationId}
                onResourceSelected={handleResourceSelected}
                onClose={closeMenu}
                attachmentCapabilities={attachmentCapabilities}
                onDebugClick={onDebugClick}
                showDebugActive={showDebugActive}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col">
          {/* Model + Overrides (inline) + Advanced Settings (window).
              Overrides ≠ Advanced Settings — terminology restored 2026-08-11. */}
          <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Model
            </span>
            <QuickRunModelSelect
              conversationId={conversationId}
              className="h-6 min-w-0 flex-1"
            />
            <button
              type="button"
              disabled={isManualMode}
              title={
                isManualMode
                  ? MANUAL_MODE_SETTINGS_HINT
                  : "Per-run model overrides"
              }
              aria-pressed={view === "overrides"}
              onClick={() => {
                if (isManualMode) return;
                setView((v) => (v === "overrides" ? "menu" : "overrides"));
              }}
              className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors",
                view === "overrides"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                isManualMode &&
                  "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground",
              )}
            >
              <Cpu className="h-3.5 w-3.5 shrink-0" />
              Overrides
            </button>
            <button
              type="button"
              disabled={isManualMode}
              title={
                isManualMode ? MANUAL_MODE_SETTINGS_HINT : "Advanced Settings"
              }
              onClick={() => {
                if (isManualMode) return;
                closeMenu();
                openRunControlsWindow({
                  conversationId,
                  initialTab: "settings",
                });
              }}
              className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                isManualMode &&
                  "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground",
              )}
            >
              <AppWindow className="h-3.5 w-3.5 shrink-0" />
              Advanced Settings
            </button>
          </div>

          {view === "menu" ? (
            <>
              <DocumentSwitchesRow conversationId={conversationId} />

              <ContextLensMenuRow conversationId={conversationId} />

              <ComputeLensMenuRow
                conversationId={conversationId}
                onOpenPanel={() => {
                  closeMenu();
                  openRunControlsWindow({
                    conversationId,
                    initialTab: "sandbox",
                  });
                }}
              />

              {/* "Enter submits" deliberately does NOT render here — it lives in
                  Chat Options → Quickset, and per Arman (2026-08-08) every version
                  of this menu must be identical (the new-chat variant had an extra
                  full-width row the normal chat lacked). */}
              {foldToolbarExtras && shouldShowAutoClearToggle && (
                <div className="flex flex-col gap-0.5 border-t border-border px-2 py-1.5">
                  <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <RefreshCcw className="h-3.5 w-3.5" />
                      Auto-clear
                    </span>
                    <Switch
                      checked={autoClear}
                      onCheckedChange={(value) =>
                        dispatch(setAutoClearMode({ conversationId, value }))
                      }
                      aria-label="Toggle auto-clear conversation"
                    />
                  </label>
                </div>
              )}
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
