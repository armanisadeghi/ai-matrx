"use client";

import { associationsService } from "@/features/scopes/service/associationsService";
import { getAssociationsStore } from "@/features/scopes/host/associationsStore";
import type { NoteContextLinks } from "../types";
import {
  NoteContextLinkPartialError,
  type NoteContextField,
} from "./noteSaveErrors";

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
  const writes: Array<{ field: NoteContextField; write: Promise<unknown> }> = [];

  if (args.projectId !== undefined) {
    writes.push({
      field: "project_id",
      write: associationsService.setTargets({
        sourceType: "note",
        sourceId: args.noteId,
        targetType: "project",
        targetIds: args.projectId ? [args.projectId] : [],
        orgId: args.organizationId,
      }),
    });
  }
  if (args.taskId !== undefined) {
    writes.push({
      field: "task_id",
      write: associationsService.setTargets({
        sourceType: "note",
        sourceId: args.noteId,
        targetType: "task",
        targetIds: args.taskId ? [args.taskId] : [],
        orgId: args.organizationId,
      }),
    });
  }

  const results = await Promise.allSettled(writes.map(({ write }) => write));
  const succeededFields: NoteContextField[] = [];
  const failedFields: NoteContextField[] = [];
  const safeCauses: Partial<Record<NoteContextField, string>> = {};

  for (const [index, result] of results.entries()) {
    const field = writes[index].field;
    if (
      result.status === "fulfilled" &&
      !(typeof result.value === "object" && result.value !== null && "ok" in result.value && result.value.ok === false)
    ) {
      succeededFields.push(field);
      continue;
    }
    failedFields.push(field);
    const cause = result.status === "rejected" ? result.reason : result.value;
    safeCauses[field] = cause instanceof Error
      ? cause.message
      : typeof cause === "object" && cause !== null && "error" in cause &&
          typeof cause.error === "object" && cause.error !== null &&
          "message" in cause.error && typeof cause.error.message === "string"
        ? cause.error.message
        : "The context association request failed.";
  }

  if (succeededFields.length > 0) {
    try {
      getAssociationsStore().invalidate("note", args.noteId);
    } catch (error) {
      // The durable RPC already settled. A cache refresh failure is recovery
      // evidence, never evidence that a successful edge was not saved.
      console.error("Could not invalidate the note association cache", error);
    }
  }
  if (failedFields.length > 0) {
    throw new NoteContextLinkPartialError({ succeededFields, failedFields, safeCauses });
  }
}
