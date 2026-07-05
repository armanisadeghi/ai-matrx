"use client";

/**
 * PlusAttachMenu — the `+` quick menu on the Smart Input (desktop).
 *
 * The lightweight anchored attach popover: `ResourcePickerMenu` (with its own
 * internal drill-in panels) plus ONE compact quick row underneath:
 *
 *   [ model override select ]  [ Working doc switch ]  [ All options ]
 *
 * "All options" opens the Chat Options window (`runControlsWindow`) on its
 * Context tab. This component is desktop-only and window-capable-host-only —
 * mobile keeps the TabbedBottomSheet and in-dialog hosts keep the tabbed
 * popover fallback (both routed in `RunControlsMenu`).
 */

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
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
import {
  selectAttachmentCapabilities,
  selectInstanceOverrideState,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { selectWorkingDocEnabled } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { setConversationDocumentEnabledThunk } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import type { Resource } from "@/features/agents/resources/types";

interface PlusAttachMenuProps {
  conversationId: string;
  /** The `+` button; becomes the PopoverTrigger. */
  trigger: ReactNode;
  align?: "start" | "end";
  side?: "top" | "bottom";
}

export function PlusAttachMenu({
  conversationId,
  trigger,
  align = "start",
  side = "top",
}: PlusAttachMenuProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);

  const attachmentCapabilities = useAppSelector(
    selectAttachmentCapabilities(conversationId),
  );
  const overrideState = useAppSelector(
    selectInstanceOverrideState(conversationId),
  );
  const hasOverrideLayer = !!overrideState;
  const workingDocEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId),
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
        className="w-80 border-border p-0"
      >
        <ResourcePickerMenu
          onResourceSelected={handleResourceSelected}
          onClose={() => setOpen(false)}
          attachmentCapabilities={attachmentCapabilities}
        />

        <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
          {hasOverrideLayer ? (
            <QuickRunModelSelect
              conversationId={conversationId}
              className="h-6 min-w-0 flex-1"
            />
          ) : (
            <span className="min-w-0 flex-1" />
          )}

          <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">
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
              aria-label="Toggle working document"
            />
          </label>

          <button
            type="button"
            title="All chat options"
            aria-label="Open all chat options"
            onClick={() => {
              setOpen(false);
              openRunControlsWindow({
                conversationId,
                initialTab: "context",
              });
            }}
            className="shrink-0 rounded-full p-1.5 text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
