"use client";

/**
 * MandateNotesPanel — the ONE notes surface for a mandate.
 *
 * Composed in two places by design, never forked:
 *   • at the moment of truth — the Agents header menu's mandate row, wherever
 *     an agent is doing a job on the page you are standing on (`compact`);
 *   • at review time — the mandate console drawer and `/mandates`.
 *
 * What it stores is exactly what Arman asked for: the text, when, and who. The
 * surface it was written on and the agent holding the mandate at the time ride
 * along as context, recorded automatically — never typed.
 */

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessageSquarePlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import {
  ConfigurationTable,
  ConfigurationTableRow,
  FieldHelp,
  PropertyRow,
  StatusToken,
} from "@/components/official/ConfigurationFields";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useAgentNames } from "@/features/surfaces/hooks/useAgentNames";
import { ProTextarea } from "@/components/official/ProTextarea";

const NOTE_COLUMNS = [
  { key: "type", label: "Type" },
  { key: "author", label: "Author" },
  { key: "created", label: "Created" },
  { key: "origin", label: "Origin" },
  { key: "holder", label: "Observed holder" },
];

export interface MandateNotesPanelProps {
  /** The mandate the notes hang off. */
  mandateId: string;
  /** Internal subject identity retained for host compatibility; never rendered. */
  mandateKey: string;
  /** Where the note is being written — recorded on the row. */
  surfaceName?: string | null;
  /** The agent currently holding the mandate, when the host knows it. */
  observedAgentId?: string | null;
  /** Dense variant for the header menu; the console uses the roomy one. */
  compact?: boolean;
  className?: string;
}

export function MandateNotesPanel({
  mandateId,
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
  const agentNames = useAgentNames(
    (notes ?? []).flatMap((note) =>
      note.observedAgentId ? [note.observedAgentId] : [],
    ),
  );

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
        <ProTextarea
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
          placeholder="Add a note"
          aria-label="Note"
          rows={compact ? 2 : 3}
          className={cn("resize-none", compact && "text-xs")}
        />
        <div
          className="flex flex-wrap items-center gap-1"
          role="group"
          aria-label="Note type"
        >
          <span className="mr-1 text-xs text-muted-foreground">Type</span>
          {MANDATE_NOTE_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              aria-pressed={kind === option}
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
        <PropertyRow
          label="Note history"
          value={<StatusToken status="error" label="Unavailable" />}
          help={loadError}
        />
      )}

      {notes === null ? (
        <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading notes…
        </div>
      ) : notes.length === 0 ? (
        !loadError ? (
          <PropertyRow label="Saved notes" value="None" />
        ) : null
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
              <div className="mt-2">
                <ConfigurationTable label="Note details" columns={NOTE_COLUMNS}>
                  <ConfigurationTableRow
                    columns={NOTE_COLUMNS}
                    cells={{
                      type: MANDATE_NOTE_KIND_LABELS[note.noteKind],
                      author: note.authorName || "Name unavailable",
                      created: (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <time dateTime={note.createdAt}>
                            {new Date(note.createdAt).toLocaleString()}
                          </time>
                          <FieldHelp label="Created">
                            {formatDistanceToNow(new Date(note.createdAt), {
                              addSuffix: true,
                            })}
                          </FieldHelp>
                        </span>
                      ),
                      origin: note.surfaceName
                        ? getSurfaceDisplayLabel(note.surfaceName)
                        : "Mandate console",
                      holder: note.observedAgentId ? (
                        <EntityRef
                          token="agent"
                          id={note.observedAgentId}
                          name={
                            agentNames[note.observedAgentId] ||
                            "Name unavailable"
                          }
                          showIcon={false}
                          wrap
                        />
                      ) : (
                        "Not recorded"
                      ),
                    }}
                  />
                </ConfigurationTable>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
