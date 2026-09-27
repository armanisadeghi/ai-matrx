"use client";

// features/meet/hooks/useActionItemTasks.ts
//
// ACTION ITEMS → PLATFORM TASKS (Meet wave 3). An action item the wrap-up wrote
// becomes a real `workspace.tasks` row through the ONE task writer
// (`createTask`), carrying its provenance on the task itself:
//
//   source_type = "meet_note", source_id = the action item's row id,
//   source_url  = the meeting's record, source_label = the meeting title,
//   dedupe_key  = "meet_note:<id>" — the (organization, dedupe_key) unique
//                 index makes a double click, two tabs, or "Create all" after
//                 one-by-one creation land ONE task, never two.
//
// No new table: the link IS the task's own provenance columns, and the state
// comes back the same way — a read of the tasks whose source is these action
// items. Done in Tasks shows done here; the read re-runs when the tab regains
// focus, so finishing a task elsewhere and coming back is enough.

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { createTask } from "@/features/tasks/services/taskService";
import type { TaskStatus } from "@/features/tasks/constants/status";

export const MEET_NOTE_SOURCE = "meet_note";

export interface LinkedTask {
  readonly id: string;
  readonly status: TaskStatus;
  readonly dueDate: string | null;
  readonly assigneeId: string | null;
  readonly title: string;
}

export interface ActionItemInput {
  readonly noteId: string;
  readonly text: string;
  readonly ownerName: string | null;
}

export interface CreateFromActionItem {
  readonly item: ActionItemInput;
  readonly assigneeId: string | null;
  readonly dueDate: string | null;
}

export function dedupeKeyFor(noteId: string): string {
  return `${MEET_NOTE_SOURCE}:${noteId}`;
}

/** The task title: the action item itself, trimmed to what a task list shows. */
export function taskTitleFor(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length <= 200 ? clean : `${clean.slice(0, 197)}…`;
}

export function taskDescriptionFor(args: {
  meetingTitle: string;
  when: string;
  ownerName: string | null;
  text: string;
}): string {
  const lines = [`From the meeting “${args.meetingTitle}” (${args.when}).`];
  if (args.ownerName) lines.push(`Owner named in the meeting: ${args.ownerName}.`);
  if (args.text.trim().length > 200) lines.push("", args.text.trim());
  return lines.join("\n");
}

export function useActionItemTasks(args: {
  meetingId: string;
  meetingTitle: string;
  organizationId: string;
  when: string;
  noteIds: readonly string[];
}) {
  const { meetingId, meetingTitle, organizationId, when } = args;
  const idsKey = [...args.noteIds].sort().join(",");
  const [tasks, setTasks] = useState<ReadonlyMap<string, LinkedTask>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [creating, setCreating] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const ids = idsKey === "" ? [] : idsKey.split(",");
    if (ids.length === 0) {
      setTasks(new Map());
      setLoading(false);
      return undefined;
    }
    let live = true;
    void workspaceDb(supabase)
      .from("tasks")
      .select("id,status,due_date,assignee_id,title,source_id")
      .eq("source_type", MEET_NOTE_SOURCE)
      .in("source_id", ids)
      .is("deleted_at", null)
      .then(({ data, error }) => {
        if (!live) return;
        setLoading(false);
        if (error) {
          setFailure(`The linked tasks could not be read (${error.message}).`);
          return;
        }
        setFailure(null);
        const next = new Map<string, LinkedTask>();
        for (const row of data ?? []) {
          if (!row.source_id) continue;
          next.set(row.source_id, {
            id: row.id,
            status: row.status as TaskStatus,
            dueDate: row.due_date,
            assigneeId: row.assignee_id,
            title: row.title,
          });
        }
        setTasks(next);
      });
    return () => {
      live = false;
    };
  }, [idsKey, nonce]);

  // Done in Tasks shows done here: re-read when the person comes back.
  useEffect(() => {
    const onFocus = () => setNonce((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const createOne = async ({
    item,
    assigneeId,
    dueDate,
  }: CreateFromActionItem): Promise<boolean> => {
    setCreating((s) => new Set(s).add(item.noteId));
    try {
      const task = await createTask({
        title: taskTitleFor(item.text),
        description: taskDescriptionFor({
          meetingTitle,
          when,
          ownerName: item.ownerName,
          text: item.text,
        }),
        assignee_id: assigneeId,
        due_date: dueDate,
        organization_id: organizationId,
        origin: "user",
        source_type: MEET_NOTE_SOURCE,
        source_id: item.noteId,
        source_url: `/meetings/${meetingId}?tab=record&note=${item.noteId}`,
        source_label: meetingTitle,
        dedupe_key: dedupeKeyFor(item.noteId),
      });
      // A null is either a real failure (createTask already said so) or the
      // dedupe index refusing a second copy; the re-read tells which.
      setNonce((n) => n + 1);
      return task !== null;
    } finally {
      setCreating((s) => {
        const next = new Set(s);
        next.delete(item.noteId);
        return next;
      });
    }
  };

  return {
    tasks,
    loading,
    failure,
    creating,
    createOne,
    reload: () => setNonce((n) => n + 1),
  };
}
