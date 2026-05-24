/**
 * `scratchpad` handler — get / set / list / delete on the per-conversation
 * scratchpad (cx_agent_memory). EPHEMERAL, single-session — cleared on
 * conversation delete (CASCADE).
 *
 * This is DISTINCT from the persistent, semantic `memory` tool (server-side,
 * source_app=matrx_ai: recall/search/store/update/forget). They are NOT the same
 * thing and must never share a name — that collision is exactly what this rename
 * fixed.
 */

import type { ToolHandler } from "./types";
import type { ScratchpadArgs } from "../tools/schemas";
import type { MemoryResult } from "../tools/types";
import {
  getMemory,
  setMemory,
  listMemoryKeys,
  deleteMemory,
} from "../service/agent-memory.service";

export const scratchpadHandler: ToolHandler<ScratchpadArgs, MemoryResult> = {
  name: "scratchpad",
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
