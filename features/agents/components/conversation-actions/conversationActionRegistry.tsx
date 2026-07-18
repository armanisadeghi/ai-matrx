/**
 * conversationActionRegistry — builds the `ItemMenuConfig` for conversation-row
 * menus.
 *
 * `buildConversationMenu(ctx)` returns the full menu (Rename / Pin / Open /
 * Copy link / Duplicate / Share / Archive / Exclude-KG / Delete) consumed by
 * every list surface's `<ItemRow menu={…}>` — chat sidebar, /code history,
 * agent-run sidebars, the floating windows. Rename is an `intent: "rename"`
 * entry that ItemRow turns into inline edit (each row also passes a `rename`
 * prop that dispatches `renameConversation`).
 *
 * Every mutating action dispatches a thunk from
 * `conversation-row-actions.thunks.ts` (favorite / archive / kg / duplicate)
 * or `soft-delete-conversation.thunk.ts` (delete). Each thunk owns its
 * optimistic update + revert, so this layer is pure menu wiring.
 */

import {
  Pin,
  PinOff,
  Pencil,
  ExternalLink,
  Link as LinkIcon,
  ListFilter,
  FilterX,
  Copy,
  Share2,
  Archive,
  ArchiveRestore,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ItemMenuConfig,
  ItemMenuSection,
} from "@/components/official/item/types";
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
import {
  describeSource,
  featureLabel,
  sourceKey,
} from "@/features/agents/redux/conversation-history/source-registry";

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

// ── ItemMenu config builder (Item system) ────────────────────────────────────
//
// Every `<ItemRow>` surface consumes this. Rename is an inline-edit `intent`,
// owned by the row — no controlled dialog, no menu-close choreography. The menu
// closes itself (Radix) before any overlay/confirm opens.

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
  /**
   * Provenance (`source_app` / `source_feature`) + optional filter actions.
   * When set, the menu header shows WHERE the conversation came from
   * ("Matrx Admin · PDF Extractor · Auto") and, if the callbacks are wired
   * (surfaces with a source filter), offers "Show only …" / "Hide …" so users
   * can prune a noisy unfiltered list row-by-row.
   */
  source?: {
    app?: string | null;
    feature?: string | null;
    /** Filter the current scope to ONLY this conversation's source. */
    onShowOnly?: () => void;
    /** Remove this conversation's source from the current scope's view. */
    onHide?: () => void;
  };
  dispatch: AppDispatch;
}

export function buildConversationMenu(
  ctx: ConversationMenuContext,
): ItemMenuConfig {
  const src = ctx.source;
  const srcFeatureLabel = src ? featureLabel(sourceKey(src.feature)) : "";
  const sourceSection: ItemMenuSection | null =
    src && (src.onShowOnly || src.onHide)
      ? {
          id: "source",
          label: "Source filter",
          items: [
            {
              id: "source-show-only",
              label: `Show only ${srcFeatureLabel}`,
              icon: ListFilter,
              description: "Filter this list to this source",
              hidden: !src.onShowOnly,
              onSelect: () => src.onShowOnly?.(),
            },
            {
              id: "source-hide",
              label: `Hide ${srcFeatureLabel}`,
              icon: FilterX,
              description: "Remove this source from this list",
              hidden: !src.onHide,
              onSelect: () => src.onHide?.(),
            },
          ],
        }
      : null;

  return {
    header: {
      title: displayTitle(ctx.title),
      description: src
        ? describeSource(src.app, src.feature)
        : undefined,
    },
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
      ...(sourceSection ? [sourceSection] : []),
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
                    resourceType: "conversation",
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
