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
import { ResourcePickerWindow } from "../../../../host/ui-slots";
import { Plus } from "lucide-react";
import { useDialogContainer } from "@ai-matrx/design-system";
import { useAppSelector } from "../../../../store/hooks";
import { cn } from "@ai-matrx/design-system";
import { selectAttachmentCapabilities } from "../../../redux/execution-system/instance-input-capabilities/instance-input-capabilities.selectors";
import { PlusAttachMenu } from "../smart-input/PlusAttachMenu";
import { useAttachResource, useDetachResource } from "./attach-resource";
import type { Resource } from "../../../resources/types";
import { Button } from "@ai-matrx/design-system/controls";

interface SmartAgentResourcePickerButtonProps {
  conversationId: string;
  uploadRoot?: string;
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
  const detachResource = useDetachResource(conversationId);
  const handleResourceSelected = async (resource: Resource) => {
    return attachResource(resource);
  };

  const defaultTrigger = (
    <Button variant="quiet" icon={<Plus className={triggerSize === "compact" ? "h-4 w-4" : "h-5 w-5"} />} title="Chat options" aria-label="Chat options" />
  );

  const trigger = triggerSlot ?? defaultTrigger;

  if (useWindowMode) {
    return (
      <>
        {triggerSlot ? (
          <span onClick={() => setIsOpen(true)}>{triggerSlot}</span>
        ) : (
          <Button variant="quiet" icon={<Plus
              className={triggerSize === "compact" ? "h-4 w-4" : "h-5 w-5"}
            />} title="Attach resource" aria-label="Attach resource" onClick={() => setIsOpen(true)} />
        )}
        <ResourcePickerWindow
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onResourceSelected={handleResourceSelected}
          onResourceDeselected={detachResource}
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
