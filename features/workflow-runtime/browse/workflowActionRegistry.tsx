// features/workflow-runtime/browse/workflowActionRegistry.tsx
//
// THE list of every record-level action a workflow supports, in ONE place.
//
// One builder, consumed identically by the table row's kebab, the card kebab,
// the dense-row kebab and the row right-click menu — so the drift that hit
// agents (three hard-coded action lists for one entity, each missing different
// entries) cannot happen here.
//
// Pure menu wiring: every mutating entry delegates to a handler the caller owns
// (optimistic update + revert live there).

import {
  Archive,
  ArchiveRestore,
  ClipboardCopy,
  Copy,
  ExternalLink,
  History,
  LayoutTemplate,
  Link2,
  Pencil,
  Play,
  Share2,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type { WorkflowBrowseRow } from "./types";

/**
 * Everything the menu needs that the row itself can't answer. Handlers are
 * supplied by the surface so the registry stays presentation-free.
 */
export interface WorkflowMenuContext {
  workflow: WorkflowBrowseRow;

  onRun: () => void;
  onDesign: () => void;
  onDuplicate: () => void;
  onShare: () => void;
  onToggleFavorite: () => void;
  onToggleArchived: () => void;
  onCopyLink: () => void;
  onCopyForAgent: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function workflowRunHref(id: string): string {
  return `/workflows/${id}`;
}
export function workflowDesignHref(id: string): string {
  return `/workflows/${id}/design`;
}

export function buildWorkflowMenu(ctx: WorkflowMenuContext): ItemMenuConfig {
  const { workflow } = ctx;
  // Shared workflows are read-only for everything that mutates the record. The
  // entries stay VISIBLE with a reason rather than vanishing — a menu whose
  // shape changes per row teaches the user nothing.
  const readOnly = !workflow.is_owner;
  const readOnlyReason = "You don't own this workflow";

  return {
    sections: [
      {
        id: "open",
        items: [
          // Arman's two required doors, first and second.
          { id: "run", label: "Run it", icon: Play, onSelect: ctx.onRun },
          {
            id: "design",
            label: "Design the run page",
            icon: LayoutTemplate,
            onSelect: ctx.onDesign,
          },
          // THE DOOR LAW: the last run is a record with a permalink, and the
          // list already knows its id. Only offered when there IS one.
          ...(workflow.last_run_id
            ? [
                {
                  kind: "link" as const,
                  id: "last-run",
                  label: "Open the last run",
                  icon: History,
                  href: `/workflows/runs/${workflow.last_run_id}`,
                },
              ]
            : []),
          {
            kind: "link",
            id: "open-new-tab",
            label: "Open in new tab",
            icon: ExternalLink,
            href: workflowRunHref(workflow.id),
            target: "_blank",
          },
        ],
      },
      {
        id: "manage",
        label: "Manage",
        items: [
          {
            id: "rename",
            label: "Rename",
            icon: Pencil,
            intent: "rename",
            onSelect: ctx.onRename,
            disabled: readOnly,
            disabledReason: readOnlyReason,
          },
          {
            id: "favorite",
            label: workflow.is_favorite
              ? "Remove from favorites"
              : "Add to favorites",
            icon: workflow.is_favorite ? StarOff : Star,
            iconClassName: workflow.is_favorite ? undefined : "text-amber-500",
            onSelect: ctx.onToggleFavorite,
            disabled: readOnly,
            disabledReason: readOnlyReason,
          },
          {
            id: "archive",
            label: workflow.is_archived ? "Unarchive" : "Archive",
            icon: workflow.is_archived ? ArchiveRestore : Archive,
            onSelect: ctx.onToggleArchived,
            disabled: readOnly,
            disabledReason: readOnlyReason,
          },
          {
            id: "duplicate",
            label: "Duplicate",
            icon: Copy,
            onSelect: ctx.onDuplicate,
          },
        ],
      },
      {
        id: "connect",
        label: "Connect",
        items: [
          {
            id: "share",
            label: "Share",
            icon: Share2,
            onSelect: ctx.onShare,
            disabled: readOnly,
            disabledReason: readOnlyReason,
          },
          // THE DOOR LAW, corollary 1: the RPC does not return the lineage
          // column, but the definition table models one; when a copy's source
          // reaches this row type it belongs here as a link, not as text.
        ],
      },
      {
        id: "copy",
        label: "Copy",
        items: [
          {
            id: "copy-link",
            label: "Copy link",
            icon: Link2,
            onSelect: ctx.onCopyLink,
          },
          {
            id: "copy-for-agent",
            label: "Copy for AI",
            icon: ClipboardCopy,
            onSelect: ctx.onCopyForAgent,
          },
        ],
      },
      {
        id: "danger",
        items: [
          {
            id: "delete",
            label: "Delete",
            icon: Trash2,
            tone: "destructive",
            onSelect: ctx.onDelete,
            disabled: readOnly,
            disabledReason: readOnlyReason,
          },
        ],
      },
    ],
  };
}
