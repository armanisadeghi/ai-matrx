/**
 * `war_room_add_subtask` handler — add a subtask under the tile's primary task.
 *
 * Calls the REAL `createSubtaskThunk` (features/tasks), which creates a child
 * `ctx_tasks` row (inheriting the parent's org/project) and upserts it into the
 * agent-context `tasks` slice — so the tile's Task tab subtask list updates
 * live. Also nudges the war-room `loadTileSubtasks` so the panel's read-only
 * `tile_task.subtasks` context is consistent on the next turn.
 */

import type { WarRoomToolHandler } from "./types";
import type {
  WarRoomAddSubtaskArgs,
  WarRoomAddSubtaskResult,
} from "../tools/schemas";
import { createSubtaskThunk } from "@/features/tasks/redux/thunks";
import { loadTileSubtasks } from "@/features/war-room/redux/thunks";
import { selectTileById } from "@/features/war-room/redux/selectors";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";

export const addSubtaskHandler: WarRoomToolHandler<
  WarRoomAddSubtaskArgs,
  WarRoomAddSubtaskResult
> = {
  name: "war_room_add_subtask",
  async run(args, ctx) {
    const { tileId, dispatch, getState } = ctx;

    const tile = selectTileById(tileId)(getState());
    const taskId = tile?.task_id ?? null;
    if (!taskId) {
      return {
        ok: false,
        message:
          "This tile has no task yet, so it can't have subtasks. Ask the user to add a task first.",
      };
    }

    const newId = await dispatch(
      createSubtaskThunk({
        parentTaskId: taskId,
        title: args.title,
        description: args.description ?? null,
      }),
    ).unwrap();

    if (!newId) {
      return { ok: false, message: "Failed to create the subtask." };
    }

    // Keep the read-only subtask context in lockstep for the next turn.
    void dispatch(loadTileSubtasks(taskId));

    const created = selectTaskById(getState(), newId);
    return {
      ok: true,
      subtask: created
        ? { id: created.id, title: created.title, status: created.status }
        : { id: newId, title: args.title, status: "incomplete" },
    };
  },
};
