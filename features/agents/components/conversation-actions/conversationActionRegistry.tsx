/**
 * conversationActionRegistry — menu item factory for conversation-row
 * context menus.
 *
 * Mirrors `messageActionRegistry`. One factory returns the full menu
 * shape; the rendering layer (`<ConversationRowMenu />`) is responsible
 * for owning state for any controlled dialogs (rename text input).
 *
 * Wired into every list surface in the app:
 *   - ConversationHistorySidebar     (/chat, /code, agent-apps)
 *   - AgentRunSidebarMenu            (runner shell-sidebar)
 *   - AgentRunsSidebar               (legacy in-page runner sidebar)
 *   - AgentChatHistorySidebar        (floating widget)
 *   - ChatHistoryWindow              (floating window)
 *   - AgentRunHistoryWindow          (per-agent run history window)
 *   - AgentRunWindow                 (agent-run-as-window)
 *   - AgentContentHistoryPanel       (builder "History" tab)
 *   - CodeEditorHistoryPanel         (code-editor history)
 *
 * Every action that mutates the row dispatches a thunk from
 * `conversation-row-actions.thunks.ts` (rename / favorite / archive /
 * duplicate) or `soft-delete-conversation.thunk.ts` (delete). Each
 * thunk does its own optimistic update + revert, so this layer is
 * pure menu wiring.
 */

import {
  Pin,
  PinOff,
  Pencil,
  ExternalLink,
  Link as LinkIcon,
  Copy,
  Share2,
  Archive,
  ArchiveRestore,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { MenuItem } from "@/components/official/AdvancedMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type { AppDispatch } from "@/lib/redux/store";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { confirm } from "@/components/dialogs/confirm/confirmDialogOpener";

import {
  setConversationFavorite,
  setConversationArchived,
  setConversationExcludeFromKg,
  duplicateConversation,
} from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import { softDeleteConversation } from "@/features/agents/redux/execution-system/message-crud/soft-delete-conversation.thunk";

// ── Context ──────────────────────────────────────────────────────────────────

export interface ConversationActionContext {
  /** `cx_conversation.id`. Required; null hides the entire menu. */
  conversationId: string;
  /** Current title — used as the default in the rename dialog and as the
   * resource name for the Share modal. */
  title: string | null;
  /** Current pin state. Drives the Pin/Unpin toggle. */
  isFavorite: boolean;
  /** Derived from `status === "archived"`. Drives the Archive/Unarchive toggle. */
  isArchived: boolean;
  /**
   * `cx_conversation.exclude_from_kg`. When `true`, the action reads
   * "Include in knowledge graph"; when `false`, "Exclude from knowledge
   * graph". Default `false` for rows from sources that don't project the
   * column (the agent-scoped RPC).
   */
  excludeFromKg: boolean;
  /**
   * Used by Share. For lists in the current user's own sidebar this is
   * always true; surfaces that show conversations the user only has
   * collaborator access to must pass `false` so the modal renders the
   * read-only variant.
   */
  isOwner: boolean;
  /**
   * Canonical href for "Open in new tab" and "Copy link". Runner surfaces
   * use `/agents/:agentId/run?c=:conversationId`; chat surfaces use
   * `/chat/:conversationId`. Pass the surface-appropriate value here so
   * the menu doesn't have to know about route conventions.
   */
  href: string;
  /**
   * Optional surface key for the agent-run focus system. When set,
   * `duplicateConversation` jumps focus to the new copy after success.
   * Sidebar surfaces typically pass their surface id; surfaces that
   * shouldn't auto-navigate (e.g. floating windows) omit it.
   */
  surfaceKey?: string;
  /**
   * Called by Rename. The menu component owns the controlled TextInputDialog
   * and triggers a thunk dispatch on confirm — this callback just opens the
   * dialog seeded with the current title.
   */
  onRequestRename: () => void;
  /** Called BEFORE awaiting any modal so the menu's z-index doesn't fight the dialog. */
  onCloseMenu: () => void;
  dispatch: AppDispatch;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveAbsoluteHref(href: string): string {
  if (typeof window === "undefined") return href;
  if (/^https?:\/\//i.test(href)) return href;
  return `${window.location.origin}${href.startsWith("/") ? href : `/${href}`}`;
}

function displayTitle(title: string | null): string {
  if (!title) return "Untitled conversation";
  return title.trim().length > 0 ? title : "Untitled conversation";
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function getConversationRowActions(
  ctx: ConversationActionContext,
): MenuItem[] {
  const items: MenuItem[] = [];

  // ── 1. Primary actions ─────────────────────────────────────────────────────

  items.push({
    key: "conv-rename",
    icon: Pencil,
    label: "Rename",
    category: "Actions",
    showToast: false,
    action: () => {
      // Closing the menu BEFORE opening the dialog avoids the same z-index
      // race that bit forking — both AdvancedMenu and Dialog use z-index 9999.
      ctx.onCloseMenu();
      ctx.onRequestRename();
    },
  });

  items.push({
    key: "conv-favorite",
    icon: ctx.isFavorite ? PinOff : Pin,
    iconColor: ctx.isFavorite
      ? "text-amber-500"
      : "text-gray-600 dark:text-gray-400",
    label: ctx.isFavorite ? "Unpin" : "Pin",
    category: "Actions",
    showToast: false,
    action: async () => {
      const result = await ctx.dispatch(
        setConversationFavorite({
          conversationId: ctx.conversationId,
          isFavorite: !ctx.isFavorite,
        }),
      );
      if (setConversationFavorite.rejected.match(result)) {
        toast.error(result.payload?.message ?? "Failed to update pin");
      }
    },
  });

  items.push({
    key: "conv-open-new-tab",
    icon: ExternalLink,
    label: "Open in new tab",
    category: "Actions",
    showToast: false,
    action: () => {
      window.open(ctx.href, "_blank", "noopener,noreferrer");
    },
  });

  items.push({
    key: "conv-copy-link",
    icon: LinkIcon,
    label: "Copy link",
    category: "Actions",
    showToast: false,
    action: async () => {
      const absolute = resolveAbsoluteHref(ctx.href);
      try {
        await navigator.clipboard.writeText(absolute);
        toast.success("Link copied");
      } catch {
        toast.error("Couldn't copy — your browser blocked clipboard access");
      }
    },
  });

  // ── 2. Manage ──────────────────────────────────────────────────────────────

  items.push({
    key: "conv-duplicate",
    icon: Copy,
    label: "Duplicate",
    description: "Make a full copy of this conversation",
    category: "Manage",
    showToast: false,
    action: async () => {
      const result = await ctx.dispatch(
        duplicateConversation({
          conversationId: ctx.conversationId,
          surfaceKey: ctx.surfaceKey,
        }),
      );
      if (duplicateConversation.rejected.match(result)) {
        toast.error(result.payload?.message ?? "Duplicate failed");
      } else {
        toast.success("Conversation duplicated");
      }
    },
  });

  items.push({
    key: "conv-share",
    icon: Share2,
    label: "Share…",
    category: "Manage",
    showToast: false,
    action: () => {
      ctx.dispatch(
        openOverlay({
          overlayId: "shareModal",
          data: {
            resourceType: "cx_conversation",
            resourceId: ctx.conversationId,
            resourceName: displayTitle(ctx.title),
            isOwner: ctx.isOwner,
          },
        }),
      );
    },
  });

  items.push({
    key: "conv-archive",
    icon: ctx.isArchived ? ArchiveRestore : Archive,
    label: ctx.isArchived ? "Unarchive" : "Archive",
    category: "Manage",
    showToast: false,
    action: async () => {
      const result = await ctx.dispatch(
        setConversationArchived({
          conversationId: ctx.conversationId,
          archived: !ctx.isArchived,
        }),
      );
      if (setConversationArchived.rejected.match(result)) {
        toast.error(
          result.payload?.message ?? "Failed to update archive status",
        );
      }
    },
  });

  // Per-conversation KG opt-out. The icon flips to whatever the NEXT
  // state is — `Eye` when currently excluded (clicking includes it),
  // `EyeOff` when currently included (clicking excludes it).
  items.push({
    key: "conv-exclude-kg",
    icon: ctx.excludeFromKg ? Eye : EyeOff,
    label: ctx.excludeFromKg
      ? "Include in knowledge graph"
      : "Exclude from knowledge graph",
    description: ctx.excludeFromKg
      ? "Resume auto-ingesting messages from this conversation."
      : "Stop auto-ingesting messages from this conversation.",
    category: "Manage",
    showToast: false,
    action: async () => {
      const next = !ctx.excludeFromKg;
      const result = await ctx.dispatch(
        setConversationExcludeFromKg({
          conversationId: ctx.conversationId,
          excludeFromKg: next,
        }),
      );
      if (setConversationExcludeFromKg.rejected.match(result)) {
        toast.error(
          result.payload?.message ?? "Failed to update knowledge-graph setting",
        );
      } else {
        toast.success(
          next
            ? "Excluded from knowledge graph"
            : "Included in knowledge graph",
        );
      }
    },
  });

  // ── 3. Destructive ─────────────────────────────────────────────────────────

  items.push({
    key: "conv-delete",
    icon: Trash2,
    iconColor: "text-red-500 dark:text-red-400",
    label: "Delete",
    category: "Danger",
    showToast: false,
    action: async () => {
      // Close the menu BEFORE awaiting the confirm dialog — see comment on
      // rename above for the z-index reasoning.
      ctx.onCloseMenu();
      const ok = await confirm({
        title: "Delete conversation",
        description: (
          <>
            Permanently delete <b>{displayTitle(ctx.title)}</b>? This soft-
            deletes the conversation and every message inside it — the rows are
            kept in the database for recovery, but the conversation will
            disappear from every sidebar.
          </>
        ),
        confirmLabel: "Delete",
        variant: "destructive",
      });
      if (!ok) return;

      const result = await ctx.dispatch(
        softDeleteConversation({ conversationId: ctx.conversationId }),
      );
      if (softDeleteConversation.rejected.match(result)) {
        toast.error(result.payload?.message ?? "Delete failed");
      } else {
        toast.success("Conversation deleted");
      }
    },
  });

  return items;
}

// ── ItemMenu config builder (Item system) ────────────────────────────────────
//
// The forward path: surfaces that render `<ItemRow>` consume this instead of
// `getConversationRowActions`. Rename is an inline-edit `intent`, owned by the
// row — no controlled dialog, no `onRequestRename`/`onCloseMenu` choreography.
// The menu closes itself (Radix) before any overlay/confirm opens.

export interface ConversationMenuContext {
  conversationId: string;
  title: string | null;
  isFavorite: boolean;
  isArchived: boolean;
  excludeFromKg: boolean;
  isOwner: boolean;
  /** Canonical href for "Open in new tab" / "Copy link" (surface-specific). */
  href: string;
  /** Agent-run focus key — when set, Duplicate jumps focus to the new copy. */
  surfaceKey?: string;
  dispatch: AppDispatch;
}

export function buildConversationMenu(
  ctx: ConversationMenuContext,
): ItemMenuConfig {
  return {
    header: { title: displayTitle(ctx.title) },
    sections: [
      {
        id: "actions",
        items: [
          {
            id: "rename",
            label: "Rename",
            icon: Pencil,
            intent: "rename",
            shortcutKey: "r",
            // ItemRow intercepts `intent: "rename"` and drives inline edit;
            // this no-op is the fallback for non-row consumers.
            onSelect: () => {},
          },
          {
            id: "favorite",
            label: ctx.isFavorite ? "Unpin" : "Pin",
            icon: ctx.isFavorite ? PinOff : Pin,
            iconClassName: ctx.isFavorite ? "text-amber-500" : undefined,
            shortcutKey: "p",
            onSelect: async () => {
              const result = await ctx.dispatch(
                setConversationFavorite({
                  conversationId: ctx.conversationId,
                  isFavorite: !ctx.isFavorite,
                }),
              );
              if (setConversationFavorite.rejected.match(result)) {
                toast.error(result.payload?.message ?? "Failed to update pin");
              }
            },
          },
          {
            id: "open-new-tab",
            kind: "link",
            label: "Open in new tab",
            icon: ExternalLink,
            href: ctx.href,
            target: "_blank",
          },
          {
            id: "copy-link",
            label: "Copy link",
            icon: LinkIcon,
            onSelect: async () => {
              const absolute = resolveAbsoluteHref(ctx.href);
              try {
                await navigator.clipboard.writeText(absolute);
                toast.success("Link copied");
              } catch {
                toast.error(
                  "Couldn't copy — your browser blocked clipboard access",
                );
              }
            },
          },
        ],
      },
      {
        id: "manage",
        label: "Manage",
        items: [
          {
            id: "duplicate",
            label: "Duplicate",
            icon: Copy,
            description: "Make a full copy of this conversation",
            shortcutKey: "d",
            onSelect: async () => {
              const result = await ctx.dispatch(
                duplicateConversation({
                  conversationId: ctx.conversationId,
                  surfaceKey: ctx.surfaceKey,
                }),
              );
              if (duplicateConversation.rejected.match(result)) {
                toast.error(result.payload?.message ?? "Duplicate failed");
              } else {
                toast.success("Conversation duplicated");
              }
            },
          },
          {
            id: "share",
            label: "Share…",
            icon: Share2,
            onSelect: () => {
              ctx.dispatch(
                openOverlay({
                  overlayId: "shareModal",
                  data: {
                    resourceType: "cx_conversation",
                    resourceId: ctx.conversationId,
                    resourceName: displayTitle(ctx.title),
                    isOwner: ctx.isOwner,
                  },
                }),
              );
            },
          },
          {
            id: "archive",
            label: ctx.isArchived ? "Unarchive" : "Archive",
            icon: ctx.isArchived ? ArchiveRestore : Archive,
            shortcutKey: "a",
            onSelect: async () => {
              const result = await ctx.dispatch(
                setConversationArchived({
                  conversationId: ctx.conversationId,
                  archived: !ctx.isArchived,
                }),
              );
              if (setConversationArchived.rejected.match(result)) {
                toast.error(
                  result.payload?.message ?? "Failed to update archive status",
                );
              }
            },
          },
          {
            id: "exclude-kg",
            label: ctx.excludeFromKg
              ? "Include in knowledge graph"
              : "Exclude from knowledge graph",
            icon: ctx.excludeFromKg ? Eye : EyeOff,
            description: ctx.excludeFromKg
              ? "Resume auto-ingesting messages from this conversation."
              : "Stop auto-ingesting messages from this conversation.",
            onSelect: async () => {
              const next = !ctx.excludeFromKg;
              const result = await ctx.dispatch(
                setConversationExcludeFromKg({
                  conversationId: ctx.conversationId,
                  excludeFromKg: next,
                }),
              );
              if (setConversationExcludeFromKg.rejected.match(result)) {
                toast.error(
                  result.payload?.message ??
                    "Failed to update knowledge-graph setting",
                );
              } else {
                toast.success(
                  next
                    ? "Excluded from knowledge graph"
                    : "Included in knowledge graph",
                );
              }
            },
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
            onSelect: async () => {
              const ok = await confirm({
                title: "Delete conversation",
                description: (
                  <>
                    Permanently delete <b>{displayTitle(ctx.title)}</b>? This
                    soft-deletes the conversation and every message inside it —
                    the rows are kept in the database for recovery, but the
                    conversation will disappear from every sidebar.
                  </>
                ),
                confirmLabel: "Delete",
                variant: "destructive",
              });
              if (!ok) return;

              const result = await ctx.dispatch(
                softDeleteConversation({ conversationId: ctx.conversationId }),
              );
              if (softDeleteConversation.rejected.match(result)) {
                toast.error(result.payload?.message ?? "Delete failed");
              } else {
                toast.success("Conversation deleted");
              }
            },
          },
        ],
      },
    ],
  };
}
