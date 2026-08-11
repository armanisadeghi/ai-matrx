"use client";

/**
 * SmartAgentResourceChips
 *
 * Renders attachment chips for all resources on an execution instance — every
 * attachment is a compact ResourceAttachmentTile (variant="compact": icon +
 * one word + floating X + tooltip) so the composer never gets crowded.
 * Reads from instanceResources, dispatches removeResource directly.
 */

import { useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Image as ImageIcon,
  AlertCircle,
  Layers,
  Loader2,
  X,
} from "lucide-react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectInstanceResources } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import { selectSubmissionPhase } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import {
  removeResource,
  updateResourceOptions,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { isEditableCapableBlockType } from "@/features/agents/redux/execution-system/instance-resources/editable-resource-types";
import { selectShowAttachments } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import type {
  ManagedResource,
} from "@/features/agents/types/instance.types";
import type { ResourceEditableState } from "@/features/agents/components/messages-display/user/ResourceAttachmentTile";
import { BlockHoverPreview } from "@/features/agents/components/previews/BlockHoverPreview";
import { ResourceAttachmentTile } from "@/features/agents/components/messages-display/user/ResourceAttachmentTile";
import { ContextItemDrawer } from "@/features/agents/components/context-items/ContextItemDrawer";
import { useContextItemDrawer } from "@/features/agents/components/context-items/useContextItemDrawer";
import { normalizeResource } from "@/features/agents/components/context-items/normalize";
import type { ContextDrawerItem } from "@/features/agents/components/context-items/types";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { parseReferenceFence } from "@/features/matrx-envelope/referenceFence";
import { revokeTrackedObjectUrl } from "@/lib/media/object-url-registry";

import { resolveContextItemDef } from "@/features/agents/components/context-items/registry";

function getBlockTypeDisplay(blockType: ManagedResource["blockType"]) {
  const def = resolveContextItemDef(blockType);
  return { icon: def.icon, label: def.typeLabel };
}

function isContextValueResource(resource: ManagedResource): boolean {
  if (resource.blockType !== "text" || typeof resource.source !== "string") {
    return false;
  }
  return (
    parseReferenceFence(resource.source)?.envelope.type === "context_value"
  );
}

function basename(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i === -1 ? path : path.slice(i + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getResourceLabel(resource: ManagedResource): string {
  // preview is set by SmartAgentResourcePickerButton as the display label string
  if (typeof resource.preview === "string" && resource.preview) {
    return resource.preview;
  }
  // Editor pills carry a structured `source` we can format directly —
  // keeps the chip identifiable even though `preview` is never set on add.
  if (resource.blockType === "editor_error") {
    const src = isRecord(resource.source) ? resource.source : null;
    if (typeof src?.file === "string") {
      const line = typeof src.line === "number" ? src.line : null;
      return `${basename(src.file)}${line ? `:${line}` : ""}`;
    }
  }
  if (resource.blockType === "editor_code_snippet") {
    const src = isRecord(resource.source) ? resource.source : null;
    if (typeof src?.file === "string") {
      const startLine = typeof src.startLine === "number" ? src.startLine : null;
      const endLine = typeof src.endLine === "number" ? src.endLine : null;
      const range =
        startLine !== null && endLine !== null
          ? startLine === endLine
            ? `:${startLine}`
            : `:${startLine}-${endLine}`
          : "";
      return `${basename(src.file)}${range}`;
    }
  }
  // Fallback: derive from source
  const src = isRecord(resource.source) ? resource.source : null;
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
  onOpen: () => void;
}

function getImageRef(source: unknown): string | null {
  if (typeof source === "string" && source) return source;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }

  const data = source as Record<string, unknown>;
  const fileId =
    typeof data.file_id === "string"
      ? data.file_id
      : typeof data.fileId === "string"
        ? data.fileId
        : null;
  if (fileId) return fileId;

  const url =
    typeof data.url === "string"
      ? data.url
      : typeof data.cdn_url === "string"
        ? data.cdn_url
        : typeof data.cdnUrl === "string"
          ? data.cdnUrl
          : null;
  return url || null;
}

function ImageResourceThumbnail({
  resource,
  title,
  onOpen,
  onRemove,
}: {
  resource: ManagedResource;
  title: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const isPending =
    resource.status === "pending" || resource.status === "resolving";
  const isError = resource.status === "error";
  const imageRef = isPending
    ? getImageRef(resource.source)
    : (getImageRef(resource.finalPayload) ?? getImageRef(resource.source));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View image: ${title}`}
        className="flex h-full w-full items-center justify-center"
      >
        {imageRef ? (
          <>
            <InlineMediaRef
              ref={imageRef}
              size="fill"
              fit="cover"
              rounded="none"
              fallback="skeleton"
              errorFallback="icon"
              alt={title}
              className="transition-[filter] group-hover:brightness-90"
            />
            {isPending ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Loader2 className="h-5 w-5 animate-spin text-white drop-shadow" />
              </div>
            ) : isError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-destructive/30">
                <AlertCircle className="h-5 w-5 text-white drop-shadow" />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                <ImageIcon className="h-4 w-4 text-white drop-shadow" />
              </div>
            )}
          </>
        ) : isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : isError ? (
          <AlertCircle className="h-4 w-4 text-destructive" />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${title}`}
        className="absolute right-0 top-0 z-10 rounded-bl-md bg-black/60 p-0.5 text-white opacity-0 transition-opacity hover:bg-destructive focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

function ResourceChip({
  resource,
  onRemove,
  onToggleEditable,
  onOpen,
}: ResourceChipProps) {
  const isPending =
    resource.status === "pending" || resource.status === "resolving";
  const isError = resource.status === "error";

  // Every attachment — files, media, notes, tasks, everything — renders as the
  // SAME ResourceAttachmentTile so the row is uniform regardless of content.
  const display = isContextValueResource(resource)
    ? { icon: Layers, label: "Context value" }
    : getBlockTypeDisplay(resource.blockType);
  const label = getResourceLabel(resource);

  if (resource.blockType === "image") {
    return (
      <ImageResourceThumbnail
        resource={resource}
        title={label}
        onOpen={onOpen}
        onRemove={onRemove}
      />
    );
  }

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
      className="inline-flex items-center gap-1"
    >
      <ResourceAttachmentTile
        typeLabel={display.label}
        title={label}
        icon={display.icon}
        themeKey={resource.blockType}
        onClick={onOpen}
        onRemove={onRemove}
        editableState={editableState}
        onToggleEditable={onToggleEditable}
        pending={isPending}
        error={isError}
        variant="compact"
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
  const item = normalizeResource(resource, "composer-preview")[0];
  if (!item) return chip;
  return (
    <BlockHoverPreview item={item} side="top" align="start">
      {chip}
    </BlockHoverPreview>
  );
}

interface SmartAgentResourceChipsProps {
  conversationId: string;
}

export function SmartAgentResourceChips({
  conversationId,
}: SmartAgentResourceChipsProps) {
  const dispatch = useAppDispatch();
  const resources = useAppSelector(selectInstanceResources(conversationId));
  const submissionPhase = useAppSelector(selectSubmissionPhase(conversationId));
  const showAttachments = useAppSelector(selectShowAttachments(conversationId));
  const drawer = useContextItemDrawer();

  // Only real attachments/resources render here now. Working document, the
  // scratchpad, and active scope context are no longer intrusive composer chips
  // — their on/off state shows as a single dot on the ContextDocsMenu icon.
  const drawerItems: ContextDrawerItem[] = resources.flatMap((r) =>
    normalizeResource(r, conversationId),
  );

  const openDrawerForResource = useCallback(
    (resourceId: string) => {
      const idx = drawerItems.findIndex((it) => it.resourceId === resourceId);
      drawer.openAt(drawerItems, idx < 0 ? 0 : idx);
    },
    [drawerItems, drawer],
  );

  const handleRemove = useCallback(
    (resourceId: string) => {
      const resource = resources.find(
        (candidate) => candidate.resourceId === resourceId,
      );
      revokeTrackedObjectUrl(getImageRef(resource?.source));
      dispatch(removeResource({ conversationId, resourceId }));
    },
    [conversationId, dispatch, resources],
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
  // Mirror the textarea: while a submit is in flight the attachments have
  // already been captured into the optimistic user bubble — hide them here so
  // they appear to move up with the message instead of lingering in the box
  // until stream completion clears `instanceResources`.
  if (submissionPhase === "pending") return null;
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
            onOpen={() => openDrawerForResource(resource.resourceId)}
          />
        ))}
      </AnimatePresence>
      <ContextItemDrawer controller={drawer} />
    </div>
  );
}
