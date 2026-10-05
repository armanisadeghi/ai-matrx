/**
 * SavedViewBar — named views of one table, along the top of the grid.
 *
 * A saved view is the URL made durable. The URL already carries the whole view
 * (search, sort, filters, columns, order, page size); this gives that view a
 * name you can come back to, and a default that loads automatically.
 *
 * WHAT IT SHOWS AND WHY:
 *   - the views as chips, so switching is one click, not a menu dive;
 *   - an UNSAVED dot on the active chip the moment the live view diverges from
 *     what was stored, because a view that silently stops matching its name is
 *     how people lose work they thought was saved;
 *   - "Save as new" whenever the live view narrows anything, so the path from
 *     "I built something useful" to "I can return to it" is one click.
 *
 * Applying a view writes the URL (via the caller's setters), so the address bar
 * still describes what is on screen and the link is still shareable. A view is
 * a shortcut to a URL, never a second source of truth.
 */
"use client";

import { useState } from "react";
import {
  Bookmark,
  BookmarkPlus,
  Check,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Star,
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
import { confirm as confirmDialog } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";

import {
  definitionIsEmpty,
  describeDefinition,
  sameDefinition,
  type SavedViewDefinition,
} from "./definition";
import type { SavedView } from "./service";

type Props = {
  views: SavedView[];
  loading: boolean;
  /** The definition the grid is showing right now. */
  liveDefinition: SavedViewDefinition;
  activeViewId: string | null;
  displayNameFor: (fieldName: string) => string;
  readOnly: boolean;
  onApply: (view: SavedView) => void;
  onClearActive: () => void;
  onSaveNew: (name: string) => Promise<void>;
  onUpdate: (view: SavedView) => Promise<void>;
  onRename: (view: SavedView, name: string) => Promise<void>;
  onSetDefault: (view: SavedView, makeDefault: boolean) => Promise<void>;
  onDelete: (view: SavedView) => Promise<void>;
};

export function SavedViewBar({
  views,
  loading,
  liveDefinition,
  activeViewId,
  displayNameFor,
  readOnly,
  onApply,
  onClearActive,
  onSaveNew,
  onUpdate,
  onRename,
  onSetDefault,
  onDelete,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  /** Id of the view being renamed inline, or null. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const active = views.find((v) => v.id === activeViewId) ?? null;
  // The live view has drifted from the stored one — the user has unsaved work.
  const dirty =
    active !== null && !sameDefinition(active.definition, liveDefinition);
  const canSaveNew = !definitionIsEmpty(liveDefinition);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  /** One submit path for both "save as new" and "rename". */
  const submitName = () => {
    const name = draftName.trim();
    if (!name) return;
    const target = renaming ? views.find((v) => v.id === renaming) : null;
    setNaming(false);
    setRenaming(null);
    setDraftName("");
    if (target) void run(() => onRename(target, name));
    else void run(() => onSaveNew(name));
  };

  const editingName = naming || renaming !== null;

  if (loading && views.length === 0) {
    return (
      <div className="flex h-8 shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading views…
      </div>
    );
  }

  // Nothing saved and nothing worth saving — stay out of the way entirely.
  if (views.length === 0 && !canSaveNew) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {views.length > 0 && (
        <Bookmark className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}

      {views.map((view) => {
        const isActive = view.id === activeViewId;
        return (
          <div
            key={view.id}
            className={cn(
              "group flex items-center rounded-full border text-xs transition-colors",
              isActive
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
            )}
          >
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-l-full py-1 pl-2.5 pr-1"
              // CLICKING A VIEW ALWAYS SHOWS THAT VIEW. It used to toggle —
              // clicking the active chip cleared it — which meant that after
              // wandering off a view, the obvious gesture for "put me back"
              // did the opposite and nothing appeared to happen. "Un-apply" is
              // not something anyone wants from a name; that is what Reset
              // view is for.
              onClick={() => onApply(view)}
              title={describeDefinition(view.definition, displayNameFor)}
            >
              {view.isDefault && (
                <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" />
              )}
              <span className="max-w-[14rem] truncate font-medium">
                {view.name}
              </span>
              {isActive && dirty && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  title="This view has unsaved changes"
                />
              )}
            </button>

            {!readOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-r-full px-1.5 py-1 opacity-60 hover:opacity-100"
                    title={`Options for ${view.name}`}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {isActive && dirty && (
                    <DropdownMenuItem
                      onClick={() => void run(() => onUpdate(view))}
                    >
                      <Check className="mr-2 h-3.5 w-3.5" />
                      Update with current view
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      // Inline rename — browser dialogs are banned, and an
                      // inline field keeps the name editable in the place the
                      // name actually lives.
                      setRenaming(view.id);
                      setDraftName(view.name);
                    }}
                  >
                    <PencilLine className="mr-2 h-3.5 w-3.5" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      void run(() => onSetDefault(view, !view.isDefault))
                    }
                  >
                    <Star
                      className={cn(
                        "mr-2 h-3.5 w-3.5",
                        view.isDefault && "fill-amber-400 text-amber-500",
                      )}
                    />
                    {view.isDefault
                      ? "Stop opening by default"
                      : "Open this by default"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() =>
                      void run(async () => {
                        const ok = await confirmDialog({
                          title: `Delete “${view.name}”?`,
                          description:
                            "The view is removed. The table and its rows are untouched — only this saved arrangement goes.",
                          confirmLabel: "Delete view",
                          variant: "destructive",
                        });
                        if (ok) await onDelete(view);
                      })
                    }
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete view
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}

      {!readOnly && canSaveNew && !editingName && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={busy}
          onClick={() => {
            setDraftName("");
            setNaming(true);
          }}
          title="Save the current search, sort, filters and columns as a named view"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <BookmarkPlus className="h-3.5 w-3.5" />
          )}
          Save as view
        </Button>
      )}

      {editingName && (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitName();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setNaming(false);
                setRenaming(null);
                setDraftName("");
              }
            }}
            placeholder={renaming ? "Rename this view" : "Name this view"}
            className="h-7 w-44 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            style={{ fontSize: "16px" }}
          />
          <Button
            type="button"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!draftName.trim() || busy}
            onClick={submitName}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setNaming(false);
              setRenaming(null);
              setDraftName("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {active && dirty && !editingName && !readOnly && (
        <span className="text-[11px] text-muted-foreground">
          unsaved changes to “{active.name}”
        </span>
      )}
    </div>
  );
}
