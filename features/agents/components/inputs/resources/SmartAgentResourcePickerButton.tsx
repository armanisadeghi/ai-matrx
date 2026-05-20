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

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDialogContainer } from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  addResource,
  setResourcePreview,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { selectAttachmentCapabilities } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";

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
import {
  refineBlockType,
  resourceDataToSource,
} from "@/features/agents/redux/execution-system/instance-resources/resource-source";
import type { Resource } from "@/features/prompts/types/resources";
import type { ResourceBlockType } from "@/features/agents/types/instance.types";

// Map prompt-system resource types to agent ResourceBlockType
function resourceTypeToBlockType(type: Resource["type"]): ResourceBlockType {
  const map: Record<string, ResourceBlockType> = {
    note: "input_notes",
    task: "input_task",
    project: "input_notes",
    file: "document",
    table: "input_table",
    webpage: "input_webpage",
    youtube: "youtube_video",
    image_url: "image",
    file_url: "document",
    audio: "audio",
  };
  return map[type] ?? "text";
}

// Extract the display label from a Resource
function resourceLabel(resource: Resource): string {
  switch (resource.type) {
    case "note":
      return resource.data.label ?? "Note";
    case "task":
      return resource.data.title ?? "Task";
    case "project":
      return resource.data.name ?? "Project";
    case "file":
      return resource.data.details?.filename ?? "File";
    case "table":
      return resource.data.table_name ?? "Table";
    case "webpage":
      return resource.data.title ?? resource.data.url ?? "Webpage";
    case "youtube":
      return resource.data.title ?? "YouTube";
    case "image_url":
      return resource.data.url ?? "Image";
    case "file_url":
      return resource.data.filename ?? "File";
    case "audio":
      return resource.data.filename ?? "Audio";
    default:
      return "Resource";
  }
}

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
  const dispatch = useAppDispatch();
  const dialogContainer = useDialogContainer();

  const attachmentCapabilities = useAppSelector(
    selectAttachmentCapabilities(conversationId),
  );

  const handleResourceSelected = useCallback(
    (resource: Resource) => {
      // Pickers deliver `Resource.type = "file"` for any uploaded file —
      // image, video, audio, document — so the naive map sends them all
      // as `"document"` and the AI never sees the JPEG as an image.
      // `refineBlockType` looks at the data's real MIME and upgrades
      // `"document"` → `"image"` / `"video"` / `"audio"` when warranted.
      const baseBlockType = resourceTypeToBlockType(resource.type);
      const blockType = refineBlockType(baseBlockType, resource.data);
      const label = resourceLabel(resource);
      const resourceId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      dispatch(
        addResource({
          conversationId,
          blockType,
          source: resourceDataToSource(blockType, resource.data),
          resourceId,
        }),
      );

      // Immediately mark as ready with a preview string for the chip label
      dispatch(
        setResourcePreview({
          conversationId,
          resourceId,
          preview: label,
        }),
      );

      setIsOpen(false);
    },
    [conversationId, dispatch],
  );

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
