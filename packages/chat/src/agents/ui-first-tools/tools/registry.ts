/**
 * Module-level tool registry. The dispatcher uses this to:
 *   1. Look up the Zod schema for a given tool name → validate args.
 *   2. Look up the handler → run it.
 *
 * One entry per UI-first tool. The registry is populated at module load
 * via the imports at the bottom of this file; no separate `register-all`
 * file needed because the tool set is fixed and discovered statically.
 */

import type { z } from "zod";
import type { ToolHandler } from "../handlers/types";
import {
  updatePlanArgsSchema,
  requestTakeoverArgsSchema,
  userTodosArgsSchema,
  googleEmailSendArgsSchema,
} from "./schemas";
import { updatePlanHandler } from "../handlers/update-plan.handler";
import { requestTakeoverHandler } from "../handlers/request-takeover.handler";
// `tasks` is intentionally absent — it is server-executed in aidream now (see
// names.ts). Do not re-add a client handler for it.
import { userTodosHandler } from "../handlers/user-todos.handler";
import { googleEmailSendHandler } from "../handlers/google-email-send.handler";

export interface ToolRegistryEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodTypeAny;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: ToolHandler<any, any>;
}

const registry: Record<string, ToolRegistryEntry> = {
  // `user` was RETIRED 2026-10-04: `ask_person` (server-run, stored, survives a
  // reload) is the one way an agent asks the person. Old `user` calls still
  // render in history (tool-call-visualization `user` → AskInline).
  update_plan: { schema: updatePlanArgsSchema, handler: updatePlanHandler },
  request_user_takeover: {
    schema: requestTakeoverArgsSchema,
    handler: requestTakeoverHandler,
  },
  user_todos: { schema: userTodosArgsSchema, handler: userTodosHandler },
  google_email_send: {
    schema: googleEmailSendArgsSchema,
    handler: googleEmailSendHandler,
  },
};

export function getUiFirstToolEntry(
  name: string,
): ToolRegistryEntry | undefined {
  return registry[name];
}

export function getAllUiFirstTools(): readonly ToolRegistryEntry[] {
  return Object.values(registry);
}
