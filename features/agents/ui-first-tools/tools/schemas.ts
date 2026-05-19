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

/**
 * Rich option shape — string for legacy callers, object for new callers.
 * Handlers normalize to `{label, description?, preview?}` before the
 * card sees it.
 */
const optionInputSchema = z.union([
  z.string().min(1),
  z.object({
    label: z.string().min(1),
    description: z.string().optional(),
    preview: z.string().optional(),
  }),
]);

export type UserAskOptionInput = z.infer<typeof optionInputSchema>;

/** Normalized option shape used by the UI. */
export interface UserAskOption {
  label: string;
  description?: string;
  preview?: string;
}

/** Normalize bare-string options to the rich shape. */
export function normalizeAskOptions(
  raw: UserAskOptionInput[] | undefined,
): UserAskOption[] | undefined {
  if (!raw) return undefined;
  return raw.map((o) =>
    typeof o === "string"
      ? { label: o }
      : { label: o.label, description: o.description, preview: o.preview },
  );
}

const USER_ASK_TYPES = [
  "confirm",
  "choice",
  "choice_many",
  "text",
  "secret",
  "notify",
] as const;

/**
 * Inner shape used when batching — same fields as the top-level args
 * minus the `questions` discriminator.
 */
const singleQuestionSchema = z.object({
  type: z.enum(USER_ASK_TYPES),
  question: z.string().optional(),
  header: z.string().max(12).optional(),
  options: z.array(optionInputSchema).optional(),
  context: z.string().optional(),
  message: z.string().optional(),
  actions: z.array(z.string().min(1)).optional(),
  level: z.enum(["info", "success", "warning", "error"]).optional(),
  allow_other: z.boolean().optional(),
  timeout_seconds: z.number().int().min(1).max(900).optional(),
});
export type UserSingleQuestion = z.infer<typeof singleQuestionSchema>;

function validateSingle(
  v: UserSingleQuestion,
  ctx: z.RefinementCtx,
  pathPrefix: (string | number)[],
): void {
  const needsQuestion =
    v.type === "confirm" ||
    v.type === "choice" ||
    v.type === "choice_many" ||
    v.type === "text" ||
    v.type === "secret";
  if (needsQuestion && !v.question?.trim()) {
    ctx.addIssue({
      code: "custom",
      message: `question is required when type='${v.type}'`,
      path: [...pathPrefix, "question"],
    });
  }
  if (v.type === "notify" && !v.message?.trim()) {
    ctx.addIssue({
      code: "custom",
      message: "message is required when type='notify'",
      path: [...pathPrefix, "message"],
    });
  }
  if (
    (v.type === "choice" || v.type === "choice_many") &&
    (!v.options || v.options.length < 2)
  ) {
    ctx.addIssue({
      code: "custom",
      message: `options must have at least 2 entries when type='${v.type}'`,
      path: [...pathPrefix, "options"],
    });
  }
}

/**
 * UserArgs is one big object with everything optional, validated by
 * superRefine. Single-question form fills the top-level fields; batched
 * form fills `questions[]`. The schema is intentionally flat (vs a
 * `z.union`) so the DB `tl_def.parameters` shape mirrors it 1:1 and the
 * drift comparator works without special-casing unions.
 */
export const userArgsSchema = z
  .object({
    // Single-question fields (omit when using batched form)
    type: z.enum(USER_ASK_TYPES).optional(),
    question: z.string().optional(),
    header: z.string().max(12).optional(),
    options: z.array(optionInputSchema).optional(),
    context: z.string().optional(),
    message: z.string().optional(),
    actions: z.array(z.string().min(1)).optional(),
    level: z.enum(["info", "success", "warning", "error"]).optional(),
    allow_other: z.boolean().optional(),
    timeout_seconds: z.number().int().min(1).max(900).optional(),
    // Batched form (mutually exclusive with everything above)
    questions: z.array(singleQuestionSchema).min(1).max(4).optional(),
  })
  .superRefine((v, ctx) => {
    const isBatch = !!v.questions && v.questions.length > 0;
    if (isBatch) {
      const stray = Object.entries(v).find(
        ([k, val]) => k !== "questions" && val !== undefined,
      );
      if (stray) {
        ctx.addIssue({
          code: "custom",
          message: `When using the batched form, only \`questions\` may be set. Saw \`${stray[0]}\`.`,
          path: [stray[0]],
        });
      }
      v.questions!.forEach((q, i) => validateSingle(q, ctx, ["questions", i]));
      return;
    }
    if (!v.type) {
      ctx.addIssue({
        code: "custom",
        message:
          "Either `type` (single question) or `questions[]` (batched) is required",
        path: ["type"],
      });
      return;
    }
    validateSingle(v as UserSingleQuestion, ctx, []);
  });

export type UserArgs = z.infer<typeof userArgsSchema>;

export function isBatchedUserArgs(
  args: UserArgs,
): args is UserArgs & { questions: UserSingleQuestion[] } {
  return !!args.questions && args.questions.length > 0;
}

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

/**
 * Batched response — emitted when the `user` tool was called with
 * `questions: SingleQuestion[]`. Each entry in `answers` matches the
 * input question by index. On the first cancel/timeout, the batch
 * short-circuits and the remaining entries are empty envelopes with
 * `cancelled` / `timed_out` set.
 */
export interface BatchedAskUserResponse {
  answers: AskUserResponse[];
  cancelled: boolean;
  timed_out: boolean;
}
