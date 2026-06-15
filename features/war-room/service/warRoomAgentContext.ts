/**
 * features/war-room/service/warRoomAgentContext.ts
 *
 * Builds the READ-ONLY context objects that let a War Room tile's "Agent+"
 * assistant SEE the tile's own work — its Task (with subtasks), its active Note,
 * and its attached Files/Documents — as first-class context the agent can
 * `ctx_get` every turn.
 *
 * These are MERGED INTO (not replacing) the Scribe studio context that
 * `buildAssistantContextEntries` already produces for the tile's audio session.
 * The audio transcript is therefore already present as `session_cleaned` /
 * `all_raw`; we deliberately DO NOT duplicate it here.
 *
 * Why a separate builder (not folded into assistantContextBuilder): the studio
 * builder is shared with the Scribe studio, which has NO tile. Keeping the tile
 * entries here — passed in as `extraEntries` — keeps the shared scribe/studio
 * context pristine (Scribe passes nothing → it is unchanged).
 *
 * Naming contract (so the model understands the relationships, and so these
 * never collide with the studio keys recording_NN / session_cleaned / etc.):
 *   - `tile_task`   — the tile's task: title, status, priority, due date,
 *                     description, AND its subtasks. Omitted if the tile has no
 *                     task.
 *   - `tile_notes`  — the tile's active note (the same note the Notes tab
 *                     edits). Omitted if the tile has no note / the note is
 *                     empty of content AND has no label.
 *   - `tile_files`  — a concise readable list of the tile's attached files and
 *                     documents (name + kind). Omitted if nothing is attached.
 *
 * READ-ONLY: every value here is a plain data snapshot with no `mutable` /
 * `source` keys, so the server exposes only `ctx_get` for them — never
 * `ctx_patch`. (Editing tools come later; the only writable object in this
 * conversation remains `working_document`.) Priority emphasis in the
 * descriptions, per the spec: Tasks first, then Notes, then Files.
 */

import type { RootState } from "@/lib/redux/store";
import type { AssistantContextEntry } from "@/features/transcript-studio/service/assistantContextBuilder";
import {
  selectSubtasksByParent,
  selectTaskById,
  type TaskRecord,
} from "@/features/agent-context/redux/tasksSlice";
import { selectNoteById } from "@/features/notes/redux/selectors";
import {
  selectActiveNoteId,
  selectAttachmentsForTile,
  selectTileById,
} from "@/features/war-room/redux/selectors";

// ── Read-only value shapes (plain data — no `mutable`/`source` ⇒ ctx_get only) ──

interface TileTaskContextValue {
  type: "task";
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  description: string | null;
  subtasks: {
    id: string;
    title: string;
    status: string;
    priority: string | null;
    due_date: string | null;
  }[];
  /** Model-facing read-only + priority hint, carried in the value so it
   *  survives even if the host strips unknown entry-level keys. */
  _hint: string;
}

interface TileNoteContextValue {
  type: "note";
  id: string;
  label: string | null;
  content: string;
  _hint: string;
}

interface TileFilesContextValue {
  type: "file_list";
  count: number;
  files: { kind: "file" | "document"; name: string }[];
  _hint: string;
}

function toSubtaskValue(t: TaskRecord): TileTaskContextValue["subtasks"][number] {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due_date: t.due_date,
  };
}

/**
 * Build the READ-ONLY tile context entries (task, notes, files) for one tile.
 * Returns an empty array when the tile has nothing to show — callers pass these
 * as `extraEntries` to `buildAssistantContextEntries`, which (combined with the
 * no-empty-push guard in useStudioAssistant) means an empty result never wipes
 * anything.
 *
 * All data is read straight from Redux (already hydrated on room load:
 * hydrateTileTasks for the parent task, loadTileSubtasks for subtasks, the notes
 * slice for note content, attachmentsByTile for attachments). This never
 * refetches what Redux already holds.
 */
export function buildTileAgentContextEntries(
  state: RootState,
  tileId: string,
): AssistantContextEntry[] {
  const entries: AssistantContextEntry[] = [];

  const tile = selectTileById(tileId)(state);
  if (!tile) return entries;

  // ── tile_task (highest priority) ──────────────────────────────────────
  // No mutable/source on the value ⇒ the server exposes only ctx_get for it
  // (the agent can read it, not edit it). Priority emphasis lives in `_hint`.
  const taskId = tile.task_id;
  if (taskId) {
    const task = selectTaskById(state, taskId);
    if (task) {
      const subtasks = selectSubtasksByParent(state, taskId).map(toSubtaskValue);
      const subtaskNote =
        subtasks.length > 0
          ? ` It has ${subtasks.length} subtask(s) in \`subtasks\`.`
          : "";
      const value: TileTaskContextValue = {
        type: "task",
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority ?? null,
        due_date: task.due_date ?? null,
        description: task.description ?? null,
        subtasks,
        _hint:
          "READ-ONLY. The primary work item for this tile — prioritize it." +
          subtaskNote,
      };
      entries.push({
        key: "tile_task",
        value,
        type: "text",
        label: "This tile's task (read-only)",
      });
    }
  }

  // ── tile_notes (second priority) ──────────────────────────────────────
  const noteId = selectActiveNoteId(tileId)(state) ?? tile.note_id ?? null;
  if (noteId) {
    const note = selectNoteById(noteId)(state);
    const content = (note?.content ?? "").trim();
    const label = note?.label ?? null;
    // Omit a note that has neither content nor a meaningful label.
    if (content || (label && label !== "War Room note")) {
      const value: TileNoteContextValue = {
        type: "note",
        id: noteId,
        label,
        content,
        _hint: "READ-ONLY. The user's working note for this tile.",
      };
      entries.push({
        key: "tile_notes",
        value,
        type: "text",
        label: "This tile's note (read-only)",
      });
    }
  }

  // ── tile_files (third priority) ───────────────────────────────────────
  const attachments = selectAttachmentsForTile(tileId)(state);
  if (attachments.length > 0) {
    const files = attachments.map((a) => ({
      kind: (a.entity_type === "document" ? "document" : "file") as
        | "file"
        | "document",
      name:
        (a.label && a.label.trim()) ||
        (a.entity_type === "document" ? "Untitled document" : "File"),
    }));
    const value: TileFilesContextValue = {
      type: "file_list",
      count: files.length,
      files,
      _hint:
        "READ-ONLY. Files and documents the user attached to this tile " +
        "(names only).",
    };
    entries.push({
      key: "tile_files",
      value,
      type: "text",
      label: "This tile's files & documents (read-only)",
    });
  }

  return entries;
}
