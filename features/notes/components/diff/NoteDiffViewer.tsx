"use client";

import { useMemo } from "react";
import { computeDiff } from "@/components/diff/engine/compute-diff";
import { createAdapterRegistry } from "@/components/diff/adapters/registry";
import { DiffViewerShell } from "@/components/diff/views/DiffViewerShell";
import {
  TextFieldAdapter,
  TagsFieldAdapter,
  JsonObjectAdapter,
} from "@/components/diff/adapters/defaults";
import type { ViewMode, DiffNode } from "@/components/diff/engine/types";
import type { Note } from "@/features/notes/types";
import { NOTE_DIFF_OPTIONS, NOTE_PRIORITY_FIELDS } from "./note-diff-constants";
import { NoteContentAdapter } from "./adapters/NoteContentAdapter";

interface NoteDiffViewerProps {
  oldNote: Partial<Note>;
  newNote: Partial<Note>;
  oldLabel: string;
  newLabel: string;
  defaultMode?: ViewMode;
  className?: string;
}

function buildNoteAdapterRegistry() {
  const registry = createAdapterRegistry();

  // Content — the star
  registry.register("content", NoteContentAdapter);

  // Core metadata
  registry.register("label", { ...TextFieldAdapter, label: "Title" });
  registry.register("folder_name", { ...TextFieldAdapter, label: "Folder" });
  registry.register("folder_id", { ...TextFieldAdapter, label: "Folder ID" });
  registry.register("tags", { ...TagsFieldAdapter, label: "Tags" });
  registry.register("visibility", { ...TextFieldAdapter, label: "Visibility" });
  registry.register("metadata", { ...JsonObjectAdapter, label: "Metadata" });

  // Context relationships
  registry.register("organization_id", { ...TextFieldAdapter, label: "Organization" });
  registry.register("project_id", { ...TextFieldAdapter, label: "Project" });
  registry.register("task_id", { ...TextFieldAdapter, label: "Task" });

  return registry;
}

/** Reorder diff nodes so priority fields (content, label) appear first */
function reorderNodes(nodes: DiffNode[]): DiffNode[] {
  const priority: DiffNode[] = [];
  const rest: DiffNode[] = [];

  for (const node of nodes) {
    if (NOTE_PRIORITY_FIELDS.includes(node.key)) {
      priority.push(node);
    } else {
      rest.push(node);
    }
  }

  // Sort priority fields in the defined order
  priority.sort(
    (a, b) => NOTE_PRIORITY_FIELDS.indexOf(a.key) - NOTE_PRIORITY_FIELDS.indexOf(b.key),
  );

  return [...priority, ...rest];
}

export function NoteDiffViewer({
  oldNote,
  newNote,
  oldLabel,
  newLabel,
  defaultMode = "changes-only",
  className,
}: NoteDiffViewerProps) {
  const adapters = useMemo(() => buildNoteAdapterRegistry(), []);

  const diffResult = useMemo(() => {
    const result = computeDiff(
      oldNote as Record<string, unknown>,
      newNote as Record<string, unknown>,
      NOTE_DIFF_OPTIONS,
    );
    // Reorder so content is always first
    return { ...result, root: reorderNodes(result.root) };
  }, [oldNote, newNote]);

  return (
    <DiffViewerShell
      diffResult={diffResult}
      oldValue={oldNote}
      newValue={newNote}
      oldLabel={oldLabel}
      newLabel={newLabel}
      adapters={adapters}
      defaultMode={defaultMode}
      className={className}
    />
  );
}
