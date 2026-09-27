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
 *
 * Given an EXISTING `noteId` (a reloaded board, a note brought in from Notes)
 * it first loads the saved content through `NotesAPI.getById` and shows a
 * skeleton, then a named failure with Try again — never an empty editor that
 * would autosave over the real note. `initialText` (pasted text) creates the
 * note at once; `text` stays the outside-write path agents use.
 */

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
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

type NoteLoad = {
  noteId: string | null;
  status: "loading" | "ready" | "failed";
  reason?: string;
  attempt: number;
};
const CREATE_AFTER_MS = 700;

export function NoteTileBody({
  noteId,
  text = "",
  initialText = "",
  onCreated,
}: {
  noteId: string | null;
  /** Content set from OUTSIDE the editor (an agent writing the note). */
  text?: string;
  /**
   * A draft's starting words (pasted text becoming a note). Read ONCE, at
   * mount, while `noteId` is null: the note is created from it at once. The
   * host may drop it after `onCreated` — changing it later does nothing.
   */
  initialText?: string;
  /** The first words created the note — record its id on the tile. */
  onCreated: (noteId: string, label: string) => void;
}) {
  const [content, setContent] = useState(() => (!noteId && initialText.trim() ? initialText : text));
  // Outside writes (an agent) replace the editor content; adjusted during
  // render against the last-seen prop (no effect write), saved below.
  const [seenText, setSeenText] = useState(text);
  if (seenText !== text) {
    setSeenText(text);
    setContent(text);
  }
  const [creating, setCreating] = useState(false);
  const activeOrgId = useAppSelector(selectOrganizationId);
  // The notes system's own autosave — it also flushes a pending save when the
  // tile goes away, so typing is never lost.
  const { updateWithAutoSave, isSaving, isDirty } = useAutoSave({ noteId });
  const createTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creatingRef = useRef(false);

  // An EXISTING note (a reload, "bring in") loads its saved content through
  // the notes system's own read before the editor is shown — never an empty
  // editor that would autosave over the real note. `load.noteId` is the note
  // whose content the editor holds; a note this tile just created is already
  // there, so it is marked ready at creation and never re-read.
  const [load, setLoad] = useState<NoteLoad>(() =>
    noteId
      ? { noteId, status: "loading", attempt: 0 }
      : { noteId: null, status: "ready", attempt: 0 },
  );
  if (noteId !== load.noteId) {
    setLoad(
      noteId
        ? { noteId, status: "loading", attempt: 0 }
        : { noteId: null, status: "ready", attempt: 0 },
    );
  }
  const loadingId = load.status === "loading" ? load.noteId : null;
  useEffect(() => {
    if (!loadingId) return;
    let live = true;
    NotesAPI.getById(loadingId, { failureMode: "throw" }).then(
      (note) => {
        if (!live) return;
        if (!note) {
          setLoad((prev) => ({
            ...prev,
            status: "failed",
            reason: "This note was not found. It may have been deleted, or it is not shared with you.",
          }));
          return;
        }
        setContent(note.content ?? "");
        setLoad((prev) => ({ ...prev, status: "ready" }));
      },
      (err: unknown) => {
        if (!live) return;
        console.error("[spatial/note] could not load the note", { noteId: loadingId, err });
        setLoad((prev) => ({
          ...prev,
          status: "failed",
          reason: err instanceof Error ? err.message : String(err),
        }));
      },
    );
    return () => {
      live = false;
    };
  }, [loadingId, load.attempt]);

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
      const organizationId = await ensureOrganizationContext({
        organizationId: activeOrgId,
      });
      const note = await NotesAPI.create({
        label,
        content: text,
        folder_name: BOARD_NOTES_FOLDER,
        tags: ["board"],
        organization_id: organizationId,
      });
      setLoad({ noteId: note.id, status: "ready", attempt: 0 });
      onCreated(note.id, label);
    } catch (err) {
      creatingRef.current = false;
      if (!isOrganizationSelectionCancelled(err)) {
        toast.error(
          `This note could not be saved to Notes yet: ${err instanceof Error ? err.message : String(err)}. Keep typing to retry.`,
        );
      }
    } finally {
      setCreating(false);
    }
  };

  // Save what an outside write put in the editor: create the note on the
  // first words, then autosave (the same paths typing uses).
  const externalRef = useRef(text);
  const saveOutsideWrite = useEffectEvent((next: string, changed: boolean) => {
    if (noteId) {
      // Nothing to save into until the note's own content has loaded.
      if (load.status !== "ready") return;
      if (changed) updateWithAutoSave({ content: next });
    } else if (next.trim()) {
      void createNote(next); // also a note born with content (an agent's note)
    }
  });
  useEffect(() => {
    const changed = externalRef.current !== text;
    externalRef.current = text;
    saveOutsideWrite(text, changed);
  }, [text, noteId]);

  // A draft born with words (pasted text) is created at once — on the same
  // timer typing uses. Mount only: the seed is read once (a second run is
  // refused by `creatingRef`).
  const createFromSeed = useEffectEvent(() => {
    if (noteId || !initialText.trim()) return;
    const seed = initialText;
    createTimer.current = setTimeout(() => void createNote(seed), 0);
  });
  useEffect(() => {
    createFromSeed();
  }, []);

  const onChange = (next: string) => {
    setContent(next);
    if (noteId) {
      updateWithAutoSave({ content: next });
      return;
    }
    if (createTimer.current) clearTimeout(createTimer.current);
    createTimer.current = setTimeout(
      () => void createNote(next),
      CREATE_AFTER_MS,
    );
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

  if (load.status === "loading") {
    return (
      <div className="flex h-full flex-col gap-2 bg-card px-4 py-3" aria-busy="true" aria-label="Loading the note">
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (load.status === "failed") {
    return (
      <div className="flex h-full flex-col bg-card p-3">
        <ErrorNotice
          size="compact"
          title="Note not opened"
          message={load.reason ?? "The note could not be read."}
          operation="Open a note on the board"
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLoad((prev) => ({ ...prev, status: "loading", attempt: prev.attempt + 1 }))}
            >
              <RotateCcw className="mr-1.5 size-3.5" />
              Try again
            </Button>
          }
        />
      </div>
    );
  }

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
        {(creating || (noteId && (isSaving || isDirty))) && (
          <Loader2 className="size-3 animate-spin" />
        )}
        {noteId && !isSaving && !isDirty && (
          <Check className="size-3 text-success" />
        )}
        <span className="flex-1 truncate">{status}</span>
        {noteId && <EntityCommentPopover token="note" id={noteId} />}
      </div>
    </div>
  );
}

/** A plain text label placed on the board (the Text tool) — board-only, no record. */
export function TextTileBody({
  text,
  onChange,
}: {
  text: string;
  onChange: (text: string) => void;
}) {
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
