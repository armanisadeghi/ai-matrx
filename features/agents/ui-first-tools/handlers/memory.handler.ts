/**
 * `memory` handler — get / set / list / delete on the per-conversation
 * scratchpad (cx_agent_memory). Ephemeral concept — cleared on conversation
 * delete (CASCADE).
 */

import type { ToolHandler } from "./types";
import type { MemoryArgs } from "../tools/schemas";
import type { MemoryResult } from "../tools/types";
import {
  getMemory,
  setMemory,
  listMemoryKeys,
  deleteMemory,
} from "../service/agent-memory.service";

export const memoryHandler: ToolHandler<MemoryArgs, MemoryResult> = {
  name: "memory",
  async run(args, ctx) {
    const { conversationId, userId } = ctx;

    switch (args.action) {
      case "get": {
        if (!args.key) {
          return { ok: false, action: "get", message: "key is required" };
        }
        const value = await getMemory(conversationId, args.key);
        return { ok: true, action: "get", key: args.key, value };
      }
      case "set": {
        if (!args.key) {
          return { ok: false, action: "set", message: "key is required" };
        }
        await setMemory(conversationId, userId, args.key, args.value ?? null);
        return { ok: true, action: "set", key: args.key };
      }
      case "list": {
        const keys = await listMemoryKeys(conversationId);
        return { ok: true, action: "list", keys };
      }
      case "delete": {
        if (!args.key) {
          return { ok: false, action: "delete", message: "key is required" };
        }
        await deleteMemory(conversationId, args.key);
        return { ok: true, action: "delete", key: args.key };
      }
    }
  },
};
