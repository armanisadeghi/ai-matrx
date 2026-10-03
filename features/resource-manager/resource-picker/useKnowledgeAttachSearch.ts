"use client";

/**
 * "Search your knowledge" for an attach menu: hands off to the ⌘K bar — one
 * search over everything, with "Attach here" as the primary action — instead
 * of a picker list. The picker's non-search views (upload, URL entry, voice,
 * run toggles) ride along as commands beside the results (Raycast's shape).
 * Every attach menu opens search through this one hook.
 */

import type { LucideIcon } from "lucide-react";
import type { Resource } from "@ai-matrx/chat/agents/resources/types";
import { useOpenKnowledgeCommandBar } from "@/features/overlays/openers/knowledgeCommandBar";
import { useOpenResourcePickerWindow } from "@/features/overlays/openers/resourcePickerWindow";
import { useKnowledgeAttachTarget } from "@/features/knowledge/command-bar/useKnowledgeAttachTarget";
import type { KnowledgeCommand } from "@/features/knowledge/command-bar/commands";
import {
  flattenResourcePickerItems,
  getVisibleResourcePickerCategories,
  type ResourcePickerAttachmentCapabilities,
  type ResourcePickerViewId,
} from "./resource-picker-menu-items";

type ViewId = Exclude<ResourcePickerViewId, null>;

/** The ⌘K hit kinds this menu can attach, and the view each belongs to. */
const KNOWLEDGE_ATTACH_VIEW_FOR_ENTITY: Record<string, ViewId> = {
  note: "notes",
  conversation: "conversations",
  file: "files",
  processed_document: "files",
};

/** Views that are not a search: they stay their own commands in the bar. */
const COMMAND_VIEW_IDS: ReadonlySet<ViewId> = new Set([
  "files",
  "webpage",
  "youtube",
  "image_url",
  "file_url",
  "audio",
  "google",
  "tables",
  "context_values",
  "tools",
  "connections",
  "skills",
]);

export interface KnowledgeAttachSearchOptions {
  conversationId?: string;
  onResourceSelected: (resource: Resource) => boolean | void | Promise<boolean | void>;
  onResourceDeselected?: (resource: Resource) => boolean | void | Promise<boolean | void>;
  attachmentCapabilities?: ResourcePickerAttachmentCapabilities;
  allowedViewIds?: readonly ViewId[];
  selectionMode?: "single" | "multiple";
  /** Re-open the host's own picker at a view; without it, a picker window opens. */
  onReopenAt?: (view: ViewId) => void;
}

/** Returns `open()`; call it after closing the host menu. */
export function useKnowledgeAttachSearch({
  conversationId,
  onResourceSelected,
  onResourceDeselected,
  attachmentCapabilities,
  allowedViewIds,
  selectionMode = "multiple",
  onReopenAt,
}: KnowledgeAttachSearchOptions) {
  const openKnowledgeBar = useOpenKnowledgeCommandBar();
  const openPickerWindow = useOpenResourcePickerWindow();
  const visibleViewIds = new Set(
    getVisibleResourcePickerCategories(attachmentCapabilities, {
      conversationId,
      allowedViewIds,
    }).flatMap((c) => c.items.map((i) => i.id)),
  );
  const knowledgeAttach = useKnowledgeAttachTarget({
    conversationId,
    onResourceSelected,
    label: "Attach here",
    accepts: (hit) => {
      const view = KNOWLEDGE_ATTACH_VIEW_FOR_ENTITY[hit.entity];
      return Boolean(view && visibleViewIds.has(view));
    },
  });

  return () => {
    const reopenAt = (view: ViewId) =>
      onReopenAt
        ? onReopenAt(view)
        : openPickerWindow({
            initialView: view,
            onResourceSelected,
            onResourceDeselected,
            conversationId,
            attachmentCapabilities,
            allowedViewIds,
            selectionMode,
          });
    const commands: KnowledgeCommand[] = flattenResourcePickerItems()
      .filter((item) => COMMAND_VIEW_IDS.has(item.id) && visibleViewIds.has(item.id))
      .map((item) => ({
        id: `picker:${item.id}`,
        label: item.id === "files" ? "Upload or browse files" : item.label,
        group: "Attach",
        icon: item.icon as LucideIcon,
        keywords: ["attach", "add", item.id],
        run: () => reopenAt(item.id),
      }));
    openKnowledgeBar({
      primaryAction: "attach",
      ...(knowledgeAttach ? { attach: knowledgeAttach } : {}),
      commands,
    });
  };
}
