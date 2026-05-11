"use client";

/**
 * SmartAgentResourceChips
 *
 * Renders chips for all attached resources on an execution instance.
 * Reads from instanceResources, dispatches removeResource directly.
 * No prop callbacks needed — conversationId is the only prop.
 */

import { useCallback, createElement } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
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
  Loader2,
  AlertCircle,
  Code2,
} from "lucide-react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectInstanceResources } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import { removeResource } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { selectShowAttachments } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import type {
  ManagedResource,
  ResourceBlockType,
} from "@/features/agents/types/instance.types";
import { NoteHoverPreview } from "@/features/agents/components/previews/NoteHoverPreview";
import { TaskHoverPreview } from "@/features/agents/components/previews/TaskHoverPreview";
import { WebpageHoverPreview } from "@/features/agents/components/previews/WebpageHoverPreview";
import { DataRefHoverPreview } from "@/features/agents/components/previews/DataRefHoverPreview";
import { FileResourceChip } from "@/features/files/components/preview/FileResourceChip";
import type { DataRef } from "@/features/agents/types/message-types";

function getBlockTypeDisplay(blockType: ResourceBlockType) {
  const map: Record<
    ResourceBlockType,
    {
      icon: React.ElementType;
      color: string;
      bg: string;
      label: string;
    }
  > = {
    text: {
      icon: FileText,
      color: "text-gray-600 dark:text-gray-400",
      bg: "bg-gray-100 dark:bg-gray-800",
      label: "Text",
    },
    image: {
      icon: Image,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-100 dark:bg-blue-950/30",
      label: "Image",
    },
    audio: {
      icon: Mic,
      color: "text-pink-600 dark:text-pink-400",
      bg: "bg-pink-100 dark:bg-pink-950/30",
      label: "Audio",
    },
    video: {
      icon: Video,
      color: "text-indigo-600 dark:text-indigo-400",
      bg: "bg-indigo-100 dark:bg-indigo-950/30",
      label: "Video",
    },
    youtube_video: {
      icon: Youtube,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-100 dark:bg-red-950/30",
      label: "YouTube",
    },
    document: {
      icon: File,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-100 dark:bg-purple-950/30",
      label: "File",
    },
    input_webpage: {
      icon: Globe,
      color: "text-teal-600 dark:text-teal-400",
      bg: "bg-teal-100 dark:bg-teal-950/30",
      label: "Webpage",
    },
    input_notes: {
      icon: StickyNote,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-100 dark:bg-orange-950/30",
      label: "Note",
    },
    input_task: {
      icon: CheckSquare,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-100 dark:bg-blue-950/30",
      label: "Task",
    },
    input_table: {
      icon: Table2,
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-100 dark:bg-green-950/30",
      label: "Table",
    },
    input_list: {
      icon: FolderKanban,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-100 dark:bg-violet-950/30",
      label: "List",
    },
    input_data: {
      icon: FileText,
      color: "text-gray-600 dark:text-gray-400",
      bg: "bg-gray-100 dark:bg-gray-800",
      label: "Data",
    },
    editor_error: {
      icon: AlertCircle,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-100 dark:bg-red-950/30",
      label: "Error",
    },
    editor_code_snippet: {
      icon: Code2,
      color: "text-cyan-600 dark:text-cyan-400",
      bg: "bg-cyan-100 dark:bg-cyan-950/30",
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
    const src = resource.source as
      | { file?: string; line?: number }
      | null;
    if (src?.file) {
      return `${basename(src.file)}${src.line ? `:${src.line}` : ""}`;
    }
  }
  if (resource.blockType === "editor_code_snippet") {
    const src = resource.source as
      | { file?: string; startLine?: number; endLine?: number }
      | null;
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

function truncate(s: string, max = 20) {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/**
 * Media blocks (image / audio / video / document) whose source carries a
 * cld_files UUID get the rich `FileResourceChip` — real thumbnail,
 * hover-peek, click-to-preview. Everything else (text / notes / tasks /
 * webpages / etc.) keeps the existing icon-only pill below.
 */
function extractFileId(resource: ManagedResource): string | null {
  const isMedia =
    resource.blockType === "image" ||
    resource.blockType === "audio" ||
    resource.blockType === "video" ||
    resource.blockType === "document";
  if (!isMedia) return null;
  const src = resource.source as Record<string, unknown> | null;
  if (!src || typeof src !== "object") return null;
  if (typeof src.file_id === "string") return src.file_id;
  // Tolerate older shapes that put the cld_files UUID under `id` or `fileId`.
  if (typeof src.fileId === "string") return src.fileId;
  if (typeof src.id === "string") return src.id;
  return null;
}

interface ResourceChipProps {
  resource: ManagedResource;
  onRemove: () => void;
}

function ResourceChip({ resource, onRemove }: ResourceChipProps) {
  const fileId = extractFileId(resource);
  const isPending =
    resource.status === "pending" || resource.status === "resolving";
  const isError = resource.status === "error";

  // Rich file chip path — preserve the same enter/exit animation
  // envelope so AnimatePresence still gets to do its thing on add/remove.
  if (fileId && !isPending && !isError) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.85 }}
      >
        <FileResourceChip fileId={fileId} onRemove={onRemove} size="sm" />
      </motion.div>
    );
  }

  const display = getBlockTypeDisplay(resource.blockType);
  const Icon = display.icon;
  const label = truncate(getResourceLabel(resource));

  const chip = (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${display.bg} ${isError ? "ring-1 ring-destructive/50" : ""}`}
    >
      {isPending ? (
        <Loader2 className={`w-3 h-3 ${display.color} animate-spin`} />
      ) : isError ? (
        <AlertCircle className="w-3 h-3 text-destructive" />
      ) : (
        createElement(Icon, { className: `w-3 h-3 ${display.color}` })
      )}
      <span className="text-foreground select-none">{label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        aria-label={`Remove ${label}`}
      >
        <X className="w-2.5 h-2.5 text-muted-foreground" />
      </button>
    </motion.div>
  );

  // Don't show hover previews while the resource is still resolving/erroring —
  // the source data may not be in its final shape yet.
  if (isPending || isError) return chip;

  return wrapWithPreview(resource, chip);
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
  const showAttachments = useAppSelector(
    selectShowAttachments(conversationId),
  );

  const handleRemove = useCallback(
    (resourceId: string) => {
      dispatch(removeResource({ conversationId, resourceId }));
    },
    [conversationId, dispatch],
  );

  if (!showAttachments) return null;
  if (resources.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-2 py-1 border-b border-border shrink-0">
      <AnimatePresence mode="popLayout">
        {resources.map((resource) => (
          <ResourceChip
            key={resource.resourceId}
            resource={resource}
            onRemove={() => handleRemove(resource.resourceId)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
