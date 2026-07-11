"use client";

// features/notes/components/NoteContextSection.tssx
//
// The note's context surface — the official replacement for the old glassy
// NoteContextPicker. Two entry points, one behavior:
//
//   • NoteContextSection  — expanded form at the bottom of the note
//     (metadata bar panel).
//   • NoteContextStatusIcon — the tab-strip shortcut: amber shield when the
//     note has NO context (org/scope/project/task all empty), green when any
//     is set; click opens the same picker in a popover.
//
// Writes:
//   • Scopes      → ctx_scope_assignments via the field's canonical live path.
//   • Org/Proj/Task FKs → setNoteField + saveNote (the notes save pipeline),
//     applied from the SAME selection on save — both entry points share
//     `noteSaveAdapter` so behavior can never drift.
//
// Org semantics: the note's organization_id is set from the EXPLICIT picks
// only — never inferred from which org the user happened to browse scopes in.

import React, { useMemo } from "react";
import { ShieldAlert, ShieldCheck, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setNoteField } from "@/features/notes/redux/slice";
import { saveNote } from "@/features/notes/redux/thunks";
import { selectNoteById } from "@/features/notes/redux/selectors";
import {
  ContextAssignmentField,
  type ContextAssignmentSaveResult,
} from "@/features/scopes/components/context-assignment/ContextAssignmentField";
import { KgSuggestionsChip } from "@/features/kg-suggestions/components/KgSuggestionsChip";
import { ContextAssignmentPopover } from "@/features/scopes/components/context-assignment/ContextAssignmentPopover";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import type { AppDispatch } from "@/lib/redux/store";

/** Shared FK adapter — identical for the footer and the tab icon. */
function noteSaveAdapter(dispatch: AppDispatch, noteId: string) {
  return (r: ContextAssignmentSaveResult) => {
    if (!r.ok) return;
    dispatch(
      setNoteField({
        id: noteId,
        field: "project_id",
        value: r.selection.projectIds[0] ?? null,
      }),
    );
    dispatch(
      setNoteField({
        id: noteId,
        field: "task_id",
        value: r.selection.taskIds[0] ?? null,
      }),
    );
    void dispatch(saveNote(noteId));
  };
}

export function NoteContextSection({ noteId }: { noteId: string }) {
  const dispatch = useAppDispatch();
  const note = useAppSelector(useMemo(() => selectNoteById(noteId), [noteId]));
  const onSaved = useMemo(
    () => noteSaveAdapter(dispatch, noteId),
    [dispatch, noteId],
  );
  if (!note) return null;
  return (
    <div className="my-2">
      <ContextAssignmentField
        mode="assignment"
        writeMode="live"
        subject={{
          entityType: "note",
          entityId: noteId,
          title: note.label || "Untitled note",
          icon: StickyNote,
        }}
        defaultOrganizationId={note.organization_id ?? undefined}
        sectionHeight={260}
        onSaved={onSaved}
      />
      {/* Pending KG → scope-item fill suggestions for this note — the visible
          NER payoff. Renders nothing at count 0 (the chip self-hides). */}
      <KgSuggestionsChip
        filter={{ sourceKind: "note", sourceId: noteId }}
        className="mt-1.5"
      />
    </div>
  );
}

// Sized/shaped to match the tab strip's other action buttons (`actionBtnClass`
// in NoteTabItem — w-6 h-6, no border, [&_svg]:w-3.5 h-3.5). Built on
// ContextAssignmentPopover directly rather than ContextStatusButton: that
// component's TapTargetButton geometry is fixed at header-icon size (40px
// pill) and can't be shrunk to a 24px tab-strip icon via a className prop.
export function NoteContextStatusIcon({
  noteId,
  className,
}: {
  noteId: string;
  className?: string;
}) {
  const dispatch = useAppDispatch();
  const note = useAppSelector(useMemo(() => selectNoteById(noteId), [noteId]));
  const es = useEntityScopes({ entityType: "note", entityId: noteId });
  const onSaved = useMemo(
    () => noteSaveAdapter(dispatch, noteId),
    [dispatch, noteId],
  );
  if (!note) return null;
  const hasFkContext = !!(
    note.organization_id ||
    note.project_id ||
    note.task_id
  );
  const hasContext = es.scopeIds.length > 0 || hasFkContext;
  const label = hasContext
    ? "Context is set — click to review or change"
    : "No context set — click to assign";

  return (
    <ContextAssignmentPopover
      subject={{
        entityType: "note",
        entityId: noteId,
        title: note.label || "Untitled note",
        icon: StickyNote,
      }}
      writeMode="live"
      onSaved={(r) => {
        onSaved(r);
        void es.refresh();
      }}
      trigger={
        <button
          type="button"
          title={label}
          aria-label={label}
          className={cn(
            "flex items-center justify-center w-6 h-6 rounded cursor-pointer transition-colors [&_svg]:w-3.5 [&_svg]:h-3.5",
            hasContext
              ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              : "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10",
            className,
          )}
        >
          {hasContext ? <ShieldCheck /> : <ShieldAlert />}
        </button>
      }
    />
  );
}
