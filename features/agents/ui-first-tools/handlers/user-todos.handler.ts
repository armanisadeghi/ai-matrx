/**
 * `user_todos` handler — items the agent assigns BACK to the user. The agent
 * adds them; the user checks them off in the UI; the agent sees the change
 * in next-turn context.
 *
 * `silent: true` suppresses the toast notification on add — matches the
 * extension's option. Default behavior shows a sonner toast so the user
 * notices that the agent has assigned them something.
 */

import { toast } from "sonner";
import type { ToolHandler } from "./types";
import type { UserTodosArgs } from "../tools/schemas";
import type { UserTodosResult, CxUserTodoRow } from "../tools/types";
import {
  listUserTodos,
  addUserTodo,
  updateUserTodo,
  removeUserTodo,
  clearDoneUserTodos,
} from "../service/user-todo.service";
import {
  upsertUserTodo,
  setUserTodos,
  removeUserTodo as removeUserTodoAction,
} from "../redux/agent-lists.slice";

function summarize(rows: CxUserTodoRow[]): {
  open: UserTodosResult["open"];
  recent_done: UserTodosResult["recent_done"];
} {
  const open: UserTodosResult["open"] = [];
  const done: CxUserTodoRow[] = [];
  for (const r of rows) {
    if (r.done) done.push(r);
    else
      open.push({
        id: r.id,
        title: r.title,
        context: r.context,
        due: r.due,
      });
  }
  // Latest 5 done items (matches extension contract).
  const recent_done = done
    .sort((a, b) => {
      const ax = a.done_at ?? "";
      const bx = b.done_at ?? "";
      return bx.localeCompare(ax);
    })
    .slice(0, 5)
    .map((r) => ({ id: r.id, title: r.title, done_at: r.done_at ?? "" }));
  return { open, recent_done };
}

export const userTodosHandler: ToolHandler<UserTodosArgs, UserTodosResult> = {
  name: "user_todos",
  async run(args, ctx) {
    const { conversationId, userId, dispatch } = ctx;

    switch (args.action) {
      case "list": {
        const rows = await listUserTodos(conversationId);
        dispatch(setUserTodos({ conversationId, userTodos: rows }));
        return { ok: true, action: "list", ...summarize(rows) };
      }

      case "add": {
        if (!args.title) {
          return {
            ok: false,
            action: "add",
            open: [],
            recent_done: [],
            message: "title is required",
          };
        }
        const row = await addUserTodo({
          conversation_id: conversationId,
          user_id: userId,
          title: args.title,
          context: args.context ?? null,
          due: args.due ?? null,
        });
        dispatch(upsertUserTodo(row));
        if (!args.silent) {
          toast.info("New item from agent", {
            description: row.title,
          });
        }
        const all = await listUserTodos(conversationId);
        return {
          ok: true,
          action: "add",
          ...summarize(all),
          created: [{ id: row.id, title: row.title }],
        };
      }

      case "update": {
        if (!args.id) {
          return {
            ok: false,
            action: "update",
            open: [],
            recent_done: [],
            message: "id is required",
          };
        }
        const patch: Parameters<typeof updateUserTodo>[1] = {};
        if (args.title) patch.title = args.title;
        if (args.context !== undefined) patch.context = args.context ?? null;
        if (args.due !== undefined) patch.due = args.due ?? null;
        if (args.done !== undefined) patch.done = args.done;
        const row = await updateUserTodo(args.id, patch);
        if (row) dispatch(upsertUserTodo(row));
        const all = await listUserTodos(conversationId);
        return { ok: true, action: "update", ...summarize(all) };
      }

      case "mark_done": {
        if (!args.id) {
          return {
            ok: false,
            action: "mark_done",
            open: [],
            recent_done: [],
            message: "id is required",
          };
        }
        const row = await updateUserTodo(args.id, { done: true });
        if (row) dispatch(upsertUserTodo(row));
        const all = await listUserTodos(conversationId);
        return { ok: true, action: "mark_done", ...summarize(all) };
      }

      case "remove": {
        if (!args.id) {
          return {
            ok: false,
            action: "remove",
            open: [],
            recent_done: [],
            message: "id is required",
          };
        }
        await removeUserTodo(args.id);
        dispatch(removeUserTodoAction({ conversationId, id: args.id }));
        const all = await listUserTodos(conversationId);
        return {
          ok: true,
          action: "remove",
          ...summarize(all),
          removed: [args.id],
        };
      }

      case "clear_done": {
        const removedIds = await clearDoneUserTodos(conversationId);
        for (const id of removedIds) {
          dispatch(removeUserTodoAction({ conversationId, id }));
        }
        const all = await listUserTodos(conversationId);
        return {
          ok: true,
          action: "clear_done",
          ...summarize(all),
          removed: removedIds,
        };
      }
    }
  },
};
