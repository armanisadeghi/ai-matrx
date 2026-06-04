/**
 * features/window-panels/windows/notes/NoteInfoWindow.tsx
 *
 * Floating WindowPanel that shows everything about a single note in one
 * place — content stats (words / characters / lines / reading time),
 * timestamps + version, folder, the full hierarchy context picker, tags,
 * and identifiers. Opened from the note tab's info icon.
 *
 * The window is a thin shell around the canonical NoteInfoPanel (so the
 * same surface can be embedded elsewhere). It is ephemeral — it is tied to
 * whichever note the user clicked, so there is nothing meaningful to
 * restore across reloads.
 */

"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { NoteInfoPanel } from "@/features/notes/components/NoteInfoPanel";

export interface NoteInfoWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /** The note to inspect. Falls back to the registry default (null). */
  noteId?: string | null;
  /** Optional title override (e.g. the note label) for the window header. */
  title?: string | null;
}

export default function NoteInfoWindow({
  isOpen,
  onClose,
  noteId,
  title,
}: NoteInfoWindowProps) {
  if (!isOpen || !noteId) return null;

  return (
    <WindowPanel
      title={title || "Note info"}
      width={400}
      height={620}
      minWidth={320}
      minHeight={360}
      onClose={onClose}
      overlayId="noteInfoWindow"
      onCollectData={() => ({ noteId, title: title ?? undefined })}
      bodyClassName="overflow-y-auto"
    >
      <NoteInfoPanel noteId={noteId} />
    </WindowPanel>
  );
}
