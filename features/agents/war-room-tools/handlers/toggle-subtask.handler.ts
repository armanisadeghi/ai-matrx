/**
 * `war_room_toggle_subtask` handler — flip (or set) a subtask's completion.
 *
 * The agent passes a `subtask_id` it saw in the tile's read-only
 * `tile_task.subtasks` context. We guard that the id is actually a subtask of
 * THIS tile's task (never let the agent toggle an arbitrary task by id), then:
 *   - explicit `completed` target → deterministic `updateTaskFieldThunk`
 *     (idempotent: if it already matches, the write is a harmless no-op).
 *   - no target → `toggleTaskCompleteThunk` (flips current status).
 *
 * Both writers persist to `ctx_tasks` and optimistically update the
 * agent-context `tasks` slice, so the Task tab's subtask checkbox updates live.
 */

import type { WarRoomToolHandler } from "./types";
import type {
  WarRoomToggleSubtaskArgs,
  WarRoomToggleSubtaskResult,
} from "../tools/schemas";
import {
  toggleTaskCompleteThunk,
  updateTaskFieldThunk,
} from "@/features/tasks/redux/thunks";
import { loadTileSubtasks } from "@/features/war-room/redux/thunks";
import { selectTileById } from "@/features/war-room/redux/selectors";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";

export const toggleSubtaskHandler: WarRoomToolHandler<
  WarRoomToggleSubtaskArgs,
  WarRoomToggleSubtaskResult
> = {
  name: "war_room_toggle_subtask",
  async run(args, ctx) {
    const { tileId, dispatch, getState } = ctx;

    const tile = selectTileById(tileId)(getState());
    const taskId = tile?.task_id ?? null;
    if (!taskId) {
      return { ok: false, message: "This tile has no task." };
    }

    const subtask = selectTaskById(getState(), args.subtask_id);
    if (!subtask || subtask.parent_task_id !== taskId) {
      return {
        ok: false,
        message: `Subtask ${args.subtask_id} is not a subtask of this tile's task.`,
      };
    }

    const targetCompleted = args.completed;
    if (targetCompleted === undefined) {
      await dispatch(toggleTaskCompleteThunk({ taskId: args.subtask_id }));
    } else {
      const desired = targetCompleted ? "completed" : "incomplete";
      if (subtask.status !== desired) {
        await dispatch(
          updateTaskFieldThunk({
            taskId: args.subtask_id,
            patch: { status: desired },
          }),
        );
      }
    }

    void dispatch(loadTileSubtasks(taskId));

    const updated = selectTaskById(getState(), args.subtask_id);
    return {
      ok: true,
      subtask: updated
        ? { id: updated.id, title: updated.title, status: updated.status }
        : undefined,
    };
  },
};
