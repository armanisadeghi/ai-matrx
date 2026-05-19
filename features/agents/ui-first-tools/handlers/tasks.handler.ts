/**
 * `tasks` handler — eight actions on cx_agent_task. All CRUD goes through
 * the service layer; the live mirror slice is kept fresh via Supabase
 * Realtime subscriptions, so handlers don't need to dispatch manual upserts
 * (though local optimistic updates are fine for write-then-read-back UX).
 */

import type { ToolHandler } from "./types";
import type { TasksArgs } from "../tools/schemas";
import type { TasksResult, CxAgentTaskRow } from "../tools/types";
import {
  listTasks,
  addTasks,
  updateTask,
  removeTask,
  reorderTasks,
  clearCompletedTasks,
  clearAllTasks,
} from "../service/agent-task.service";
import {
  upsertTask,
  setTasks,
  removeTask as removeTaskAction,
} from "../redux/agent-lists.slice";

function summarize(rows: CxAgentTaskRow[]): TasksResult["tasks"] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    note: r.note,
  }));
}

export const tasksHandler: ToolHandler<TasksArgs, TasksResult> = {
  name: "tasks",
  async run(args, ctx) {
    const { conversationId, userId, dispatch } = ctx;

    switch (args.action) {
      case "list": {
        const rows = await listTasks(conversationId);
        dispatch(setTasks({ conversationId, tasks: rows }));
        return { ok: true, action: "list", tasks: summarize(rows) };
      }

      case "add": {
        const inputs =
          args.items?.map((item) => ({
            conversation_id: conversationId,
            user_id: userId,
            title: item.title,
            status: item.status ?? "pending",
            note: item.note ?? null,
            created_by: "agent" as const,
          })) ??
          (args.title
            ? [
                {
                  conversation_id: conversationId,
                  user_id: userId,
                  title: args.title,
                  status: args.status ?? "pending",
                  note: args.note ?? null,
                  created_by: "agent" as const,
                },
              ]
            : []);
        if (inputs.length === 0) {
          return {
            ok: false,
            action: "add",
            tasks: [],
            message: "no items provided",
          };
        }
        const created = await addTasks(inputs);
        for (const row of created) dispatch(upsertTask(row));
        const all = await listTasks(conversationId);
        return {
          ok: true,
          action: "add",
          tasks: summarize(all),
          created: created.map((r) => ({
            id: r.id,
            title: r.title,
            status: r.status,
          })),
        };
      }

      case "set_status": {
        if (!args.id || !args.status) {
          return {
            ok: false,
            action: "set_status",
            tasks: [],
            message: "id and status are required",
          };
        }
        const row = await updateTask(args.id, { status: args.status });
        if (row) dispatch(upsertTask(row));
        const all = await listTasks(conversationId);
        return { ok: true, action: "set_status", tasks: summarize(all) };
      }

      case "update": {
        if (!args.id) {
          return {
            ok: false,
            action: "update",
            tasks: [],
            message: "id is required",
          };
        }
        const patch: Parameters<typeof updateTask>[1] = {};
        if (args.title) patch.title = args.title;
        if (args.status) patch.status = args.status;
        if (args.note !== undefined) patch.note = args.note ?? null;
        const row = await updateTask(args.id, patch);
        if (row) dispatch(upsertTask(row));
        const all = await listTasks(conversationId);
        return { ok: true, action: "update", tasks: summarize(all) };
      }

      case "remove": {
        if (!args.id) {
          return {
            ok: false,
            action: "remove",
            tasks: [],
            message: "id is required",
          };
        }
        await removeTask(args.id);
        dispatch(removeTaskAction({ conversationId, id: args.id }));
        const all = await listTasks(conversationId);
        return {
          ok: true,
          action: "remove",
          tasks: summarize(all),
          removed: [args.id],
        };
      }

      case "reorder": {
        if (!args.ids || args.ids.length === 0) {
          return {
            ok: false,
            action: "reorder",
            tasks: [],
            message: "ids is required",
          };
        }
        const rows = await reorderTasks(conversationId, args.ids);
        dispatch(setTasks({ conversationId, tasks: rows }));
        return { ok: true, action: "reorder", tasks: summarize(rows) };
      }

      case "clear_completed": {
        const removedIds = await clearCompletedTasks(conversationId);
        for (const id of removedIds) {
          dispatch(removeTaskAction({ conversationId, id }));
        }
        const all = await listTasks(conversationId);
        return {
          ok: true,
          action: "clear_completed",
          tasks: summarize(all),
          removed: removedIds,
        };
      }

      case "clear_all": {
        await clearAllTasks(conversationId);
        dispatch(setTasks({ conversationId, tasks: [] }));
        return { ok: true, action: "clear_all", tasks: [] };
      }
    }
  },
};
