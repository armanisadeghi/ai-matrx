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
  userArgsSchema,
  updatePlanArgsSchema,
  requestTakeoverArgsSchema,
  userTodosArgsSchema,
  scratchpadArgsSchema,
  storageArgsSchema,
} from "./schemas";
import { userHandler } from "../handlers/user.handler";
import { updatePlanHandler } from "../handlers/update-plan.handler";
import { requestTakeoverHandler } from "../handlers/request-takeover.handler";
// `tasks` is intentionally absent — it is server-executed in aidream now (see
// names.ts). Do not re-add a client handler for it.
import { userTodosHandler } from "../handlers/user-todos.handler";
import { scratchpadHandler } from "../handlers/scratchpad.handler";
import { storageHandler } from "../handlers/storage.handler";

export interface ToolRegistryEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodTypeAny;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: ToolHandler<any, any>;
}

const registry: Record<string, ToolRegistryEntry> = {
  user: { schema: userArgsSchema, handler: userHandler },
  update_plan: { schema: updatePlanArgsSchema, handler: updatePlanHandler },
  request_user_takeover: {
    schema: requestTakeoverArgsSchema,
    handler: requestTakeoverHandler,
  },
  user_todos: { schema: userTodosArgsSchema, handler: userTodosHandler },
  scratchpad: { schema: scratchpadArgsSchema, handler: scratchpadHandler },
  storage: { schema: storageArgsSchema, handler: storageHandler },
};

export function getUiFirstToolEntry(
  name: string,
): ToolRegistryEntry | undefined {
  return registry[name];
}

export function getAllUiFirstTools(): readonly ToolRegistryEntry[] {
  return Object.values(registry);
}
