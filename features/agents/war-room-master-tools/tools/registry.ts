/**
 * War Room MASTER tool registry — mirrors `war-room-tools/tools/registry.ts`.
 * The dispatcher uses this to (1) look up the Zod schema to validate args and
 * (2) look up the handler to run.
 *
 * One entry per master tool. Populated statically at module load — the tool set
 * is fixed.
 */

import type { z } from "zod";
import type { WarRoomMasterToolHandler } from "../handlers/types";
import {
  warRoomReadThreadArgsSchema,
  warRoomMessageThreadArgsSchema,
  warRoomCreateRoomArgsSchema,
  warRoomRenameRoomArgsSchema,
} from "./schemas";
import { readThreadHandler } from "../handlers/read-thread.handler";
import { messageThreadHandler } from "../handlers/message-thread.handler";
import { createRoomHandler } from "../handlers/create-room.handler";
import { renameRoomHandler } from "../handlers/rename-room.handler";

export interface WarRoomMasterToolRegistryEntry {
  schema: z.ZodTypeAny;
  handler: WarRoomMasterToolHandler<unknown, unknown>;
}

const registry: Record<string, WarRoomMasterToolRegistryEntry> = {
  war_room_read_thread: {
    schema: warRoomReadThreadArgsSchema,
    handler: readThreadHandler as WarRoomMasterToolHandler<unknown, unknown>,
  },
  war_room_message_thread: {
    schema: warRoomMessageThreadArgsSchema,
    handler: messageThreadHandler as WarRoomMasterToolHandler<unknown, unknown>,
  },
  war_room_create_room: {
    schema: warRoomCreateRoomArgsSchema,
    handler: createRoomHandler as WarRoomMasterToolHandler<unknown, unknown>,
  },
  war_room_rename_room: {
    schema: warRoomRenameRoomArgsSchema,
    handler: renameRoomHandler as WarRoomMasterToolHandler<unknown, unknown>,
  },
};

export function getWarRoomMasterToolEntry(
  name: string,
): WarRoomMasterToolRegistryEntry | undefined {
  return registry[name];
}

export function getAllWarRoomMasterTools(): readonly WarRoomMasterToolRegistryEntry[] {
  return Object.values(registry);
}
