"use client";

import { useState, useMemo } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllNotesList,
  selectInstanceTabs,
  selectInstanceActiveTab,
} from "@/features/notes/redux/selectors";
import { setSplitNote } from "@/features/notes/redux/slice";
import { fetchNoteContent } from "@/features/notes/redux/thunks";
import { useNotesInstanceId } from "@/features/notes/context/NotesInstanceContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Columns2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface SplitNotePickerProps {
  children?: React.ReactNode;
}

export function SplitNotePicker({ children }: SplitNotePickerProps) {
  const dispatch = useAppDispatch();
  const instanceId = useNotesInstanceId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const allNotes = useAppSelector(selectAllNotesList);
  const openTabIds = useAppSelector(selectInstanceTabs(instanceId));
  const activeTabId = useAppSelector(selectInstanceActiveTab(instanceId));

  const openTabs = useMemo(
    () => allNotes.filter((n) => openTabIds?.includes(n.id) && n.id !== activeTabId),
    [allNotes, openTabIds, activeTabId],
  );

  const otherNotes = useMemo(() => {
    const openSet = new Set(openTabIds ?? []);
    let filtered = allNotes.filter((n) => !openSet.has(n.id) && n.id !== activeTabId);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          n.folder_name?.toLowerCase().includes(q) ||
          idMatchesQuery(n, q),
      );
    }
    return filtered;
  }, [allNotes, openTabIds, activeTabId, search]);

  const handleSelect = (noteId: string) => {
    dispatch(setSplitNote({ instanceId, noteId }));
    dispatch(fetchNoteContent(noteId));
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <button
            className="flex items-center justify-center w-5 h-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Split view"
          >
            <Columns2 className="w-3 h-3" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-[260px] p-0"
        align="start"
        side="bottom"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search notes..."
            value={search}
            onValueChange={setSearch}
          />

          <CommandList>
            {openTabs.length > 0 && (
              <CommandGroup heading="Open Tabs">
                {openTabs.map((note) => (
                  <CommandItem
                    key={note.id}
                    value={note.id}
                    onSelect={() => handleSelect(note.id)}
                    className="gap-2 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0 text-primary/60" />
                    <span className="truncate text-xs">{note.label}</span>
                    {note.folder_name && (
                      <span className="ml-auto text-[0.5625rem] text-muted-foreground/50 truncate max-w-[60px]">
                        {note.folder_name}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandGroup heading="All Notes">
              {otherNotes.slice(0, 50).map((note) => (
                <CommandItem
                  key={note.id}
                  value={note.id}
                  onSelect={() => handleSelect(note.id)}
                  className="gap-2 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 opacity-50" />
                  <span className="truncate text-xs">{note.label}</span>
                  {note.folder_name && (
                    <span className="ml-auto text-[0.5625rem] text-muted-foreground/50 truncate max-w-[60px]">
                      {note.folder_name}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandEmpty className="text-xs py-3 text-center">
              No notes found
            </CommandEmpty>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
