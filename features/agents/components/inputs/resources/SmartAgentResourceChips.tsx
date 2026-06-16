"use client";

/**
 * SmartAgentResourceChips
 *
 * Renders attachment tiles for all resources on an execution instance.
 * Non-file blocks use ResourceAttachmentTile; file_id media uses FileResourceChip.
 * Reads from instanceResources, dispatches removeResource directly.
 */

import { useCallback, type ComponentType } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  StickyNote,
  CheckSquare,
  Table2,
  Globe,
  File,
  FileText,
  Image,
  Mic,
  Video,
  Youtube,
  FolderKanban,
  AlertCircle,
  Code2,
  Webhook,
  Folder,
  LayoutGrid,
  Captions,
  AudioLines,
  Notebook,
} from "lucide-react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectInstanceResources } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import {
  removeResource,
  updateResourceOptions,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { isEditableCapableBlockType } from "@/features/agents/redux/execution-system/instance-resources/editable-resource-types";
import { selectShowAttachments } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import type {
  ManagedResource,
  ResourceBlockType,
} from "@/features/agents/types/instance.types";
import type { ResourceEditableState } from "@/features/agents/components/messages-display/user/ResourceAttachmentTile";
import { NoteHoverPreview } from "@/features/agents/components/previews/NoteHoverPreview";
import { TaskHoverPreview } from "@/features/agents/components/previews/TaskHoverPreview";
import { WebpageHoverPreview } from "@/features/agents/components/previews/WebpageHoverPreview";
import { DataRefHoverPreview } from "@/features/agents/components/previews/DataRefHoverPreview";
import { ResourceAttachmentTile } from "@/features/agents/components/messages-display/user/ResourceAttachmentTile";
import type { DataRef } from "@/features/agents/types/message-types";

function getBlockTypeDisplay(blockType: ResourceBlockType) {
  const map: Record<
    ResourceBlockType,
    {
      icon: ComponentType<{ className?: string }>;
      label: string;
    }
  > = {
    text: {
      icon: FileText,
      label: "Text",
    },
    image: {
      icon: Image,
      label: "Image",
    },
    audio: {
      icon: Mic,
      label: "Audio",
    },
    video: {
      icon: Video,
      label: "Video",
    },
    youtube_video: {
      icon: Youtube,
      label: "YouTube",
    },
    document: {
      icon: File,
      label: "File",
    },
    input_webpage: {
      icon: Globe,
      label: "Webpage",
    },
    input_notes: {
      icon: StickyNote,
      label: "Note",
    },
    input_task: {
      icon: CheckSquare,
      label: "Task",
    },
    input_table: {
      icon: Table2,
      label: "Table",
    },
    input_list: {
      icon: FolderKanban,
      label: "List",
    },
    input_data: {
      icon: FileText,
      label: "Data",
    },
    input_agent: {
      icon: Webhook,
      label: "Agent",
    },
    input_project: {
      icon: Folder,
      label: "Project",
    },
    input_agent_app: {
      icon: LayoutGrid,
      label: "App",
    },
    input_transcript: {
      icon: Captions,
      label: "Transcript",
    },
    input_transcript_session: {
      icon: AudioLines,
      label: "Session",
    },
    input_workbook: {
      icon: Notebook,
      label: "Workbook",
    },
    input_document: {
      icon: FileText,
      label: "Document",
    },
    editor_error: {
      icon: AlertCircle,
      label: "Error",
    },
    editor_code_snippet: {
      icon: Code2,
      label: "Code",
    },
  };
  return map[blockType] ?? map.text;
}

function basename(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i === -1 ? path : path.slice(i + 1);
}

function getResourceLabel(resource: ManagedResource): string {
  // preview is set by SmartAgentResourcePickerButton as the display label string
  if (typeof resource.preview === "string" && resource.preview) {
    return resource.preview;
  }
  // Editor pills carry a structured `source` we can format directly —
  // keeps the chip identifiable even though `preview` is never set on add.
  if (resource.blockType === "editor_error") {
    const src = resource.source as { file?: string; line?: number } | null;
    if (src?.file) {
      return `${basename(src.file)}${src.line ? `:${src.line}` : ""}`;
    }
  }
  if (resource.blockType === "editor_code_snippet") {
    const src = resource.source as {
      file?: string;
      startLine?: number;
      endLine?: number;
    } | null;
    if (src?.file) {
      const range =
        src.startLine !== undefined && src.endLine !== undefined
          ? src.startLine === src.endLine
            ? `:${src.startLine}`
            : `:${src.startLine}-${src.endLine}`
          : "";
      return `${basename(src.file)}${range}`;
    }
  }
  // Fallback: derive from source
  const src = resource.source as Record<string, unknown> | null;
  if (src) {
    const candidate =
      (src.label as string) ??
      (src.title as string) ??
      (src.name as string) ??
      (src.filename as string) ??
      (src.url as string);
    if (candidate) return String(candidate).slice(0, 30);
  }
  return getBlockTypeDisplay(resource.blockType).label;
}

interface ResourceChipProps {
  resource: ManagedResource;
  onRemove: () => void;
  onToggleEditable: () => void;
}

function ResourceChip({
  resource,
  onRemove,
  onToggleEditable,
}: ResourceChipProps) {
  const isPending =
    resource.status === "pending" || resource.status === "resolving";
  const isError = resource.status === "error";

  // Every attachment — files, media, notes, tasks, everything — renders as the
  // SAME ResourceAttachmentTile so the row is uniform regardless of content.
  const display = getBlockTypeDisplay(resource.blockType);
  const label = getResourceLabel(resource);

  // Editable toggle only for reference resources the agent can write back, and
  // only once the resource is settled (no point toggling a pending/errored one).
  const editableState: ResourceEditableState =
    isEditableCapableBlockType(resource.blockType) && !isPending && !isError
      ? resource.options.editable
        ? "editable"
        : "readonly"
      : null;

  const tile = (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
    >
      <ResourceAttachmentTile
        typeLabel={display.label}
        title={label}
        icon={display.icon}
        themeKey={resource.blockType}
        onRemove={onRemove}
        editableState={editableState}
        onToggleEditable={onToggleEditable}
        pending={isPending}
        error={isError}
      />
    </motion.div>
  );

  // Don't show hover previews while the resource is still resolving/erroring —
  // the source data may not be in its final shape yet.
  if (isPending || isError) return tile;

  return wrapWithPreview(resource, tile);
}

/**
 * Picks the appropriate hover preview wrapper for a fully-resolved resource.
 * For unsupported block types the chip is returned as-is.
 */
function wrapWithPreview(
  resource: ManagedResource,
  chip: React.ReactNode,
): React.ReactNode {
  const src = resource.source as Record<string, unknown> | null;

  switch (resource.blockType) {
    case "input_notes": {
      const ids = src?.note_ids;
      const id =
        Array.isArray(ids) && typeof ids[0] === "string" ? ids[0] : null;
      if (!id) return chip;
      return (
        <NoteHoverPreview noteId={id} side="top" align="start">
          {chip}
        </NoteHoverPreview>
      );
    }
    case "input_task": {
      const ids = src?.task_ids;
      const id =
        Array.isArray(ids) && typeof ids[0] === "string" ? ids[0] : null;
      if (!id) return chip;
      return (
        <TaskHoverPreview taskId={id} side="top" align="start">
          {chip}
        </TaskHoverPreview>
      );
    }
    case "input_webpage": {
      const urls = src?.urls;
      const url =
        Array.isArray(urls) && typeof urls[0] === "string"
          ? urls[0]
          : typeof src?.url === "string"
            ? (src.url as string)
            : null;
      if (!url) return chip;
      const preview =
        typeof resource.preview === "string" ? resource.preview : null;
      return (
        <WebpageHoverPreview
          url={url}
          snippet={preview}
          side="top"
          align="start"
        >
          {chip}
        </WebpageHoverPreview>
      );
    }
    case "input_data": {
      const refs = src?.refs;
      const ref =
        Array.isArray(refs) && refs.length > 0 ? (refs[0] as DataRef) : null;
      if (!ref) return chip;
      return (
        <DataRefHoverPreview dataRef={ref} side="top" align="start">
          {chip}
        </DataRefHoverPreview>
      );
    }
    default:
      return chip;
  }
}

interface SmartAgentResourceChipsProps {
  conversationId: string;
}

export function SmartAgentResourceChips({
  conversationId,
}: SmartAgentResourceChipsProps) {
  const dispatch = useAppDispatch();
  const resources = useAppSelector(selectInstanceResources(conversationId));
  const showAttachments = useAppSelector(selectShowAttachments(conversationId));

  const handleRemove = useCallback(
    (resourceId: string) => {
      dispatch(removeResource({ conversationId, resourceId }));
    },
    [conversationId, dispatch],
  );

  const handleToggleEditable = useCallback(
    (resourceId: string, current: boolean) => {
      dispatch(
        updateResourceOptions({
          conversationId,
          resourceId,
          options: { editable: !current },
        }),
      );
    },
    [conversationId, dispatch],
  );

  if (!showAttachments) return null;
  if (resources.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-2 pt-1.5 pb-0.5 shrink-0">
      <AnimatePresence mode="popLayout">
        {resources.map((resource) => (
          <ResourceChip
            key={resource.resourceId}
            resource={resource}
            onRemove={() => handleRemove(resource.resourceId)}
            onToggleEditable={() =>
              handleToggleEditable(
                resource.resourceId,
                resource.options.editable,
              )
            }
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
