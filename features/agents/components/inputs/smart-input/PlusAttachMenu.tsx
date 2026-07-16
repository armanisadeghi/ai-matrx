"use client";

/**
 * PlusAttachMenu — the `+` quick menu on the Smart Input (desktop).
 *
 * Default (stacked chrome): ResourcePickerMenu + compact quick rows
 * (model, doc switches, context chips → Edit, Advanced). Documents & the
 * dense context tree live on the dedicated Layers button — do not duplicate
 * them here.
 *
 * Compact (`foldToolbarExtras`): same attach/model chrome, plus the full
 * ContextDocsMenuBody (docs + dense ContextTree) and Enter/auto-clear
 * toggles that stacked shows as dedicated toolbar buttons.
 */

import { useState, type ReactNode } from "react";
import {
  CornerDownLeft,
  Layers,
  RefreshCcw,
  SlidersHorizontal,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { QuickRunModelSelect } from "@/features/agents/components/run-controls/RunModelPicker";
import { useAttachResource } from "@/features/agents/components/inputs/resources/attach-resource";
import { useOpenRunControlsWindow } from "@/features/overlays/openers/runControlsWindow";
import { selectAttachmentCapabilities } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { selectWorkingDocEnabled } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { setConversationDocumentEnabledThunk } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import { setScratchpadGateThunk } from "@/features/agents/redux/execution-system/instance-working-document/scratchpad.thunks";
import {
  selectSubmitOnEnter,
  selectAutoClearConversation,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setSubmitOnEnter } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { selectShouldShowAutoClearToggle } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { setAutoClearMode } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { ActiveScopeChips } from "@/features/scopes/components/active-context/ActiveScopeChips";
import { selectHasActiveContext } from "@/features/scopes/redux/selectors/active-context";
import { ContextDocsMenuBody } from "./ContextDocsMenu";
import type { Resource } from "@/features/agents/resources/types";

interface PlusAttachMenuProps {
  conversationId: string;
  /** The `+` button; becomes the PopoverTrigger. */
  trigger: ReactNode;
  align?: "start" | "end";
  side?: "top" | "bottom";
  /** See RunControlsMenu.foldToolbarExtras. */
  foldToolbarExtras?: boolean;
}

export function PlusAttachMenu({
  conversationId,
  trigger,
  align = "start",
  side = "top",
  foldToolbarExtras = false,
}: PlusAttachMenuProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);

  const attachmentCapabilities = useAppSelector(
    selectAttachmentCapabilities(conversationId),
  );
  const workingDocEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId),
  );
  const scratchEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId, "scratch"),
  );
  const hasActiveContext = useAppSelector(selectHasActiveContext);
  const submitOnEnter = useAppSelector(selectSubmitOnEnter(conversationId));
  const autoClear = useAppSelector(selectAutoClearConversation(conversationId));
  const shouldShowAutoClearToggle = useAppSelector(
    selectShouldShowAutoClearToggle(conversationId),
  );

  const openRunControlsWindow = useOpenRunControlsWindow();
  const attachResource = useAttachResource(conversationId);
  const handleResourceSelected = (resource: Resource) => {
    attachResource(resource);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        className="w-96 max-w-[calc(100vw-1rem)] max-h-[min(80vh,640px)] overflow-y-auto overscroll-contain border-border p-0"
      >
        <ResourcePickerMenu
          onResourceSelected={handleResourceSelected}
          onClose={() => setOpen(false)}
          attachmentCapabilities={attachmentCapabilities}
        />

        {/* Row 1 — model override (per-conversation; never edits the agent) */}
        <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Model
          </span>
          <QuickRunModelSelect
            conversationId={conversationId}
            className="h-6 min-w-0 flex-1"
          />
        </div>

        {foldToolbarExtras ? (
          <>
            {/* Compact chrome: full docs + dense context tree (no Layers button). */}
            <div className="border-t border-border">
              <ContextDocsMenuBody
                conversationId={conversationId}
                onClose={() => setOpen(false)}
              />
            </div>

            <div className="flex flex-col gap-0.5 border-t border-border px-2 py-1.5">
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <CornerDownLeft className="h-3.5 w-3.5" />
                  Enter submits
                </span>
                <Switch
                  checked={submitOnEnter}
                  onCheckedChange={(value) =>
                    dispatch(setSubmitOnEnter({ conversationId, value }))
                  }
                  aria-label="Toggle Enter to submit"
                />
              </label>
              {shouldShowAutoClearToggle && (
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
              )}
            </div>
          </>
        ) : (
          <>
            {/* Stacked chrome: compact doc switches + chips — tree lives on Layers. */}
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

            <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
              {hasActiveContext ? (
                <ActiveScopeChips className="min-w-0 flex-1" />
              ) : (
                <span className="min-w-0 flex-1 text-[11px] text-muted-foreground/70">
                  No active context
                </span>
              )}
              <button
                type="button"
                title="Edit active context"
                aria-label="Edit active context"
                onClick={() => {
                  setOpen(false);
                  openRunControlsWindow({
                    conversationId,
                    initialTab: "context",
                  });
                }}
                className="shrink-0 rounded-full p-1.5 text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <Layers className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            openRunControlsWindow({ conversationId, initialTab: "settings" });
          }}
          className="flex w-full items-center gap-2 border-t border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
          Advanced settings
        </button>
      </PopoverContent>
    </Popover>
  );
}
