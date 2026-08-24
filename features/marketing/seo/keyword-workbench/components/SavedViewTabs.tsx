"use client";

/**
 * SAVED VIEWS AS TABS (P26 — "we also need to allow the user to be able to
 * save that view").
 *
 * A view IS the URL state, so a tab is a link and sharing one is copying the
 * address bar. The tab strip is deliberately the only chrome above the table
 * besides one line of context — Arman on the surface this replaces: "half of
 * the page now is just taken up by a bunch of garbage at the top."
 *
 * A modified view says so on its own tab and offers to keep the change; it
 * never silently overwrites what the person saved, and never silently
 * discards what they just built.
 */

import { useState } from "react";
import {
  Check,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/styles/themes/utils";
import type { SavedView } from "@/features/marketing/seo/keyword-table/savedViews";

export function SavedViewTabs({
  views,
  loading,
  activeId,
  dirty,
  busy,
  onOpen,
  onSaveNew,
  onUpdate,
  onRename,
  onDelete,
  onToggleShared,
  onMove,
}: {
  views: SavedView[];
  loading?: boolean;
  activeId: string | null;
  /** The live arrangement differs from what the active view stored. */
  dirty: boolean;
  busy?: boolean;
  onOpen: (view: SavedView | null) => void;
  onSaveNew: () => void;
  onUpdate: (view: SavedView) => void;
  onRename: (view: SavedView) => void;
  onDelete: (view: SavedView) => void;
  onToggleShared: (view: SavedView) => void;
  onMove: (view: SavedView, direction: -1 | 1) => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => onOpen(null)}
        className={cn(
          "rounded-md px-2 py-1 text-xs transition-colors",
          activeId === null
            ? "bg-accent font-medium text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        All keywords
      </button>
      {views.map((view, index) => {
        const active = view.id === activeId;
        return (
          <span
            key={view.id}
            className={cn(
              "inline-flex items-center rounded-md transition-colors",
              active ? "bg-accent" : "hover:bg-accent",
            )}
          >
            <button
              type="button"
              onClick={() => onOpen(view)}
              className={cn(
                "max-w-48 truncate px-2 py-1 text-xs",
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title={view.name}
            >
              {view.name}
              {active && dirty ? (
                <span className="ml-1 text-primary" title="Unsaved changes">
                  •
                </span>
              ) : null}
              {view.shared ? (
                <Share2 className="ml-1 inline h-3 w-3 text-muted-foreground" />
              ) : null}
            </button>
            <DropdownMenu
              open={menuFor === view.id}
              onOpenChange={(open) => setMenuFor(open ? view.id : null)}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Options for ${view.name}`}
                  className="rounded-r-md px-1 py-1 text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {active && dirty ? (
                  <DropdownMenuItem onSelect={() => onUpdate(view)}>
                    <Check className="mr-2 h-3.5 w-3.5" />
                    Keep these changes
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => onRename(view)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onToggleShared(view)}>
                  <Share2 className="mr-2 h-3.5 w-3.5" />
                  {view.shared
                    ? "Stop sharing with the team"
                    : "Share with the team"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={index === 0}
                  onSelect={() => onMove(view, -1)}
                >
                  Move left
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={index === views.length - 1}
                  onSelect={() => onMove(view, 1)}
                >
                  Move right
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => onDelete(view)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete view
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        );
      })}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
        onClick={onSaveNew}
        disabled={busy}
      >
        {busy || loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Plus className="h-3 w-3" />
        )}
        Save this view
      </Button>
    </div>
  );
}
