"use client";

/**
 * NotePickerPopover — lazy-loaded, searchable note picker with folder grouping.
 *
 * Fetches lightweight list items (id + label + folder, no content) only when
 * the popover opens. The parent receives a note id and should fetch full
 * content via NotesAPI.getById (or fetchNoteContent) on selection.
 *
 * Used by transcription cleanup context blocks and any surface that needs to
 * pick an existing note without hydrating the full notes Redux slice first.
 */

import React, { useCallback, useMemo, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { idMatchesQuery } from "@/utils/search-scoring";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { getAllFolders } from "@/features/notes/utils/folderUtils";
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

  const scopedItems = useMemo(() => {
    if (!folderFilter) return items;
    return items.filter((n) => n.folder_name === folderFilter);
  }, [items, folderFilter]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopedItems;
    return scopedItems.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.folder_name?.toLowerCase().includes(q) ||
        idMatchesQuery(n, q),
    );
  }, [scopedItems, search]);

  const folders = useMemo(
    () => getAllFolders(filteredItems as Parameters<typeof getAllFolders>[0]),
    [filteredItems],
  );

  const notesByFolder = useMemo(() => {
    const grouped: Record<string, NoteListItem[]> = {};
    for (const folder of folders) {
      grouped[folder] = [];
    }
    for (const note of filteredItems) {
      const folder = note.folder_name || "Draft";
      (grouped[folder] ??= []).push(note);
    }
    return grouped;
  }, [filteredItems, folders]);

  const handlePick = useCallback(
    async (noteId: string) => {
      await onSelectNote(noteId);
      onClose();
      setSearch("");
    },
    [onSelectNote, onClose],
  );

  const handleAction = useCallback(
    async (action: NotePickerAction) => {
      await action.onSelect();
      onClose();
      setSearch("");
    },
    [onClose],
  );

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
    <Command shouldFilter={false}>
      <CommandInput
        placeholder="Search notes…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList className="max-h-[280px]">
        {search.trim() ? (
          <CommandGroup heading="Results">
            {filteredItems.map((note) => (
              <CommandItem
                key={note.id}
                value={note.id}
                onSelect={() => {
                  void handlePick(note.id);
                }}
                className="gap-2 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 shrink-0 opacity-50" />
                <span className="truncate text-xs">
                  {note.label || "Untitled"}
                </span>
                {note.folder_name && (
                  <span className="ml-auto text-[0.5625rem] text-muted-foreground/50 truncate max-w-[80px]">
                    {note.folder_name}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          folders.map((folder) => {
            const folderNotes = notesByFolder[folder] ?? [];
            if (folderNotes.length === 0) return null;
            return (
              <CommandGroup key={folder} heading={folder}>
                {folderNotes.map((note) => (
                  <CommandItem
                    key={note.id}
                    value={note.id}
                    onSelect={() => {
                      void handlePick(note.id);
                    }}
                    className="gap-2 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0 text-primary/60" />
                    <span className="truncate text-xs">
                      {note.label || "Untitled"}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })
        )}

        {extraActions && extraActions.length > 0 && (
          <CommandGroup heading="Actions">
            {extraActions.map((action) => (
              <CommandItem
                key={action.id}
                value={action.id}
                onSelect={() => {
                  void handleAction(action);
                }}
                className="gap-2 cursor-pointer text-primary"
              >
                <span className="text-xs">{action.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandEmpty className="text-xs py-3 text-center">
          No notes found
        </CommandEmpty>
      </CommandList>
    </Command>
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
