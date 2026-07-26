"use client";

import { associationsService } from "@/features/scopes/service/associationsService";
import type { NoteContextLinks } from "../types";

type IdentifiedRow = { id: string };

function emptyLinks(): NoteContextLinks {
  return { project_id: null, task_id: null };
}

/**
 * Hydrate the note UI's project/task projection from the canonical association
 * graph in one batched read. The DB note row intentionally owns neither FK.
 */
export async function hydrateNoteContextLinks<T extends IdentifiedRow>(
  rows: T[],
): Promise<Array<T & NoteContextLinks>> {
  if (rows.length === 0) return [];

  const result = await associationsService.listForSources(
    "note",
    rows.map((row) => row.id),
  );
  if (!result.ok) {
    throw new Error(
      `Could not load note context associations: ${result.error.message}`,
    );
  }

  const byNote = new Map<string, NoteContextLinks>();
  for (const edge of result.data.edges) {
    if (edge.targetType !== "project" && edge.targetType !== "task") continue;
    const links = byNote.get(edge.sourceId) ?? emptyLinks();
    if (edge.targetType === "project") {
      if (links.project_id && links.project_id !== edge.targetId) {
        console.error("Note has multiple project associations", {
          noteId: edge.sourceId,
          firstProjectId: links.project_id,
          additionalProjectId: edge.targetId,
        });
      } else {
        links.project_id = edge.targetId;
      }
    } else if (links.task_id && links.task_id !== edge.targetId) {
      console.error("Note has multiple task associations", {
        noteId: edge.sourceId,
        firstTaskId: links.task_id,
        additionalTaskId: edge.targetId,
      });
    } else {
      links.task_id = edge.targetId;
    }
    byNote.set(edge.sourceId, links);
  }

  return rows.map((row) => ({
    ...row,
    ...(byNote.get(row.id) ?? emptyLinks()),
  }));
}

/**
 * Replace only the context edge types the caller explicitly supplies.
 * `undefined` means leave that target type untouched; `null` means clear it.
 */
export async function syncNoteContextLinks(args: {
  noteId: string;
  organizationId: string;
  projectId?: string | null;
  taskId?: string | null;
}): Promise<void> {
  const writes: Promise<unknown>[] = [];

  if (args.projectId !== undefined) {
    writes.push(
      associationsService.setTargets({
        sourceType: "note",
        sourceId: args.noteId,
        targetType: "project",
        targetIds: args.projectId ? [args.projectId] : [],
        orgId: args.organizationId,
      }),
    );
  }
  if (args.taskId !== undefined) {
    writes.push(
      associationsService.setTargets({
        sourceType: "note",
        sourceId: args.noteId,
        targetType: "task",
        targetIds: args.taskId ? [args.taskId] : [],
        orgId: args.organizationId,
      }),
    );
  }

  const results = await Promise.all(writes);
  const failed = results.find(
    (
      result,
    ): result is {
      ok: false;
      error: { message: string };
    } =>
      typeof result === "object" &&
      result !== null &&
      "ok" in result &&
      result.ok === false,
  );
  if (failed) {
    throw new Error(
      `Note was saved, but its context association failed: ${failed.error.message}`,
    );
  }
}
