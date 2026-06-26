/**
 * War Room INLINE tool definitions — the model-facing `{name, description,
 * input_schema}` for each war-room tool.
 *
 * These are emitted as `InlineToolSpec` (`kind:"inline"`) on the agent request
 * (see build-tool-injection.ts). Inline specs are "the caller supplies the
 * schema directly … always client-delegated" — which is exactly right here:
 * the `war_room_*` names are NOT in the server's tool registry, so declaring
 * them inline is what makes the agent able to call them WITHOUT any server-side
 * registration. The server adds them to the model's tool list with the supplied
 * JSON Schema and emits `tool_delegated` when one is called.
 *
 * The JSON Schemas are hand-written (small, dependency-free, full control over
 * the model-facing copy) and MUST stay in lockstep with the Zod validators in
 * `schemas.ts` — the Zod schema is the runtime gate, this is what the model
 * sees. Descriptions emphasize that these edit the user's LIVE work and require
 * the user's approval, so the agent proposes deliberate, well-formed changes.
 */

import type { ToolSpecInline } from "@/features/agents/types/tool-injection.types";
import { WAR_ROOM_TOOL_NAMES, type WarRoomToolName } from "./names";

const TASK_STATUS = ["incomplete", "completed"] as const;
const TASK_PRIORITY = ["low", "medium", "high"] as const;

const DEFS: Record<WarRoomToolName, ToolSpecInline> = {
  war_room_update_task: {
    kind: "inline",
    name: "war_room_update_task",
    description:
      "Update this War Room tile's primary task (the read-only `tile_task` you " +
      "can see in context). Provide only the fields you want to change. Edits " +
      "the user's live task and requires their approval before it applies.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "New task title." },
        status: {
          type: "string",
          enum: [...TASK_STATUS],
          description: "Task completion status.",
        },
        description: {
          type: "string",
          description: "New task description.",
        },
        priority: {
          type: "string",
          enum: [...TASK_PRIORITY],
          description: "Task priority.",
        },
        due_date: {
          type: "string",
          description: "Due date as YYYY-MM-DD.",
        },
      },
      required: [],
    },
  },

  war_room_add_subtask: {
    kind: "inline",
    name: "war_room_add_subtask",
    description:
      "Add a subtask under this tile's primary task. Requires the user's " +
      "approval. The tile must already have a task.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Subtask title." },
        description: {
          type: ["string", "null"],
          description: "Optional subtask description.",
        },
      },
      required: ["title"],
    },
  },

  war_room_toggle_subtask: {
    kind: "inline",
    name: "war_room_toggle_subtask",
    description:
      "Mark one of this tile's subtasks complete or incomplete. Use the " +
      "subtask id from `tile_task.subtasks`. Omit `completed` to toggle. " +
      "Requires the user's approval.",
    input_schema: {
      type: "object",
      properties: {
        subtask_id: {
          type: "string",
          description: "The subtask's id (from tile_task.subtasks).",
        },
        completed: {
          type: "boolean",
          description:
            "Target completion. Omit to toggle the current value.",
        },
      },
      required: ["subtask_id"],
    },
  },

  war_room_update_note: {
    kind: "inline",
    name: "war_room_update_note",
    description:
      "Edit this tile's active note (the read-only `tile_notes` you can see). " +
      "Use mode='replace' to set the whole body or mode='append' to add to the " +
      "end. Requires the user's approval. The tile must already have a note.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The note text to set (replace) or add (append).",
        },
        label: { type: "string", description: "Optional new note title." },
        mode: {
          type: "string",
          enum: ["replace", "append"],
          description: "How to apply `content`. Defaults to replace.",
        },
      },
      required: [],
    },
  },

  war_room_update_thread: {
    kind: "inline",
    name: "war_room_update_thread",
    description:
      "Rename this tile (the room's entry for this work item). Requires the " +
      "user's approval. (A tile has no separate description — edit the task or " +
      "note for descriptive content.)",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "New tile title." },
      },
      required: ["title"],
    },
  },
};

/** Inline spec for one war-room tool name, or undefined if not a war-room tool. */
export function getWarRoomInlineToolDef(
  name: string,
): ToolSpecInline | undefined {
  return (DEFS as Record<string, ToolSpecInline>)[name];
}

/** All war-room inline tool defs, in declaration order. */
export function getAllWarRoomInlineToolDefs(): ToolSpecInline[] {
  return WAR_ROOM_TOOL_NAMES.map((n) => DEFS[n]);
}
