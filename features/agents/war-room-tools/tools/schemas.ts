/**
 * War Room tool argument schemas + result envelopes.
 *
 * One schema per tool. The dispatcher validates every delegated call against
 * these before requesting human approval and invoking the handler. Field shapes
 * mirror the REAL underlying writers so the handler can pass them through
 * without translation:
 *   - task fields  → `ctx_tasks` (status `incomplete | completed`, priority
 *     `low | medium | high`, `due_date` an ISO date string or null).
 *   - note content → `notes` (content / label).
 *   - tile rename  → `ctx_war_room_tiles.title`.
 *
 * Keep these tight: the agent edits the USER's live work, so every arg is
 * validated and every write is HITL-gated in the dispatcher.
 */

import { z } from "zod";

// Shared scalar shapes (match ctx_tasks exactly).
const taskStatusSchema = z.enum(["incomplete", "completed"]);
const taskPrioritySchema = z.enum(["low", "medium", "high"]);
/** ISO date (YYYY-MM-DD) or full timestamp; null clears. Loose on format —
 *  the column is a date and Supabase coerces; we only guard the type. */
const dueDateSchema = z.string().min(1).max(40).nullable();

// ─────────────────────────────────────────────────────────────────────────────
// war_room_update_task — patch the tile's primary task
// ─────────────────────────────────────────────────────────────────────────────

export const warRoomUpdateTaskArgsSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    status: taskStatusSchema.optional(),
    description: z.string().max(20000).nullable().optional(),
    priority: taskPrioritySchema.nullable().optional(),
    due_date: dueDateSchema.optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.status !== undefined ||
      v.description !== undefined ||
      v.priority !== undefined ||
      v.due_date !== undefined,
    { message: "at least one field to update is required" },
  );

export type WarRoomUpdateTaskArgs = z.infer<typeof warRoomUpdateTaskArgsSchema>;

export interface WarRoomUpdateTaskResult {
  ok: boolean;
  task?: {
    id: string;
    title: string;
    status: string;
    priority: string | null;
    due_date: string | null;
  };
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// war_room_add_subtask — add a subtask under the tile's primary task
// ─────────────────────────────────────────────────────────────────────────────

export const warRoomAddSubtaskArgsSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(20000).nullable().optional(),
});

export type WarRoomAddSubtaskArgs = z.infer<typeof warRoomAddSubtaskArgsSchema>;

export interface WarRoomAddSubtaskResult {
  ok: boolean;
  subtask?: { id: string; title: string; status: string };
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// war_room_toggle_subtask — flip a subtask's completion
// ─────────────────────────────────────────────────────────────────────────────

export const warRoomToggleSubtaskArgsSchema = z.object({
  /** The subtask's ctx_tasks id (the agent sees these in `tile_task.subtasks`). */
  subtask_id: z.string().min(1),
  /** Target completion. Omit to toggle the current value. */
  completed: z.boolean().optional(),
});

export type WarRoomToggleSubtaskArgs = z.infer<
  typeof warRoomToggleSubtaskArgsSchema
>;

export interface WarRoomToggleSubtaskResult {
  ok: boolean;
  subtask?: { id: string; title: string; status: string };
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// war_room_update_note — replace / append the tile's active note content
// ─────────────────────────────────────────────────────────────────────────────

export const warRoomUpdateNoteArgsSchema = z
  .object({
    /** New body. With mode='replace' this becomes the note; with 'append' it
     *  is added after the existing content (a blank line between). */
    content: z.string().max(100000).optional(),
    /** Optional new label/title for the note. */
    label: z.string().min(1).max(300).optional(),
    mode: z.enum(["replace", "append"]).optional(),
  })
  .refine((v) => v.content !== undefined || v.label !== undefined, {
    message: "content or label is required",
  });

export type WarRoomUpdateNoteArgs = z.infer<typeof warRoomUpdateNoteArgsSchema>;

export interface WarRoomUpdateNoteResult {
  ok: boolean;
  note?: { id: string; label: string | null; length: number };
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// war_room_update_thread — rename the tile (the room's entry for this work item)
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: ctx_war_room_tiles has only a `title` column (no description). A tile's
// descriptive content lives on its task/note, which `war_room_update_task` /
// `war_room_update_note` cover. So this tool renames the tile only.

export const warRoomUpdateThreadArgsSchema = z.object({
  /** New tile title. Empty string is rejected; clear-to-default is not a tool op. */
  title: z.string().min(1).max(300),
});

export type WarRoomUpdateThreadArgs = z.infer<typeof warRoomUpdateThreadArgsSchema>;

export interface WarRoomUpdateThreadResult {
  ok: boolean;
  tile?: { id: string; title: string | null };
  message?: string;
}
