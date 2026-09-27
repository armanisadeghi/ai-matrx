"use client";

/**
 * NoteTileBody — a quick note on the board that is a REAL Note.
 *
 * Nothing is written while the note is empty (no blank notes piling up in
 * Notes). The first words create the note — in the "Board notes" folder,
 * tagged `board`, in the organization the person is working in — and from
 * then on every edit autosaves through the notes system's own `useAutoSave`.
 * Because it is a Note it is searchable, openable in Notes, and commentable
 * (the one comment surface). The editor is the platform's `NoteEditorCore`
 * in its `embedded` mode, built for tile-sized hosts.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { NoteEditorCore } from "@/features/notes/components/NoteEditorCore";
import { useAutoSave } from "@/features/notes/hooks/useAutoSave";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";
import { toast } from "@/lib/toast";
import { EntityCommentPopover } from "@/components/comments/EntityCommentPopover";

const BOARD_NOTES_FOLDER = "Board notes";
const CREATE_AFTER_MS = 700;

export function NoteTileBody({
  noteId,
  initialText = "",
  onCreated,
}: {
  noteId: string | null;
  initialText?: string;
  /** The first words created the note — record its id on the tile. */
  onCreated: (noteId: string, label: string) => void;
}) {
  const [content, setContent] = useState(initialText);
  const [creating, setCreating] = useState(false);
  const activeOrgId = useAppSelector(selectOrganizationId);
  // The notes system's own autosave — it also flushes a pending save when the
  // tile goes away, so typing is never lost.
  const { updateWithAutoSave, isSaving, isDirty } = useAutoSave({ noteId });
  const createTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creatingRef = useRef(false);

  useEffect(
    () => () => {
      if (createTimer.current) clearTimeout(createTimer.current);
    },
    [],
  );

  const createNote = async (text: string) => {
    if (creatingRef.current || !text.trim()) return;
    creatingRef.current = true;
    setCreating(true);
    const label = text.trim().split("\n")[0].slice(0, 80) || "Board note";
    try {
      const organizationId = await ensureOrganizationContext({ organizationId: activeOrgId });
      const note = await NotesAPI.create({
        label,
        content: text,
        folder_name: BOARD_NOTES_FOLDER,
        tags: ["board"],
        organization_id: organizationId,
      });
      onCreated(note.id, label);
    } catch (err) {
      creatingRef.current = false;
      if (!isOrganizationSelectionCancelled(err)) {
        toast.error(`This note could not be saved to Notes yet: ${err instanceof Error ? err.message : String(err)}. Keep typing to retry.`);
      }
    } finally {
      setCreating(false);
    }
  };

  const onChange = (next: string) => {
    setContent(next);
    if (noteId) {
      updateWithAutoSave({ content: next });
      return;
    }
    if (createTimer.current) clearTimeout(createTimer.current);
    createTimer.current = setTimeout(() => void createNote(next), CREATE_AFTER_MS);
  };

  const status = !noteId
    ? creating
      ? "Saving to Notes…"
      : content.trim()
        ? "Draft"
        : "Type to start a note"
    : isSaving || isDirty
      ? "Saving…"
      : "Saved in Notes";

  return (
    <div className="flex h-full flex-col bg-card">
      <div data-spatial-scroll className="min-h-0 flex-1 overflow-y-auto">
        <NoteEditorCore
          embedded
          editorMode="plain"
          content={content}
          onChange={onChange}
          noteId={noteId ?? undefined}
          placeholder="A thought, a to-do, a question…"
          className="h-full"
          textareaClassName="min-h-full bg-transparent px-4 py-3 text-sm"
        />
      </div>
      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-border px-3 text-[11px] text-muted-foreground">
        {(creating || (noteId && (isSaving || isDirty))) && <Loader2 className="size-3 animate-spin" />}
        {noteId && !isSaving && !isDirty && <Check className="size-3 text-success" />}
        <span className="flex-1 truncate">{status}</span>
        {noteId && <EntityCommentPopover token="note" id={noteId} />}
      </div>
    </div>
  );
}

/** A plain text label placed on the board (the Text tool) — board-only, no record. */
export function TextTileBody({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  return (
    <textarea
      value={text}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Text"
      aria-label="Board text"
      className="h-full w-full resize-none bg-transparent p-3 text-2xl font-semibold leading-tight text-foreground outline-none placeholder:text-muted-foreground/60"
    />
  );
}
