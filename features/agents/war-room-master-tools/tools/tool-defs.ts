/**
 * War Room MASTER INLINE tool definitions — the model-facing `{name,
 * description, input_schema}` for each master tool.
 *
 * Emitted as `ToolSpecInline` (`kind:"inline"`) on the master agent's request
 * (see build-tool-injection.ts `isWarRoomMasterToolName` branch). Inline specs
 * let the server offer a client-delegated tool it doesn't know about — exactly
 * right here: the `war_room_*` master names are NOT in the server registry, so
 * declaring them inline is what makes the master able to call them with NO
 * server-side change.
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
const READ_FILE_MODE = ["clean", "raw", "chunks"] as const;

const DEFS: Record<WarRoomMasterToolName, ToolSpecInline> = {
  war_room_read_thread: {
    kind: "inline",
    name: "war_room_read_thread",
    description:
      "Read the recent conversation of one thread's agent. Pass the thread's " +
      "`thread_id` from `war_room`. Returns the most recent messages " +
      "in that thread's chain so you can see what was discussed before acting. " +
      "Read-only — runs immediately, changes nothing.",
    input_schema: {
      type: "object",
      properties: {
        thread_id: {
          type: "string",
          description: "The thread's id (the `threadId` from war_room).",
        },
        limit: {
          type: "number",
          description: "How many recent messages to return (default 20, max 100).",
        },
      },
      required: ["thread_id"],
    },
  },

  war_room_read_file: {
    kind: "inline",
    name: "war_room_read_file",
    description:
      "Read the extracted TEXT of a file attached to this thread — our raw/" +
      "cleaned extraction, not the raw PDF. Pass the file's `id` from the " +
      "`war_room` <files> block (only files with extraction=\"yes\" are " +
      "readable). mode=clean (default, tidied text) | raw (verbatim extraction) " +
      "| chunks (RAG-ready fragments). Use this to actually READ a file; use " +
      "rag_search to SEARCH across files indexed for RAG. Read-only — runs " +
      "immediately, changes nothing.",
    input_schema: {
      type: "object",
      properties: {
        file_id: {
          type: "string",
          description:
            "The file's id (the `id` of a <file> in the war_room <files> block).",
        },
        mode: {
          type: "string",
          enum: [...READ_FILE_MODE],
          description:
            "'clean' = tidied text (default); 'raw' = verbatim extraction; " +
            "'chunks' = RAG-ready fragments.",
        },
        max_chars: {
          type: "number",
          description:
            "Truncate the returned text to this many characters (default 50000).",
        },
      },
      required: ["file_id"],
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
