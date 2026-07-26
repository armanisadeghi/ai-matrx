// features/agents/browse/agentActionRegistry.tsx
//
// THE list of every record-level action an agent supports, in ONE place.
//
// Why a registry and not JSX per surface: /agents/all hard-codes its action row
// in AgentCard.tsx and a DIFFERENT, smaller set in AgentListItem.tsx, and a
// THIRD, smaller-still set in AgentActionModal.tsx. Three lists that drifted —
// rows lost "Add to set", cards lost the admin submenu, and the modal (the
// primary click target on both) exposed 7 of ~11 actions. One builder makes
// that class of drift impossible: table row menu, card kebab, and right-click
// all render the same config.
//
// Modelled on features/agents/components/conversation-actions/
// conversationActionRegistry.tsx — pure menu wiring; every mutating entry
// delegates to a handler the caller owns (optimistic update + revert live there).

import {
  Play,
  Pencil,
  Eye,
  Lightbulb,
  Copy,
  Share2,
  Network,
  FileText,
  AppWindow,
  LayoutPanelTop,
  Star,
  StarOff,
  Archive,
  ArchiveRestore,
  Trash2,
  Link2,
  ClipboardCopy,
  History,
  GitCompare,
  Download,
  Building2,
  Globe,
  Settings,
  ExternalLink,
} from "lucide-react";
import type { ItemMenuConfig, ItemMenuEntry } from "@/components/official/item/types";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import type { AgentBrowseRow } from "./types";

/**
 * Everything the menu needs that the row itself can't answer. Handlers are
 * supplied by the surface so the registry stays presentation-free.
 */
export interface AgentMenuContext {
  agent: AgentBrowseRow;
  /** Super-admin gate for the Admin submenu. */
  isSuperAdmin: boolean;

  onRun: () => void;
  onEdit: () => void;
  onView: () => void;
  onPeek: () => void;
  onEditDetails: () => void;
  onVersions: () => void;
  onDuplicate: () => void;
  onShare: () => void;
  onAddToSet: () => void;
  onToggleFavorite: () => void;
  onToggleArchived: () => void;
  onCopyLink: () => void;
  onCopyForAgent: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function agentHref(id: string, sub: string): string {
  return `/agents/${id}${sub}`;
}

/**
 * A registered, user-visible promise. Never a bare "coming soon" string.
 *
 * Rendered as a trailing BADGE, not a second line: a second line doubles the
 * row height and halves how many actions fit on screen, for two words of
 * qualification that belong at the end of the row.
 */
function comingSoon(
  id: string,
  label: string,
  icon: ItemMenuEntry["icon"],
): ItemMenuEntry {
  return {
    id,
    label,
    icon,
    badge: "Soon",
    onSelect: () => {
      void announceComingSoon(id);
    },
  };
}

export function buildAgentMenu(ctx: AgentMenuContext): ItemMenuConfig {
  const { agent, isSuperAdmin } = ctx;
  // Shared rows are read-only for everything that mutates the record. The
  // entries stay VISIBLE with a reason rather than vanishing — a menu whose
  // shape changes per row teaches the user nothing.
  const readOnly = !agent.is_owner;
  const readOnlyReason = "You don't own this agent";

  // No header. Chrome's app menu has no title, and neither should this: the row
  // the menu belongs to is two inches away and already says the name.
  return {
    sections: [
      {
        id: "open",
        items: [
          { id: "run", label: "Run", icon: Play, onSelect: ctx.onRun },
          {
            id: "edit",
            label: "Edit",
            icon: Pencil,
            onSelect: ctx.onEdit,
            disabled: readOnly,
            disabledReason: readOnlyReason,
          },
          { id: "view", label: "View", icon: Eye, onSelect: ctx.onView },
          { id: "peek", label: "Quick look", icon: Lightbulb, onSelect: ctx.onPeek },
          {
            kind: "link",
            id: "open-new-tab",
            label: "Open in new tab",
            icon: ExternalLink,
            href: agentHref(agent.id, "/run"),
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
            id: "details",
            label: "Edit details",
            icon: FileText,
            onSelect: ctx.onEditDetails,
            disabled: readOnly,
            disabledReason: readOnlyReason,
          },
          {
            id: "favorite",
            label: agent.is_favorite ? "Remove from favorites" : "Add to favorites",
            icon: agent.is_favorite ? StarOff : Star,
            iconClassName: agent.is_favorite ? undefined : "text-amber-500",
            onSelect: ctx.onToggleFavorite,
            disabled: readOnly,
            disabledReason: readOnlyReason,
          },
          {
            id: "archive",
            label: agent.is_archived ? "Unarchive" : "Archive",
            icon: agent.is_archived ? ArchiveRestore : Archive,
            onSelect: ctx.onToggleArchived,
            disabled: readOnly,
            disabledReason: readOnlyReason,
          },
          { id: "duplicate", label: "Duplicate", icon: Copy, onSelect: ctx.onDuplicate },
          {
            id: "versions",
            label: "Version history",
            icon: History,
            onSelect: ctx.onVersions,
          },
          comingSoon("agents.compare-versions", "Compare versions", GitCompare),
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
          { id: "add-to-set", label: "Add to set", icon: Network, onSelect: ctx.onAddToSet },
          {
            kind: "link",
            id: "shortcuts",
            label: "Shortcuts",
            icon: LayoutPanelTop,
            href: agentHref(agent.id, "/shortcuts"),
          },
          {
            kind: "link",
            id: "surfaces",
            label: "Surfaces",
            icon: AppWindow,
            href: agentHref(agent.id, "/surfaces"),
          },
          comingSoon("agents.create-app", "Create app from agent", AppWindow),
          comingSoon("agents.save-as-template", "Save as template", LayoutPanelTop),
        ],
      },
      {
        id: "copy",
        label: "Copy",
        items: [
          { id: "copy-link", label: "Copy link", icon: Link2, onSelect: ctx.onCopyLink },
          {
            id: "copy-for-agent",
            label: "Copy for AI",
            icon: ClipboardCopy,
            onSelect: ctx.onCopyForAgent,
          },
          comingSoon("agents.export", "Export agent", Download),
        ],
      },
      ...(isSuperAdmin
        ? [
            {
              id: "admin",
              items: [
                {
                  kind: "submenu" as const,
                  id: "admin-submenu",
                  label: "Admin actions",
                  icon: Settings,
                  sections: [
                    {
                      id: "admin-items",
                      items: [
                        comingSoon(
                          "agents.make-global-builtin",
                          "Make global built-in",
                          Globe,
                        ),
                        comingSoon(
                          "agents.move-to-org",
                          "Move to organization",
                          Building2,
                        ),
                      ],
                    },
                  ],
                },
              ],
            },
          ]
        : []),
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
