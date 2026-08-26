// features/hr/people/relations/components/RestrictedNotesPanel.tsx
//
// 🚨 AN OWNER-ONLY PANEL THAT IS **ABSENT** FOR EVERYONE ELSE.
//
// `hr.restricted_note` is reachable only through its own owner lane — NO org
// admin can read one at all (§4.9b G). So:
//
//   • `restricted_notes` key ABSENT from the payload → this panel renders
//     NOTHING. No heading, no card, no "notes are restricted" line. A heading
//     with nothing under it tells the viewer what exists and taunts them with
//     it (SPEC-UI-IA §4.2).
//   • A note the viewer does not own but which carries a `redacted_summary` →
//     the summary, and nothing else. No author, no kind detail, no body.
//   • A note the viewer does not own with no redacted summary → not rendered.
//
// Ownership transfer is `hr.transfer_restricted_note` and is deliberately NOT a
// control on this panel: moving who can read an investigation narrative is a
// records-governance act, not a row menu.

"use client";

import { useState } from "react";
import { Lock, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { addHrRestrictedNote } from "@/features/hr/service";
import { hrErrorSentence } from "@/features/hr/shared/HrStates";

import {
  HR_RESTRICTED_NOTE_KINDS,
  HR_RESTRICTED_NOTE_KIND_LABELS,
  type HrRestrictedNote,
  type HrRestrictedNoteKind,
} from "../types";

function formatWhen(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function RestrictedNotesPanel({
  notes,
  targetToken,
  targetId,
  canWrite,
  onChanged,
}: {
  /** `undefined` = the key was absent = this viewer has no note lane. */
  notes: HrRestrictedNote[] | undefined;
  targetToken: string;
  targetId: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<HrRestrictedNoteKind>("investigation");
  const [body, setBody] = useState("");
  const [redacted, setRedacted] = useState("");
  const [saving, setSaving] = useState(false);

  // THE GATE. No key, no panel, no trace.
  if (notes === undefined) return null;

  async function save() {
    if (!body.trim() || saving) return;
    setSaving(true);
    const result = await addHrRestrictedNote({
      targetToken,
      targetId,
      noteKind: kind,
      body: body.trim(),
      redactedSummary: redacted.trim() || null,
    });
    setSaving(false);
    if (result.ok) {
      setBody("");
      setRedacted("");
      setAdding(false);
      onChanged();
      return;
    }
    toast.error(hrErrorSentence(result, "Saving this note"));
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            Restricted notes
          </h3>
          <p className="text-xs text-muted-foreground">
            Reachable only by the people who hold this note. No organization
            administrator can read one.
          </p>
        </div>
        {canWrite && !adding ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 shrink-0 sm:min-h-9"
            onClick={() => setAdding(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add
          </Button>
        ) : null}
      </div>

      {adding ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="note-kind">Kind</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as HrRestrictedNoteKind)}
            >
              <SelectTrigger id="note-kind" className="min-h-11 sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HR_RESTRICTED_NOTE_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {HR_RESTRICTED_NOTE_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note-body">Note</Label>
            <Textarea
              id="note-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note-redacted">
              One line others on the case may see
            </Label>
            <Textarea
              id="note-redacted"
              value={redacted}
              onChange={(e) => setRedacted(e.target.value)}
              rows={2}
              placeholder="Leave empty and the note is invisible to everyone but its holders."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={!body.trim() || saving}
              className="min-h-11 sm:min-h-9"
            >
              Save note
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAdding(false)}
              className="min-h-11 sm:min-h-9"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No notes yet on this case.
        </p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => {
            const owned = note.is_owner !== false && Boolean(note.body);
            // A non-owner gets the redacted line IF the server sent one, and
            // nothing at all otherwise — not a "restricted" placeholder row.
            if (!owned && !note.redacted_summary) return null;
            return (
              <li
                key={note.id}
                className="rounded-md border border-border bg-muted/30 p-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {HR_RESTRICTED_NOTE_KIND_LABELS[
                      note.note_kind as HrRestrictedNoteKind
                    ] ?? note.note_kind}
                  </span>
                  {owned && note.author_name ? (
                    <span>· {note.author_name}</span>
                  ) : null}
                  {owned && note.created_at ? (
                    <span>· {formatWhen(note.created_at)}</span>
                  ) : null}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">
                  {owned ? note.body : note.redacted_summary}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
