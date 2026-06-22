"use client";

/**
 * NotePickerPopover — lazy-loaded, searchable note picker with a collapsible
 * folder tree (same browse pattern as NotesTreeView on /notes).
 *
 * Fetches lightweight list items (id + label + folder, no content) only when
 * the popover opens. The parent receives a note id and should fetch full
 * content via NotesAPI.getById (or fetchNoteContent) on selection.
 *
 * Browse: folders collapsed by default with counts — expand one folder at a time.
 * Search: flat results across all notes (label, folder, id).
 */

import React, { useCallback, useMemo, useState } from "react";
import { ChevronRight, FileText, Loader2, Search } from "lucide-react";
import { idMatchesQuery } from "@/utils/search-scoring";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { NotesAPI } from "@/features/notes/service/notesApi";
import {
  getAllFolders,
  getFolderIconAndColor,
} from "@/features/notes/utils/folderUtils";
import type { NoteListItem } from "@/features/notes/types";

// ── Shared list cache (names only — invalidated after creates/deletes) ───────

let cachedItems: NoteListItem[] | null = null;
let cachePromise: Promise<NoteListItem[]> | null = null;

export function invalidateNotePickerCache(): void {
  cachedItems = null;
  cachePromise = null;
}

async function loadNoteListItems(): Promise<NoteListItem[]> {
  if (cachedItems) return cachedItems;
  if (!cachePromise) {
    cachePromise = NotesAPI.listItems()
      .then((items) => {
        cachedItems = items;
        return items;
      })
      .catch((err) => {
        cachePromise = null;
        throw err;
      });
  }
  return cachePromise;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface NotePickerAction {
  id: string;
  label: string;
  onSelect: () => void | Promise<void>;
}

export interface NotePickerPopoverProps {
  trigger: React.ReactNode;
  onSelectNote: (noteId: string) => void | Promise<void>;
  /** When set, only notes in this folder are listed */
  folderFilter?: string;
  extraActions?: NotePickerAction[];
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

// ── Picker body (shared between Popover + Drawer) ────────────────────────────

interface NotePickerBodyProps {
  items: NoteListItem[];
  isLoading: boolean;
  error: string | null;
  folderFilter?: string;
  extraActions?: NotePickerAction[];
  onSelectNote: (noteId: string) => void | Promise<void>;
  onClose: () => void;
}

function NotePickerBody({
  items,
  isLoading,
  error,
  folderFilter,
  extraActions,
  onSelectNote,
  onClose,
}: NotePickerBodyProps) {
  const [search, setSearch] = useState("");
  const [expandedFolder, setExpandedFolder] = useState<string | null>(
    folderFilter ?? null,
  );

  const scopedItems = useMemo(() => {
    if (!folderFilter) return items;
    return items.filter((n) => n.folder_name === folderFilter);
  }, [items, folderFilter]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return scopedItems.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.folder_name?.toLowerCase().includes(q) ||
        idMatchesQuery(n, q),
    );
  }, [scopedItems, search]);

  const notesByFolder = useMemo(() => {
    const grouped: Record<string, NoteListItem[]> = {};
    for (const note of scopedItems) {
      const folder = note.folder_name || "Draft";
      (grouped[folder] ??= []).push(note);
    }
    for (const folder of Object.keys(grouped)) {
      grouped[folder].sort((a, b) =>
        (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
      );
    }
    return grouped;
  }, [scopedItems]);

  const treeFolders = useMemo(() => {
    const withNotes = getAllFolders(
      scopedItems as Parameters<typeof getAllFolders>[0],
    ).filter((folder) => (notesByFolder[folder]?.length ?? 0) > 0);
    return withNotes;
  }, [scopedItems, notesByFolder]);

  const filteredFoldersForSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return treeFolders.filter(
      (folder) =>
        folder.toLowerCase().includes(q) ||
        (notesByFolder[folder] ?? []).some(
          (n) =>
            n.label.toLowerCase().includes(q) ||
            n.folder_name?.toLowerCase().includes(q) ||
            idMatchesQuery(n, q),
        ),
    );
  }, [treeFolders, notesByFolder, search]);

  const isSearching = search.trim().length > 0;

  const handlePick = useCallback(
    async (noteId: string) => {
      await onSelectNote(noteId);
      onClose();
      setSearch("");
      setExpandedFolder(folderFilter ?? null);
    },
    [onSelectNote, onClose, folderFilter],
  );

  const handleAction = useCallback(
    async (action: NotePickerAction) => {
      await action.onSelect();
      onClose();
      setSearch("");
    },
    [onClose],
  );

  const handleToggleFolder = useCallback((folder: string) => {
    setExpandedFolder((prev) => (prev === folder ? null : folder));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading notes…
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-6 text-center text-xs text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col text-xs">
      <div className="border-b border-border px-2 py-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-0 bg-muted/40 pl-7 text-xs shadow-none focus-visible:ring-1"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
        {isSearching ? (
          <div className="py-0.5">
            {filteredFoldersForSearch.length === 0 &&
            filteredItems.length === 0 ? (
              <div className="px-3 py-6 text-center text-muted-foreground">
                No results found
              </div>
            ) : (
              <>
                {filteredFoldersForSearch.length > 0 && (
                  <div className="pb-0.5">
                    <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Folders
                    </div>
                    {filteredFoldersForSearch.map((folder) => {
                      const { icon: FolderIcon, color: folderColor } =
                        getFolderIconAndColor(folder);
                      const folderNotes = notesByFolder[folder] ?? [];

                      return (
                        <button
                          key={folder}
                          type="button"
                          onClick={() => {
                            setSearch("");
                            setExpandedFolder(folder);
                          }}
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent/50 transition-colors"
                        >
                          <FolderIcon
                            className={cn("h-3.5 w-3.5 shrink-0", folderColor)}
                          />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {folder}
                          </span>
                          <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground/50">
                            {folderNotes.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {filteredItems.length > 0 && (
                  <div>
                    <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Notes
                    </div>
                    {filteredItems.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => {
                          void handlePick(note.id);
                        }}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent/50 transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 opacity-50" />
                        <span className="min-w-0 flex-1 truncate">
                          {note.label || "Untitled"}
                        </span>
                        {note.folder_name && (
                          <span className="shrink-0 truncate text-[0.5625rem] text-muted-foreground/50 max-w-[72px]">
                            {note.folder_name}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="select-none py-0.5">
            {treeFolders.length === 0 ? (
              <div className="px-3 py-6 text-center text-muted-foreground">
                No notes yet
              </div>
            ) : (
              treeFolders.map((folder) => {
                const isExpanded = expandedFolder === folder;
                const folderNotes = notesByFolder[folder] ?? [];
                const { icon: FolderIcon, color: folderColor } =
                  getFolderIconAndColor(folder);

                return (
                  <div key={folder}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-1 px-2 py-1 hover:bg-accent/50 transition-colors",
                        isExpanded && "bg-accent/30",
                      )}
                      onClick={() => handleToggleFolder(folder)}
                    >
                      <ChevronRight
                        className={cn(
                          "h-3 w-3 shrink-0 transition-transform duration-150",
                          isExpanded && "rotate-90",
                        )}
                      />
                      <FolderIcon
                        className={cn("h-3 w-3 shrink-0", folderColor)}
                      />
                      <span className="truncate font-medium">{folder}</span>
                      <span className="ml-auto pr-0.5 text-[9px] tabular-nums text-muted-foreground/50">
                        {folderNotes.length}
                      </span>
                    </button>

                    {isExpanded && (
                      <div>
                        {folderNotes.map((note) => (
                          <button
                            key={note.id}
                            type="button"
                            onClick={() => {
                              void handlePick(note.id);
                            }}
                            className="flex w-full items-center gap-1 py-1 pl-6 pr-2 text-left hover:bg-accent/40 transition-colors"
                          >
                            <FileText className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                            <span className="truncate">
                              {note.label || "Untitled"}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {extraActions && extraActions.length > 0 && (
          <div className="border-t border-border py-0.5">
            {extraActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  void handleAction(action);
                }}
                className="flex w-full items-center px-2.5 py-1.5 text-left text-primary hover:bg-accent/50 transition-colors"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Public component ─────────────────────────────────────────────────────────

export function NotePickerPopover({
  trigger,
  onSelectNote,
  folderFilter,
  extraActions,
  align = "start",
  side = "bottom",
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  className,
}: NotePickerPopoverProps) {
  const isMobile = useIsMobile();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [items, setItems] = useState<NoteListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = controlledOnOpenChange ?? setUncontrolledOpen;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) {
        setIsLoading(true);
        setError(null);
        void loadNoteListItems()
          .then((loaded) => {
            setItems(loaded);
          })
          .catch(() => {
            setError("Could not load notes");
            setItems([]);
          })
          .finally(() => {
            setIsLoading(false);
          });
      }
    },
    [setOpen],
  );

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const body = (
    <NotePickerBody
      items={items}
      isLoading={isLoading}
      error={error}
      folderFilter={folderFilter}
      extraActions={extraActions}
      onSelectNote={onSelectNote}
      onClose={handleClose}
    />
  );

  const mergedTrigger = React.isValidElement(trigger)
    ? React.cloneElement(
        trigger as React.ReactElement<{
          onClick?: (event: React.MouseEvent) => void;
          className?: string;
        }>,
        {
          className: cn(
            (trigger as React.ReactElement<{ className?: string }>).props
              .className,
            className,
          ),
        },
      )
    : trigger;

  if (isMobile) {
    const mobileTrigger = React.isValidElement(mergedTrigger)
      ? React.cloneElement(
          mergedTrigger as React.ReactElement<{
            onClick?: (event: React.MouseEvent) => void;
          }>,
          {
            onClick: (event: React.MouseEvent) => {
              (
                mergedTrigger as React.ReactElement<{
                  onClick?: (event: React.MouseEvent) => void;
                }>
              ).props.onClick?.(event);
              if (!event.defaultPrevented) {
                handleOpenChange(true);
              }
            },
          },
        )
      : mergedTrigger;

    return (
      <>
        {mobileTrigger}
        <Drawer open={open} onOpenChange={handleOpenChange}>
          <DrawerContent className="pb-safe">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-sm">Choose a note</DrawerTitle>
            </DrawerHeader>
            <div className="px-2 pb-4">{body}</div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{mergedTrigger}</PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align={align} side={side}>
        {body}
      </PopoverContent>
    </Popover>
  );
}
