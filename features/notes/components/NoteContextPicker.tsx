"use client";

// NoteContextPicker — Full hierarchy context assignment for a single note.
// Shows Organization → Scopes → Project → Task.
//
// Wires through the canonical Surface B primitives in features/scopes:
//   - <EntityTargetPicker kind="organization" /> writes to notes.organization_id
//   - <EntityScopeTagger entityType="note"   /> writes to ctx_scope_assignments
//   - <EntityTargetPicker kind="project"     /> writes to notes.project_id
//   - <EntityTargetPicker kind="task"        /> writes to notes.task_id
//
// NONE of these dispatch appContextSlice — that invariant is enforced by
// the components themselves. See features/scopes/FEATURE.md §"Global vs
// Local context" for the rationale.

import { useCallback, useMemo } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import { useActiveContext } from "@/features/scopes/hooks/useActiveContext";
import { EntityScopeTagger } from "@/features/scopes/components/entity-context/EntityScopeTagger";
import { EntityTargetPicker } from "@/features/scopes/components/entity-context/EntityTargetPicker";
import { KgSuggestionsChip } from "@/features/kg-suggestions/components/KgSuggestionsChip";
import { setNoteField } from "../redux/slice";
import { selectNoteById } from "../redux/selectors";

interface NoteContextPickerProps {
  noteId: string;
  className?: string;
}

export function NoteContextPicker({
  noteId,
  className,
}: NoteContextPickerProps) {
  const dispatch = useAppDispatch();

  const note = useAppSelector(selectNoteById(noteId));
  const noteOrgId = note?.organization_id ?? null;
  const noteProjectId = note?.project_id ?? null;
  const noteTaskId = note?.task_id ?? null;

  // The scope/project/task pickers need an org context. Prefer the note's
  // own org; fall back to the user's globally active org.
  const activeContext = useActiveContext();
  const effectiveOrgId = noteOrgId ?? activeContext.organizationId;

  // M2M scope assignments for this note (auto-fetches lazily).
  const { scopeIds: noteScopeIds, setScopes: setNoteScopes } = useEntityScopes({
    entityType: "note",
    entityId: noteId,
    organizationId: effectiveOrgId,
  });

  // ─── FK handlers — pure note-slice writes; never touch ctx_* tables ─────

  const handleSelectOrg = useCallback(
    (id: string | null) => {
      dispatch(
        setNoteField({ id: noteId, field: "organization_id", value: id }),
      );
      if (id !== noteOrgId) {
        dispatch(
          setNoteField({ id: noteId, field: "project_id", value: null }),
        );
        dispatch(setNoteField({ id: noteId, field: "task_id", value: null }));
      }
    },
    [dispatch, noteId, noteOrgId],
  );

  const handleSelectProject = useCallback(
    (id: string | null) => {
      dispatch(setNoteField({ id: noteId, field: "project_id", value: id }));
      if (id !== noteProjectId) {
        dispatch(setNoteField({ id: noteId, field: "task_id", value: null }));
      }
    },
    [dispatch, noteId, noteProjectId],
  );

  const handleSelectTask = useCallback(
    (
      id: string | null,
      _name: string | null,
      sideEffects?: { projectId?: string | null },
    ) => {
      if (sideEffects?.projectId && sideEffects.projectId !== noteProjectId) {
        dispatch(
          setNoteField({
            id: noteId,
            field: "project_id",
            value: sideEffects.projectId,
          }),
        );
      }
      dispatch(setNoteField({ id: noteId, field: "task_id", value: id }));
    },
    [dispatch, noteId, noteProjectId],
  );

  // ─── Clear all ───────────────────────────────────────────────────────
  const hasAnyContext = useMemo(
    () =>
      !!noteOrgId || !!noteProjectId || !!noteTaskId || noteScopeIds.length > 0,
    [noteOrgId, noteProjectId, noteTaskId, noteScopeIds.length],
  );

  const handleClearAll = useCallback(() => {
    dispatch(
      setNoteField({ id: noteId, field: "organization_id", value: null }),
    );
    dispatch(setNoteField({ id: noteId, field: "project_id", value: null }));
    dispatch(setNoteField({ id: noteId, field: "task_id", value: null }));
    if (noteScopeIds.length > 0) {
      void setNoteScopes([]);
    }
  }, [dispatch, noteId, noteScopeIds.length, setNoteScopes]);

  return (
    <div className={cn("py-1", className)}>
      <EntityTargetPicker
        kind="organization"
        value={noteOrgId}
        onSelect={handleSelectOrg}
      />

      {effectiveOrgId && (
        <EntityScopeTagger
          entityType="note"
          entityId={noteId}
          organizationId={effectiveOrgId}
          variant="sidebar"
          showHeader={false}
        />
      )}

      {/* KG suggestion chip — pending scope-fill proposals for this note. */}
      <div className="px-2">
        <KgSuggestionsChip filter={{ sourceKind: "note", sourceId: noteId }} />
      </div>

      <div className="mx-2 my-0.5 border-t border-border/40" />

      <EntityTargetPicker
        kind="project"
        value={noteProjectId}
        onSelect={handleSelectProject}
        organizationId={effectiveOrgId}
        filterScopeIds={noteScopeIds}
        emptyText={
          noteScopeIds.length > 0
            ? "No projects match selected scopes"
            : effectiveOrgId
              ? "No projects in this organization"
              : "Select an organization first"
        }
      />

      <EntityTargetPicker
        kind="task"
        value={noteTaskId}
        projectId={noteProjectId}
        onSelect={handleSelectTask}
        organizationId={effectiveOrgId}
        emptyText={
          noteProjectId
            ? "No open tasks in this project"
            : "Select a project first"
        }
      />

      {hasAnyContext && (
        <div className="pt-0.5">
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1.5 w-full px-2 py-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors rounded-md hover:bg-accent/30"
          >
            <X className="h-2.5 w-2.5" />
            Clear all context
          </button>
        </div>
      )}
    </div>
  );
}
