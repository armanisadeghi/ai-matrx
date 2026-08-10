/**
 * War Room MASTER INLINE tool definitions — the model-facing `{name,
 * description, input_schema}` for each master tool.
 *
 * Currently emitted as Inline tools (`kind:"inline"`) on the master request
 * and armed per conversation via wire `client_tools`. Inline tools are a
 * permanent, first-class path, but these durable definitions ship in this repo
 * and therefore SHOULD be Registered tools in `tool.definition`. That known
 * durability-rule violation is left for a separate registration migration;
 * this file describes the current state, not the intended endpoint.
 *
 * PROVIDER-SAFE SCHEMAS (matches war-room-tools/tools/tool-defs.ts and commit
 * "keep inline tool schemas provider-safe"): every property is a plain
 * `type: "string" | "number"` or an `enum` — NO array-typed `type` (e.g.
 * `["string","null"]`) and NO `null` in `type`, which some providers reject.
 * Optional fields are simply omitted from `required`.
 *
 * The JSON Schemas MUST stay in lockstep with the Zod validators in
 * `schemas.ts` — Zod is the runtime gate; this is what the model sees.
 */

import type { ToolSpecInline } from "@/features/agents/types/tool-injection.types";
import {
  WAR_ROOM_MASTER_TOOL_NAMES,
  type WarRoomMasterToolName,
} from "./names";

const MESSAGE_MODE = ["fresh", "fork"] as const;

const DEFS: Record<WarRoomMasterToolName, ToolSpecInline> = {
  war_room_read_thread: {
    kind: "inline",
    name: "war_room_read_thread",
    description:
      "Read the recent conversation of one thread's agent. Pass the thread's " +
      "`thread_id` from `war_room`. Returns the most recent messages " +
      "in that thread's chain so you can see what was discussed before acting. " +
      "A thread can hold several agent conversations (the `conversation` rows " +
      "in its resources) — pass `conversation_id` to read a specific one. Set " +
      "`include_working_documents` to also list the documents that agent " +
      "produced (readable via war_room_read_resource). Read-only — runs " +
      "immediately, changes nothing.",
    input_schema: {
      type: "object",
      properties: {
        thread_id: {
          type: "string",
          description: "The thread's id (the `threadId` from war_room).",
        },
        conversation_id: {
          type: "string",
          description:
            "Optional: a specific conversation of the thread (a `conversation` " +
            "resource id). Defaults to the thread's primary agent chain.",
        },
        limit: {
          type: "number",
          description: "How many recent messages to return (default 20, max 100).",
        },
        include_working_documents: {
          type: "boolean",
          description:
            "Also list the conversation's working documents (id + kind).",
        },
      },
      required: ["thread_id"],
    },
  },

  // Reading an attached FILE's extracted text is the SERVER tool `file_read`
  // (armed via the War Room agents' agent.definition tool arrays) — no inline
  // def, no client delegation (D15).

  war_room_read_resource: {
    kind: "inline",
    name: "war_room_read_resource",
    description:
      "Read ANY resource listed in the war_room <resources> roster — any " +
      "type: datasets, flashcard sets, transcripts, working documents, " +
      "attached conversations, and every other registered entity. Pass the " +
      "row's `type` and `id`. Special containers: entity_type='thread' or " +
      "'war_room' with the container's id returns its FULL attachment " +
      "manifest (use it when the roster shows a <more/> row or you need " +
      "another thread's resources). Prefer the dedicated server tools from " +
      "the <access> legend when one is named (data / data_action / document / " +
      "file_read / knowledge_search); use this for everything else. Read-only — runs " +
      "immediately, changes nothing.",
    input_schema: {
      type: "object",
      properties: {
        entity_type: {
          type: "string",
          description:
            "The resource's entity type (the `type` attr of a <res> row), " +
            "or 'thread' / 'war_room' for a container manifest.",
        },
        entity_id: {
          type: "string",
          description: "The resource's id (the `id` attr of a <res> row).",
        },
        mode: {
          type: "string",
          description: "Optional token-specific mode.",
        },
        max_chars: {
          type: "number",
          description:
            "Truncate the returned content to this many characters (default 20000).",
        },
      },
      required: ["entity_type", "entity_id"],
    },
  },

  war_room_message_thread: {
    kind: "inline",
    name: "war_room_message_thread",
    description:
      "Send a message to one thread's agent. Pass the thread's `thread_id` " +
      "from `war_room`. mode='fresh' (default) starts a NEW " +
      "conversation seeded with that thread's task, notes, and files plus your " +
      "message — a clean, well-scoped ask with no prior history. mode='fork' " +
      "branches the thread's EXISTING conversation (keeping its full history) " +
      "and continues it with your message; use it when continuity matters. The " +
      "user is notified and can watch the thread agent's reply live, then step " +
      "in. Runs immediately (no approval pause).",
    input_schema: {
      type: "object",
      properties: {
        thread_id: {
          type: "string",
          description: "The thread's id (the `threadId` from war_room).",
        },
        message: {
          type: "string",
          description: "The message to send to the thread's agent.",
        },
        mode: {
          type: "string",
          enum: [...MESSAGE_MODE],
          description:
            "'fresh' = new conversation with the thread's context (default); " +
            "'fork' = continue the thread's existing conversation with history.",
        },
      },
      required: ["thread_id", "message"],
    },
  },

  war_room_create_room: {
    kind: "inline",
    name: "war_room_create_room",
    description:
      "Create a new War Room (a workspace that gathers related threads). " +
      "Returns the new room's id. Runs immediately.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The room title." },
        description: {
          type: "string",
          description: "Optional short description of the room.",
        },
      },
      required: ["title"],
    },
  },

  war_room_rename_room: {
    kind: "inline",
    name: "war_room_rename_room",
    description:
      "Rename an existing War Room. Pass the room's `room_id` from " +
      "`war_room`. Runs immediately.",
    input_schema: {
      type: "object",
      properties: {
        room_id: {
          type: "string",
          description: "The room's id (the `roomId` from war_room).",
        },
        title: { type: "string", description: "The new room title." },
      },
      required: ["room_id", "title"],
    },
  },
};

/** Inline spec for one master tool name, or undefined if not a master tool. */
export function getWarRoomMasterInlineToolDef(
  name: string,
): ToolSpecInline | undefined {
  return (DEFS as Record<string, ToolSpecInline>)[name];
}

/** All master inline tool defs, in declaration order. */
export function getAllWarRoomMasterInlineToolDefs(): ToolSpecInline[] {
  return WAR_ROOM_MASTER_TOOL_NAMES.map((n) => DEFS[n]);
}
