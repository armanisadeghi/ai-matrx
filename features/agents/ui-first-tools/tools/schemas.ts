/**
 * UI-first tool argument schemas. Ported verbatim from the matrx-extend
 * Chrome extension (see /matrx-extend/src/lib/tools/handlers/{user,lists}.ts).
 *
 * Keep these in sync with the extension's schemas — both surfaces must
 * accept the same tool call shape so the aidream backend doesn't need to
 * differentiate between callers. The Zod schemas live HERE so the
 * dispatcher can validate every delegated call before invoking the handler.
 *
 * Shape inventory:
 *   - userArgsSchema             — confirm | choice | choice_many | text | secret | notify
 *   - updatePlanArgsSchema       — title + steps[] + optional reasoning / domains
 *   - requestTakeoverArgsSchema  — reason + expected_action? + instructions?
 *   - tasksArgsSchema            — eight actions on cx_agent_task
 *   - userTodosArgsSchema        — six actions on cx_user_todo
 *   - memoryArgsSchema           — get | set | list | delete on cx_agent_memory
 *   - storageArgsSchema          — get | set | list | delete on agent_user_kv
 *
 * Plus the response envelopes the dispatcher emits back to the server.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// user — the ask-user mega-tool
// ─────────────────────────────────────────────────────────────────────────────

export const userArgsSchema = z
  .object({
    type: z.enum(["confirm", "choice", "choice_many", "text", "secret", "notify"]),
    question: z.string().optional(),
    options: z.array(z.string().min(1)).optional(),
    context: z.string().optional(),
    message: z.string().optional(),
    actions: z.array(z.string().min(1)).optional(),
    level: z.enum(["info", "success", "warning", "error"]).optional(),
    timeout_seconds: z.number().int().min(1).max(900).optional(),
  })
  .superRefine((v, ctx) => {
    const needsQuestion =
      v.type === "confirm" ||
      v.type === "choice" ||
      v.type === "choice_many" ||
      v.type === "text" ||
      v.type === "secret";
    if (needsQuestion && !v.question) {
      ctx.addIssue({
        code: "custom",
        message: `question is required when type='${v.type}'`,
      });
    }
    if (v.type === "notify" && !v.message) {
      ctx.addIssue({
        code: "custom",
        message: "message is required when type='notify'",
      });
    }
    if (
      (v.type === "choice" || v.type === "choice_many") &&
      (!v.options || v.options.length < 2)
    ) {
      ctx.addIssue({
        code: "custom",
        message: `options must have at least 2 entries when type='${v.type}'`,
      });
    }
  });

export type UserArgs = z.infer<typeof userArgsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// update_plan
// ─────────────────────────────────────────────────────────────────────────────

export const updatePlanArgsSchema = z
  .object({
    title: z.string().optional(),
    steps: z.array(z.string().min(1)).min(1).max(40).optional(),
    // Aidream variants emit `approach` instead of `steps` — accept both.
    approach: z.array(z.string().min(1)).min(1).max(40).optional(),
    domains: z.array(z.string()).optional(),
    reasoning: z.string().optional(),
    estimated_minutes: z.number().int().positive().max(240).optional(),
    timeout_seconds: z
      .number()
      .int()
      .positive()
      .max(15 * 60)
      .optional(),
  })
  .refine((v) => v.steps != null || v.approach != null, {
    message: "either steps or approach is required",
  });

export type UpdatePlanArgs = z.infer<typeof updatePlanArgsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// request_user_takeover
// ─────────────────────────────────────────────────────────────────────────────

export const requestTakeoverArgsSchema = z.object({
  reason: z.string().min(1),
  expected_action: z.string().optional(),
  instructions: z.string().optional(),
  timeout_seconds: z.number().int().min(1).max(900).optional(),
});

export type RequestTakeoverArgs = z.infer<typeof requestTakeoverArgsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// tasks — agent's own tasklist
// ─────────────────────────────────────────────────────────────────────────────

const taskItemInputSchema = z.object({
  title: z.string().min(1).max(200),
  status: z
    .enum(["pending", "in_progress", "done", "blocked", "skipped"])
    .optional(),
  note: z.string().max(500).nullable().optional(),
});

export const tasksArgsSchema = z.object({
  action: z.enum([
    "add",
    "list",
    "set_status",
    "update",
    "remove",
    "reorder",
    "clear_completed",
    "clear_all",
  ]),
  // add / update fields
  title: z.string().min(1).max(200).optional(),
  items: z.array(taskItemInputSchema).max(40).optional(),
  id: z.string().optional(),
  status: z
    .enum(["pending", "in_progress", "done", "blocked", "skipped"])
    .optional(),
  note: z.string().max(500).nullable().optional(),
  // reorder
  ids: z.array(z.string()).optional(),
});

export type TasksArgs = z.infer<typeof tasksArgsSchema>;
export type TaskStatus = z.infer<typeof taskItemInputSchema>["status"];

// ─────────────────────────────────────────────────────────────────────────────
// user_todos — items the agent assigns BACK to the user
// ─────────────────────────────────────────────────────────────────────────────

export const userTodosArgsSchema = z.object({
  action: z.enum([
    "add",
    "list",
    "update",
    "remove",
    "mark_done",
    "clear_done",
  ]),
  title: z.string().min(1).max(200).optional(),
  context: z.string().max(300).nullable().optional(),
  due: z.string().max(80).nullable().optional(),
  id: z.string().optional(),
  silent: z.boolean().optional(),
  done: z.boolean().optional(),
});

export type UserTodosArgs = z.infer<typeof userTodosArgsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// memory / storage — KV stores
// ─────────────────────────────────────────────────────────────────────────────

export const memoryArgsSchema = z.object({
  action: z.enum(["get", "set", "list", "delete"]),
  key: z.string().min(1).max(120).optional(),
  value: z.unknown().optional(),
});
export type MemoryArgs = z.infer<typeof memoryArgsSchema>;

export const storageArgsSchema = z.object({
  action: z.enum(["get", "set", "list", "delete"]),
  key: z.string().min(1).max(120).optional(),
  value: z.unknown().optional(),
});
export type StorageArgs = z.infer<typeof storageArgsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Response envelopes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unified ask-user response envelope (matches the matrx-extend contract).
 * Exactly one of {answer, selected, confirmed, action+freeform} is populated
 * for non-cancelled / non-timed-out responses, depending on the input `type`.
 */
export interface AskUserResponse {
  answer: string | null;
  selected: string[] | null;
  confirmed: boolean | null;
  action: string | null;
  freeform: string | null;
  cancelled: boolean;
  timed_out: boolean;
}

export const EMPTY_ASK_RESPONSE: AskUserResponse = {
  answer: null,
  selected: null,
  confirmed: null,
  action: null,
  freeform: null,
  cancelled: false,
  timed_out: false,
};
