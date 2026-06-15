/**
 * `war_room_update_task` handler — patch the tile's primary task.
 *
 * Resolves the tile's `task_id` from the war-room slice, then writes via the
 * REAL `updateTaskFieldThunk` (features/tasks) which:
 *   - persists to `ctx_tasks` through `taskService.updateTask`, and
 *   - optimistically upserts the agent-context `tasks` slice,
 * so the tile's Task tab (and any other open task surface) reflects the change
 * live — no refetch, no war-room-specific mirror.
 *
 * If the tile has no task yet, we do NOT silently create one (creating the
 * tile's anchor task is a deliberate user action) — we return a clear,
 * non-error result so the agent can ask the user to add a task first.
 */

import type { WarRoomToolHandler } from "./types";
import type {
  WarRoomUpdateTaskArgs,
  WarRoomUpdateTaskResult,
} from "../tools/schemas";
import { updateTaskFieldThunk } from "@/features/tasks/redux/thunks";
import type { UpdateTaskInput } from "@/features/tasks/services/taskService";
import { selectTileById } from "@/features/war-room/redux/selectors";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";

export const updateTaskHandler: WarRoomToolHandler<
  WarRoomUpdateTaskArgs,
  WarRoomUpdateTaskResult
> = {
  name: "war_room_update_task",
  async run(args, ctx) {
    const { tileId, dispatch, getState } = ctx;

    const tile = selectTileById(tileId)(getState());
    const taskId = tile?.task_id ?? null;
    if (!taskId) {
      return {
        ok: false,
        message:
          "This tile has no task yet. Ask the user to add a task to the tile first.",
      };
    }

    // Translate validated args → the task writer's patch shape (1:1 fields).
    const patch: UpdateTaskInput = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.status !== undefined) patch.status = args.status;
    if (args.description !== undefined) patch.description = args.description;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.due_date !== undefined) patch.due_date = args.due_date;

    await dispatch(updateTaskFieldThunk({ taskId, patch }));

    // Read the freshly-upserted record back from the slice for the result.
    const updated = selectTaskById(getState(), taskId);
    return {
      ok: true,
      task: updated
        ? {
            id: updated.id,
            title: updated.title,
            status: updated.status,
            priority: updated.priority ?? null,
            due_date: updated.due_date ?? null,
          }
        : undefined,
    };
  },
};
