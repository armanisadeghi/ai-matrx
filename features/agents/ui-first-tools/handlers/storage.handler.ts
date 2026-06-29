/**
 * `storage` handler — persistent per-user KV (agent_user_kv). Survives
 * conversation reset; the agent thinks of this as "long-term storage."
 */

import type { ToolHandler } from "./types";
import type { StorageArgs } from "../tools/schemas";
import type { StorageResult } from "../tools/types";
import { getKv, setKv, listKvKeys, deleteKv } from "../service/agent-user-kv.service";

export const storageHandler: ToolHandler<StorageArgs, StorageResult> = {
  name: "storage",
  async run(args, ctx) {
    const { userId } = ctx;

    switch (args.action) {
      case "get": {
        if (!args.key) {
          return { ok: false, action: "get", message: "key is required" };
        }
        const value = await getKv(userId, args.key);
        return { ok: true, action: "get", key: args.key, value };
      }
      case "set": {
        if (!args.key) {
          return { ok: false, action: "set", message: "key is required" };
        }
        await setKv(userId, args.key, args.value ?? null);
        return { ok: true, action: "set", key: args.key };
      }
      case "list": {
        const keys = await listKvKeys(userId);
        return { ok: true, action: "list", keys };
      }
      case "delete": {
        if (!args.key) {
          return { ok: false, action: "delete", message: "key is required" };
        }
        await deleteKv(userId, args.key);
        return { ok: true, action: "delete", key: args.key };
      }
    }
  },
};
