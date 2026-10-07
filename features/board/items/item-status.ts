"use client";

/**
 * Item status — each type's `status.use` hook (`BoardItemType.status`).
 *
 * Rules: read only what the app already holds (Redux slices the tile's own
 * body and `Keep` fill), select a PRIMITIVE so a tick elsewhere never
 * re-renders the chip, and return null when the item is at rest (a saved note,
 * an idle chat): a chip is there only when it says something.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/rootReducer";
import type { NodeSource } from "../board/document";
import type { ItemBasicValues, ItemStatus } from "./types";
import { selectNoteById } from "@/features/notes/redux/selectors";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import { selectTaskIsDirty } from "@/features/tasks/redux/taskUiSlice";
import { CLOSED_TASK_STATUSES, TASK_STATUS_META, normalizeTaskStatus } from "@/features/tasks/constants/status";
import { selectFileById } from "@/features/files/redux/selectors";
import { selectMeetingEntry } from "@/features/meet/redux/meetingsSlice";
import { RUN_STATUS_LABEL } from "@/features/workflow-runtime/run-status";

function basicText(basics: ItemBasicValues | null | undefined, key: string): string | undefined {
  const v = basics?.[key];
  return typeof v === "string" && v ? v : undefined;
}

function idOf(source: NodeSource): string | null {
  return source.kind === "entity" ? (source.id ?? null) : null;
}

/** Chat: replying, waiting on the person (a tool this page runs), failed. */
export function useChatStatus(source: NodeSource): ItemStatus | null {
  const id = idOf(source);
  const status = useAppSelector((s: RootState) => (id ? s.conversations?.byConversationId[id]?.status : undefined));
  if (status === "running" || status === "streaming") return { tone: "active", label: "Replying" };
  if (status === "paused") return { tone: "attention", label: "Waiting on you" };
  if (status === "error") return { tone: "danger", label: "Failed" };
  return null;
}

/** Note: saving, unsaved, not saved. A saved note is at rest. */
export function useNoteStatus(source: NodeSource): ItemStatus | null {
  const id = idOf(source);
  const state = useAppSelector((s: RootState) => {
    if (!id) return "draft";
    const n = selectNoteById(id)(s);
    if (!n) return "";
    if (n._error) return "error";
    if (n._saving) return "saving";
    if (n._dirty) return "dirty";
    return "";
  });
  if (state === "saving") return { tone: "active", label: "Saving" };
  if (state === "error") return { tone: "danger", label: "Not saved" };
  if (state === "dirty" || state === "draft") return { tone: "attention", label: "Unsaved" };
  return null;
}

/** Task: its lifecycle status, and Overdue when an open task is past its due date. */
export function useTaskStatus(source: NodeSource, basics?: ItemBasicValues | null): ItemStatus | null {
  const id = idOf(source);
  const live = useAppSelector((s: RootState) => (id ? selectTaskById(s, id)?.status : undefined));
  const liveDue = useAppSelector((s: RootState) => (id ? selectTaskById(s, id)?.due_date : undefined));
  // Edits staged in the task (the person's own, or an agent's approved change) wait for Save, exactly
  // as on the task's page: say so here, never the stale saved status.
  const unsaved = useAppSelector((s: RootState) => (id ? selectTaskIsDirty(id)(s) : false));
  if (!id) return { tone: "attention", label: "Unsaved" };
  if (unsaved) return { tone: "attention", label: "Unsaved" };
  // Not in the store (an overview the tile has not mounted for): the saved basics.
  const raw = live ?? basicText(basics, "active_task_status");
  const due = live !== undefined ? liveDue : basicText(basics, "active_task_due_date");
  if (raw === undefined) return null;
  const status = normalizeTaskStatus(raw);
  const open = !CLOSED_TASK_STATUSES.includes(status);
  if (open && due && Date.parse(due) < Date.now()) return { tone: "danger", label: "Overdue" };
  if (status === "completed") return { tone: "success", label: "Done" };
  if (status === "active") return { tone: "active", label: TASK_STATUS_META.active.label };
  if (status === "inbox") return { tone: "neutral", label: "To do" };
  return { tone: "neutral", label: TASK_STATUS_META[status].label };
}

/** Workflow run: working, needs input, needs attention, done, stopped. */
export function useWorkflowRunStatus(source: NodeSource, basics?: ItemBasicValues | null): ItemStatus | null {
  const id = idOf(source);
  const liveStatus = useAppSelector((s: RootState) => {
    const run = id ? s.workflowRuns?.byRunId[id] : undefined;
    return run?.statusKnown ? run.status : undefined;
  });
  const status = liveStatus ?? basicText(basics, "run_status");
  if (!status) return null;
  const label = RUN_STATUS_LABEL[status] ?? status;
  switch (status) {
    case "running":
    case "pausing":
    case "cancelling":
      return { tone: "active", label };
    case "paused":
    case "interrupted":
    case "awaiting_input":
      return { tone: "attention", label };
    case "errored":
    case "failed":
      return { tone: "danger", label };
    case "completed":
      return { tone: "success", label };
    default:
      return { tone: "neutral", label };
  }
}

/** Meeting: live, scheduled, ended (from the record `MeetingKeep` keeps current). */
export function useMeetingStatus(source: NodeSource, basics?: ItemBasicValues | null): ItemStatus | null {
  const id = idOf(source);
  const livePhase = useAppSelector((s: RootState) => {
    const m = id ? selectMeetingEntry(s, id)?.loaded?.meeting : undefined;
    if (!m) return "";
    if (m.endedAt) return "ended";
    if (m.startedAt) return "live";
    if (m.scheduledFor) return "scheduled";
    return "";
  });
  // Not loaded (the meeting record is read by the tile's own mount): the saved basics.
  const phase = livePhase || basicText(basics, "meeting_status") || "";
  if (phase === "live") return { tone: "active", label: "Live" };
  if (phase === "scheduled") return { tone: "neutral", label: "Scheduled" };
  if (phase === "ended") return { tone: "neutral", label: "Ended" };
  return null;
}

/** File: a failed read or upload. A file at rest says nothing. */
export function useFileStatus(source: NodeSource): ItemStatus | null {
  const id = source.kind === "file" ? source.fileId : idOf(source);
  const failed = useAppSelector((s: RootState) => (id ? !!selectFileById(s, id)?._error : false));
  return failed ? { tone: "danger", label: "Failed" } : null;
}
