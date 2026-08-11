/**
 * features/files/virtual-sources/adapters/NotesInlinePreview.tsx
 *
 * Inline preview for the Notes adapter. Mounts the existing
 * `NoteEditorCore` from features/notes — the same component the notes-v2
 * editor uses — inside the cloud-files preview pane. Loads the note via
 * `notesService.fetchNoteById` on mount and saves with debounced
 * `notesService.updateNote` on edit.
 *
 * Why a thin wrapper instead of dropping `NoteEditorCore` into
 * `inlinePreview` directly? `NoteEditorCore` is purely presentational and
 * expects content + an onChange callback. The wrapper owns the fetch/save
 * lifecycle so the cloud-files preview pane only has to mount one component.
 */

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Columns,
  Eye,
  FileText,
  Loader2,
  PilcrowRight,
  SplitSquareHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchNoteById, updateNote } from "@/features/notes/service/notesService";
import type { Note } from "@/features/notes/types";
import type { EditorMode } from "@/features/notes/components/NoteEditorCore";
import type { InlinePreviewProps } from "@/features/files/virtual-sources/types";
import { TooltipIcon } from "@/features/files/components/core/Tooltip/TooltipIcon";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

// Lazy-load the editor — it pulls in MarkdownStream + TuiEditor which are
// heavy. Cloud-files preview pane stays light until the user actually clicks
// a Note.
const NoteEditorCore = dynamic(
  () =>
    import("@/features/notes/components/NoteEditorCore").then(
      (m) => m.NoteEditorCore,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

const SAVE_DEBOUNCE_MS = 800;

// View mode toggle — same set notes-v2's window view exposes, matched
// labels so users see the same names everywhere they edit a note.
// "split" = the classic Matrx split (text editor + live preview).
const VIEW_MODES: ReadonlyArray<{
  mode: EditorMode;
  label: string;
  icon: typeof FileText;
}> = [
  { mode: "plain", label: "Edit", icon: FileText },
  { mode: "split", label: "Split", icon: SplitSquareHorizontal },
  { mode: "wysiwyg", label: "Rich", icon: PilcrowRight },
  { mode: "markdown-split", label: "MD Split", icon: Columns },
  { mode: "preview", label: "Preview", icon: Eye },
];

const DEFAULT_MODE: EditorMode = "split";

export function NotesInlinePreview({ id }: InlinePreviewProps) {
  const [note, setNote] = useState<Note | null>(null);
  const [content, setContent] = useState<string>("");
  // A load failure is never explained here: a zero-row read is denied /
  // deleted / stale-id / signed-out, and this panel cannot tell them apart.
  // It hands the raw outcome to <AccessGate>, which asks the platform.
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>(DEFAULT_MODE);
  const lastSavedContent = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load on mount / id change. Owns its own state — no Redux pollution.
  useEffect(() => {
    let cancelled = false;
    setNote(null);
    setContent("");
    setFailure(null);
    void (async () => {
      try {
        const fetched = await fetchNoteById(id);
        if (cancelled) return;
        if (!fetched) {
          // Zero rows, no error — the silent-RLS case the gate resolves.
          setFailure({ error: null });
          return;
        }
        setNote(fetched);
        setContent(fetched.content ?? "");
        lastSavedContent.current = fetched.content ?? "";
      } catch (err) {
        if (!cancelled) setFailure({ error: err });
      }
    })();
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [id, attempt]);

  // Debounced save. The cloud-files preview pane shouldn't fight notes-v2's
  // own auto-save (this writes through the same `notesService.updateNote`
  // function notes-v2 uses, so it's safe; debounce just prevents a write per
  // keystroke).
  const flushSave = useCallback(
    async (next: string) => {
      if (!note) return;
      if (next === lastSavedContent.current) return;
      setSaving(true);
      try {
        await updateNote(note.id, { content: next });
        lastSavedContent.current = next;
      } catch {
        // swallow — the user can retry by typing again
      } finally {
        setSaving(false);
      }
    },
    [note],
  );

  const handleChange = useCallback(
    (next: string) => {
      setContent(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void flushSave(next);
      }, SAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  // Flush pending edits when the component unmounts (or note id changes).
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (content !== lastSavedContent.current && note) {
        // Fire-and-forget — at unmount we can't await.
        void updateNote(note.id, { content }).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  if (failure) {
    return (
      <div className="h-full w-full overflow-auto">
        <AccessGate
          token="note"
          id={id}
          error={failure.error}
          onRetry={() => setAttempt((n) => n + 1)}
          fallbackHref="/notes"
          fallbackLabel="All notes"
        />
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="truncate font-medium text-foreground">
          {note.label ?? "Untitled note"}
        </span>
        <div className="flex items-center gap-2">
          {saving ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </span>
          ) : null}
          <div className="inline-flex items-center rounded-md border bg-background p-0.5">
            {VIEW_MODES.map(({ mode, label, icon: Icon }) => {
              const active = editorMode === mode;
              return (
                <TooltipIcon key={mode} label={label}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={label}
                    onClick={() => setEditorMode(mode)}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/60",
                    )}
                  >
                    <Icon className="h-3 w-3" aria-hidden="true" />
                  </button>
                </TooltipIcon>
              );
            })}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <NoteEditorCore
          content={content}
          onChange={handleChange}
          editorMode={editorMode}
        />
      </div>
    </div>
  );
}
