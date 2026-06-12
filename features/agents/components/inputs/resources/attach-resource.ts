"use client";

/**
 * attach-resource — the single mapping from a picked `Resource` to an
 * instance resource block, shared by every surface that attaches resources
 * to an agent execution instance (SmartAgentResourcePickerButton, the
 * RunControlsMenu Attach tab, …). Previously copy-pasted per surface, which
 * drifted.
 */

import { useAppDispatch } from "@/lib/redux/hooks";
import {
  addResource,
  setResourcePreview,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import {
  refineBlockType,
  resourceDataToSource,
} from "@/features/agents/redux/execution-system/instance-resources/resource-source";
import type { Resource } from "@/features/prompts/types/resources";
import type { ResourceBlockType } from "@/features/agents/types/instance.types";

/** Map prompt-system resource types to agent ResourceBlockType. */
export function resourceTypeToBlockType(
  type: Resource["type"],
): ResourceBlockType {
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

/** Extract the display label from a Resource (used for the chip preview). */
export function resourceLabel(resource: Resource): string {
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

/**
 * Returns a handler that attaches a picked Resource to the instance:
 * refines the block type from the data's real MIME (pickers deliver
 * `type = "file"` for any upload, so the naive map would send images as
 * documents), dispatches `addResource`, and immediately sets the chip
 * preview label. Closing the hosting popover is the CALLER's job.
 */
export function useAttachResource(
  conversationId: string,
): (resource: Resource) => void {
  const dispatch = useAppDispatch();

  return (resource: Resource) => {
    const baseBlockType = resourceTypeToBlockType(resource.type);
    const blockType = refineBlockType(baseBlockType, resource.data);
    const label = resourceLabel(resource);
    const resourceId = `res_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    dispatch(
      addResource({
        conversationId,
        blockType,
        source: resourceDataToSource(blockType, resource.data),
        resourceId,
      }),
    );
    dispatch(
      setResourcePreview({ conversationId, resourceId, preview: label }),
    );
  };
}
