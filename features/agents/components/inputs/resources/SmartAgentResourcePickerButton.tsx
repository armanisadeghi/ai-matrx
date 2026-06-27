"use client";

/**
 * SmartAgentResourcePickerButton
 *
 * Fully self-contained resource picker for agent execution instances.
 * Reads attachment capabilities from instanceModelOverrides and dispatches
 * selected resources directly to instanceResources — no prop drilling.
 *
 * Prop: conversationId only.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDialogContainer } from "@/components/ui/dialog";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAttachmentCapabilities } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { useAttachResource } from "./attach-resource";

// Lazy-loaded — see ResourcePickerButton.tsx for why. Static import was
// dragging the entire window-panel chunk graph into every agent surface
// that mounts this button.
const ResourcePickerWindow = dynamic(
  () =>
    import("@/features/window-panels/windows/ResourcePickerWindow").then(
      (m) => ({ default: m.ResourcePickerWindow }),
    ),
  { ssr: false },
);
import type { Resource } from "@/features/agents/resources/types";

interface SmartAgentResourcePickerButtonProps {
  conversationId: string;
  uploadBucket?: string;
  uploadPath?: string;
  /** When true, opens as a floating WindowPanel instead of a popover. Default: false. */
  useWindowMode?: boolean;
  /**
   * Custom trigger element — replaces the default ghost-Database button.
   * When provided, the surface (e.g. the chat landing's pill input) controls
   * the trigger's icon, size, and chrome while the picker behaviour stays
   * identical. Note: the parent should NOT attach its own onClick — clicks
   * propagate to the popover via Radix's PopoverTrigger.
   */
  triggerSlot?: React.ReactNode;
}

export function SmartAgentResourcePickerButton({
  conversationId,
  uploadBucket = "userContent",
  uploadPath = "agent-attachments",
  useWindowMode = false,
  triggerSlot,
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
    <Button
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-1 text-muted-foreground hover:text-foreground"
      tabIndex={-1}
      title="Attach resource"
      onClick={useWindowMode ? () => setIsOpen(true) : undefined}
    >
      <Database className="w-3 h-3" />
    </Button>
  );

  // Surfaces can replace the trigger entirely (e.g. the chat landing wants
  // a Plus icon with its own sizing). Window-mode click is wired up here
  // because the custom trigger doesn't know about that flag.
  const trigger = triggerSlot ? (
    useWindowMode ? (
      <span onClick={() => setIsOpen(true)}>{triggerSlot}</span>
    ) : (
      triggerSlot
    )
  ) : (
    defaultTrigger
  );

  if (useWindowMode) {
    return (
      <>
        {trigger}
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
    <Popover open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 border-border"
        align="start"
        side="top"
        sideOffset={8}
        container={dialogContainer ?? undefined}
      >
        <ResourcePickerMenu
          onResourceSelected={handleResourceSelected}
          onClose={() => setIsOpen(false)}
          attachmentCapabilities={attachmentCapabilities}
        />
      </PopoverContent>
    </Popover>
  );
}
