"use client";

/**
 * MandateNotesPanel — the ONE notes surface for a mandate.
 *
 * Composed in two places by design, never forked:
 *   • at the moment of truth — the Agents header menu's mandate row, wherever
 *     an agent is doing a job on the page you are standing on (`compact`);
 *   • at review time — the mandate console drawer and `/agents/mandates`.
 *
 * What it stores is exactly what Arman asked for: the text, when, and who. The
 * surface it was written on and the agent holding the mandate at the time ride
 * along as context, recorded automatically — never typed.
 */

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessageSquarePlus, StickyNote, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";
import {
  MANDATE_NOTE_KINDS,
  MANDATE_NOTE_KIND_LABELS,
  createMandateNote,
  deleteMandateNote,
  fetchMandateNotes,
  type MandateNote,
  type MandateNoteKind,
} from "../notes";

export interface MandateNotesPanelProps {
  /** The mandate the notes hang off. */
  mandateId: string;
  /** Shown in the composer placeholder so the note's subject is never ambiguous. */
  mandateKey: string;
  /** Where the note is being written — recorded on the row. */
  surfaceName?: string | null;
  /** The agent currently holding the mandate, when the host knows it. */
  observedAgentId?: string | null;
  /** Dense variant for the header menu; the console uses the roomy one. */
  compact?: boolean;
  className?: string;
}

const KIND_STYLES: Record<MandateNoteKind, string> = {
  observation: "border-border text-muted-foreground",
  issue: "border-rose-500/40 text-rose-600 dark:text-rose-400",
  idea: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  praise: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
};

export function MandateNotesPanel({
  mandateId,
  mandateKey,
  surfaceName,
  observedAgentId,
  compact = false,
  className,
}: MandateNotesPanelProps) {
  const [notes, setNotes] = useState<MandateNote[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<MandateNoteKind>("observation");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setNotes(await fetchMandateNotes(mandateId));
    } catch (err) {
      // LOUD, never silent: an unreadable note history is a real failure, not
      // an empty list.
      const message =
        err instanceof Error ? err.message : "Could not load notes.";
      console.error("[mandate-notes] load failed", err);
      setLoadError(message);
      setNotes([]);
    }
  }, [mandateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await createMandateNote({
        mandateId,
        body: text,
        noteKind: kind,
        surfaceName: surfaceName ?? null,
        observedAgentId: observedAgentId ?? null,
      });
      setBody("");
      setKind("observation");
      await load();
      toast.success("Note saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save the note.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (note: MandateNote) => {
    const ok = await confirm({
      title: "Delete this note?",
      description: note.body.slice(0, 160),
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteMandateNote(note.id);
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete the note.",
      );
    }
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            // Cmd/Ctrl+Enter saves — the composer is small and the note is a
            // one-breath thought.
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void save();
            }
          }}
          placeholder={`What did you notice about ${mandateKey}?`}
          rows={compact ? 2 : 3}
          className={cn("resize-none", compact && "text-xs")}
        />
        <div className="flex flex-wrap items-center gap-1">
          {MANDATE_NOTE_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                option === kind
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {MANDATE_NOTE_KIND_LABELS[option]}
            </button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!body.trim() || saving}
            onClick={() => void save()}
            className="ml-auto h-6 gap-1 px-2 text-[11px]"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <MessageSquarePlus className="h-3 w-3" />
            )}
            Save note
          </Button>
        </div>
      </div>

      {loadError && (
        <p className="text-[11px] text-destructive">{loadError}</p>
      )}

      {notes === null ? (
        <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading notes…
        </div>
      ) : notes.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">
          <StickyNote className="h-3 w-3 shrink-0" />
          No notes yet. What you write here is waiting for you when you review
          this mandate.
        </div>
      ) : (
        <ul
          className={cn(
            "min-w-0 space-y-1.5 overflow-y-auto",
            compact ? "max-h-56" : "max-h-96",
          )}
        >
          {notes.map((note) => (
            <li
              key={note.id}
              className="min-w-0 rounded-md border border-border bg-card p-2"
            >
              <div className="flex min-w-0 items-start gap-2">
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-foreground">
                  {note.body}
                </p>
                <button
                  type="button"
                  onClick={() => void remove(note)}
                  title="Delete note"
                  aria-label="Delete note"
                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                <span
                  className={cn(
                    "rounded border px-1 py-px",
                    KIND_STYLES[note.noteKind],
                  )}
                >
                  {MANDATE_NOTE_KIND_LABELS[note.noteKind]}
                </span>
                <span title={new Date(note.createdAt).toLocaleString()}>
                  {formatDistanceToNow(new Date(note.createdAt), {
                    addSuffix: true,
                  })}
                </span>
                {note.authorName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{note.authorName}</span>
                  </>
                )}
                {note.surfaceName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span
                      className="truncate"
                      title={note.surfaceName}
                    >
                      on {getSurfaceDisplayLabel(note.surfaceName)}
                    </span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
