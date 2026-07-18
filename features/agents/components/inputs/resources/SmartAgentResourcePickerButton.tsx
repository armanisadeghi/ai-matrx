"use client";

/**
 * SmartAgentResourcePickerButton
 *
 * Conversation-scoped attach / run-controls entry point. Popover mode renders
 * the canonical `PlusAttachMenu` (attach sources, model, working doc, context
 * lens, …). Window mode keeps the attach-only `ResourcePickerWindow` for
 * surfaces that need a floating panel.
 *
 * Prop: conversationId only (plus optional trigger chrome).
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
import { useDialogContainer } from "@/components/ui/dialog";
import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { selectAttachmentCapabilities } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { PlusAttachMenu } from "@/features/agents/components/inputs/smart-input/PlusAttachMenu";
import { useAttachResource } from "./attach-resource";
import type { Resource } from "@/features/agents/resources/types";

const ResourcePickerWindow = dynamic(
  () =>
    import("@/features/window-panels/windows/ResourcePickerWindow").then(
      (m) => ({ default: m.ResourcePickerWindow }),
    ),
  { ssr: false },
);

interface SmartAgentResourcePickerButtonProps {
  conversationId: string;
  uploadBucket?: string;
  uploadPath?: string;
  /** When true, opens as a floating WindowPanel instead of a popover. Default: false. */
  useWindowMode?: boolean;
  /**
   * Custom trigger element — replaces the default Plus button.
   * Popover mode: must be a single focusable element (PopoverTrigger asChild).
   */
  triggerSlot?: React.ReactNode;
  /** Compact toolbar sizing for widgets and dense inputs. */
  triggerSize?: "default" | "compact";
  /** Fold Enter/auto-clear toggles into the menu (compact surfaces). */
  foldToolbarExtras?: boolean;
}

export function SmartAgentResourcePickerButton({
  conversationId,
  useWindowMode = false,
  triggerSlot,
  triggerSize = "compact",
  foldToolbarExtras = true,
}: SmartAgentResourcePickerButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogContainer = useDialogContainer();

  const attachmentCapabilities = useAppSelector(
    selectAttachmentCapabilities(conversationId),
  );

  const attachResource = useAttachResource(conversationId);
  const handleResourceSelected = (resource: Resource) => {
    attachResource(resource);
    setIsOpen(false);
  };

  const defaultTrigger = (
    <button
      type="button"
      tabIndex={-1}
      title="Chat options"
      aria-label="Chat options"
      className={cn(
        "relative flex items-center justify-center rounded-full transition-colors",
        triggerSize === "compact" ? "h-6 w-6" : "h-9 w-9",
        "text-muted-foreground/70 hover:text-foreground hover:bg-muted/60",
      )}
    >
      <Plus className={triggerSize === "compact" ? "h-4 w-4" : "h-5 w-5"} />
    </button>
  );

  const trigger = triggerSlot ?? defaultTrigger;

  if (useWindowMode) {
    return (
      <>
        {triggerSlot ? (
          <span onClick={() => setIsOpen(true)}>{triggerSlot}</span>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            title="Attach resource"
            aria-label="Attach resource"
            onClick={() => setIsOpen(true)}
            className={cn(
              "relative flex items-center justify-center rounded-full transition-colors",
              triggerSize === "compact" ? "h-6 w-6" : "h-9 w-9",
              "text-muted-foreground/70 hover:text-foreground hover:bg-muted/60",
            )}
          >
            <Plus
              className={triggerSize === "compact" ? "h-4 w-4" : "h-5 w-5"}
            />
          </button>
        )}
        <ResourcePickerWindow
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onResourceSelected={handleResourceSelected}
          attachmentCapabilities={attachmentCapabilities}
          position="center"
        />
      </>
    );
  }

  return (
    <PlusAttachMenu
      conversationId={conversationId}
      trigger={trigger}
      side="top"
      align="start"
      foldToolbarExtras={foldToolbarExtras}
      container={dialogContainer ?? undefined}
    />
  );
}
