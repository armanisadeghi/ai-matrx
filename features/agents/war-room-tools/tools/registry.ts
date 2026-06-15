/**
 * War Room tool registry — mirrors `ui-first-tools/tools/registry.ts`. The
 * dispatcher uses this to (1) look up the Zod schema to validate args and
 * (2) look up the handler to run after the user approves the write.
 *
 * One entry per war-room tool. Populated statically at module load — the tool
 * set is fixed, so no `register-all` side-effect file is needed.
 */

import type { z } from "zod";
import type { WarRoomToolHandler } from "../handlers/types";
import {
  warRoomUpdateTaskArgsSchema,
  warRoomAddSubtaskArgsSchema,
  warRoomToggleSubtaskArgsSchema,
  warRoomUpdateNoteArgsSchema,
  warRoomUpdateTileArgsSchema,
} from "./schemas";
import { updateTaskHandler } from "../handlers/update-task.handler";
import { addSubtaskHandler } from "../handlers/add-subtask.handler";
import { toggleSubtaskHandler } from "../handlers/toggle-subtask.handler";
import { updateNoteHandler } from "../handlers/update-note.handler";
import { updateTileHandler } from "../handlers/update-tile.handler";

export interface WarRoomToolRegistryEntry {
  schema: z.ZodTypeAny;
  handler: WarRoomToolHandler<unknown, unknown>;
}

const registry: Record<string, WarRoomToolRegistryEntry> = {
  war_room_update_task: {
    schema: warRoomUpdateTaskArgsSchema,
    handler: updateTaskHandler,
  },
  war_room_add_subtask: {
    schema: warRoomAddSubtaskArgsSchema,
    handler: addSubtaskHandler,
  },
  war_room_toggle_subtask: {
    schema: warRoomToggleSubtaskArgsSchema,
    handler: toggleSubtaskHandler,
  },
  war_room_update_note: {
    schema: warRoomUpdateNoteArgsSchema,
    handler: updateNoteHandler,
  },
  war_room_update_tile: {
    schema: warRoomUpdateTileArgsSchema,
    handler: updateTileHandler,
  },
};

export function getWarRoomToolEntry(
  name: string,
): WarRoomToolRegistryEntry | undefined {
  return registry[name];
}

export function getAllWarRoomTools(): readonly WarRoomToolRegistryEntry[] {
  return Object.values(registry);
}
