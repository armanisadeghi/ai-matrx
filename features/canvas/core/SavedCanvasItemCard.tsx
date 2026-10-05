"use client";

/**
 * One saved canvas item, laid out against ITS OWN width (a container query on
 * the card), never the viewport: the Saved items tab lives in a canvas pane
 * whose width has nothing to do with the window's.
 *
 *   content ≥ 14rem  title and type badge share a row (both truncate)
 *   content < 14rem  the badge drops to its own line under the title
 *   content ≥ 13.5rem  "Open" carries its label; below it is icon-only
 *   content ≥ 11rem  favorite / share / archive / delete sit inline
 *   content < 11rem  they move into the "…" menu
 */

import React from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  Eye,
  Globe,
  MoreHorizontal,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getCanvasTypeLabel } from "@/features/canvas/canvasContent";
import type { CanvasItemSummary } from "@/features/canvas/services/canvasItemsService";

/** Container-query classes — exported so the layout contract is testable. */
export const SAVED_CARD_LAYOUT = {
  card: "@container/saved-card",
  header: "flex flex-col items-stretch gap-1.5 @[14rem]/saved-card:flex-row @[14rem]/saved-card:items-start @[14rem]/saved-card:gap-2",
  openLabel: "hidden @[13.5rem]/saved-card:inline",
  inlineActions: "hidden items-center gap-1.5 @[11rem]/saved-card:flex",
  overflowMenu: "@[11rem]/saved-card:hidden",
} as const;

const TYPE_BADGE_COLORS: Record<string, string> = {
  quiz: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  iframe: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
  html: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
  slideshow: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  presentation: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  recipe: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
  diagram: "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300",
  flashcards: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
};

export function typeBadgeColor(type: string): string {
  return TYPE_BADGE_COLORS[type] ?? "bg-muted text-muted-foreground";
}

export interface SavedCanvasItemCardProps {
  item: CanvasItemSummary;
  isEditing: boolean;
  editingTitle: string;
  onEditingTitleChange: (title: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onShare: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}

export function SavedCanvasItemCard({
  item,
  isEditing,
  editingTitle,
  onEditingTitleChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onOpen,
  onToggleFavorite,
  onShare,
  onToggleArchive,
  onDelete,
}: SavedCanvasItemCardProps) {
  const typeLabel = getCanvasTypeLabel(item.type);
  const title = item.title || "Untitled";
  const favoriteLabel = item.is_favorited ? "Unfavorite" : "Favorite";
  const archiveLabel = item.is_archived ? "Unarchive" : "Archive";
  const ArchiveIcon = item.is_archived ? ArchiveRestore : Archive;

  return (
    <div
      data-saved-canvas-card={item.id}
      className={cn(
        SAVED_CARD_LAYOUT.card,
        "group relative min-w-0 rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md",
      )}
    >
      <div className={cn(SAVED_CARD_LAYOUT.header, "mb-3")}>
        {isEditing ? (
          <div className="flex w-full min-w-0 items-center gap-2">
            <Input
              value={editingTitle}
              onChange={(e) => onEditingTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
              autoFocus
              aria-label="Item title"
              className="h-8 min-w-0 text-sm"
            />
            <Button variant="primary" onClick={onSaveEdit} className="shrink-0">
              Save
            </Button>
          </div>
        ) : (
          <h3
            title={title}
            className="line-clamp-2 min-w-0 cursor-pointer break-words font-medium text-foreground [overflow-wrap:anywhere] hover:text-primary @[14rem]/saved-card:flex-1"
            onClick={onStartEdit}
          >
            {title}
          </h3>
        )}
        <Badge
          title={typeLabel}
          className={cn(
            "min-w-0 max-w-full shrink-0 self-start overflow-hidden @[14rem]/saved-card:max-w-[45%]",
            typeBadgeColor(item.type),
          )}
        >
          <span className="truncate">{typeLabel}</span>
        </Badge>
      </div>

      <div className="mb-4 space-y-1 text-xs text-muted-foreground">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            Created {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
          </span>
          {item.published_to_web ? (
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3" aria-hidden />
              Shared
            </span>
          ) : null}
        </p>
        {item.description ? <p className="line-clamp-2 break-words">{item.description}</p> : null}
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <Button
          icon={<Eye aria-hidden />}
          variant="outline"
          onClick={onOpen}
          aria-label={`Open ${title}`}
          className="min-w-0 flex-1"
        >
          <span className={cn(SAVED_CARD_LAYOUT.openLabel, "ml-1.5")}>Open</span>
        </Button>

        <div className={SAVED_CARD_LAYOUT.inlineActions} data-saved-card-inline-actions="">
          <Button
            variant="quiet"
            onClick={onToggleFavorite}
            aria-label={favoriteLabel}
            title={favoriteLabel}
            className="w-7"
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                item.is_favorited ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
              )}
            />
          </Button>
          <Button
            variant="quiet"
            onClick={onShare}
            aria-label="Share"
            title="Share"
            className="w-7"
          >
            <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button
            variant="quiet"
            onClick={onToggleArchive}
            aria-label={archiveLabel}
            title={archiveLabel}
            className="w-7"
          >
            <ArchiveIcon
              className={cn(
                "h-3.5 w-3.5",
                item.is_archived ? "text-orange-500 dark:text-orange-400" : "text-muted-foreground",
              )}
            />
          </Button>
          <Button
            variant="quiet"
            onClick={onDelete}
            aria-label="Delete"
            title="Delete"
            className="w-7"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className={SAVED_CARD_LAYOUT.overflowMenu} data-saved-card-overflow="">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="quiet"
                aria-label="More actions"
                title="More actions"
                className="w-7"
              >
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onToggleFavorite}>
                <Star className="mr-2 h-3.5 w-3.5" />
                {favoriteLabel}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onShare}>
                <Share2 className="mr-2 h-3.5 w-3.5" />
                Share
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onToggleArchive}>
                <ArchiveIcon className="mr-2 h-3.5 w-3.5" />
                {archiveLabel}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
