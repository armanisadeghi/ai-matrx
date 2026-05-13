"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllNotesList,
  selectAllFolders,
  selectNotesListStatus,
} from "../../redux/selectors";
import type { NoteListItem } from "../../types";

interface NotesSidebarClientProps {
  seeds: NoteListItem[];
}

/**
 * Interactive sidebar client island.
 * Reads from Redux (hydrated by NoteListHydrator on the server pass).
 * TODO: Full sidebar implementation — filter controls, group-by toggle,
 * note list, context menus, folder management.
 */
export function NotesSidebarClient({ seeds: _seeds }: NotesSidebarClientProps) {
  const notes = useAppSelector(selectAllNotesList);
  const folders = useAppSelector(selectAllFolders);
  const listStatus = useAppSelector(selectNotesListStatus);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="h-9 shrink-0 flex items-center gap-1 px-2 border-b border-border">
        {/* TODO: NotesSidebarToolbar — group-by, sort, filter, new note */}
        <span className="text-xs text-muted-foreground font-medium">
          {listStatus === "loading" ? "Loading…" : `${notes.length} notes`}
        </span>
      </div>

      {/* Note list — scrollable */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* TODO: NotesSidebarList — grouped by folder/organizations/project/task/scope */}
        {folders.map((folder) => {
          const folderNotes = notes.filter(
            (n) => (n.folder_name ?? "Draft") === folder,
          );
          if (folderNotes.length === 0) return null;
          return (
            <div key={folder}>
              <div className="px-2 py-1 mt-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {folder}
                </span>
              </div>
              {folderNotes.map((note) => (
                <NotesSidebarItem key={note.id} note={note} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotesSidebarItem({
  note,
}: {
  note: { id: string; label: string; updated_at: string | null };
}) {
  const relativeTime = note.updated_at ? formatRelative(note.updated_at) : "";

  return (
    <a
      href={`/notes/${note.id}`}
      className="flex items-center gap-2 h-9 px-3 hover:bg-accent/50 rounded mx-1 group cursor-pointer"
    >
      <span className="text-xs text-foreground truncate flex-1 min-w-0">
        {note.label}
      </span>
      <span className="text-[10px] text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {relativeTime}
      </span>
    </a>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
