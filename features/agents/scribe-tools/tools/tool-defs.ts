/**
 * Scribe INLINE tool definitions — the model-facing `{name, description,
 * input_schema}` for each scribe tool.
 *
 * Emitted as `ToolSpecInline` (`kind:"inline"`) on the agent request (see
 * build-tool-injection.ts). Inline specs are the supported way to offer a
 * client-delegated tool the server has NO registry entry for: the server adds
 * it to the model's tool list with the supplied JSON Schema and emits
 * `tool_delegated` when called — no server-side registration needed.
 *
 * The JSON Schemas are hand-written and MUST stay in lockstep with the Zod
 * validators in `schemas.ts` (the Zod schema is the runtime gate; this is what
 * the model sees).
 */

import type { ToolSpecInline } from "@/features/agents/types/tool-injection.types";
import { SCRIBE_TOOL_NAMES, type ScribeToolName } from "./names";

const DEFS: Record<ScribeToolName, ToolSpecInline> = {
  scribe_play_audio: {
    kind: "inline",
    name: "scribe_play_audio",
    description:
      "Play back a specific slice of THIS session's recorded audio so the user " +
      "hears exactly what was said. Use it to resolve an ambiguous or unclear " +
      "part of the transcript, or whenever the user wants to verify a moment " +
      "without scrubbing manually — it eliminates hunting through the recording. " +
      "Times are seconds from the start of the session; the transcript context " +
      "is annotated with [t=…s] anchors you can read them from. The session " +
      "player seeks to start_seconds and auto-pauses at end_seconds, playing " +
      "exactly that clip.",
    input_schema: {
      type: "object",
      properties: {
        start_seconds: {
          type: "number",
          description: "Start of the clip, in seconds from session start.",
        },
        end_seconds: {
          type: "number",
          description:
            "Optional end of the clip, in seconds from session start. The " +
            "player auto-pauses here so only this clip plays.",
        },
      },
      required: ["start_seconds"],
    },
  },
};

/** Inline spec for one scribe tool name, or undefined if not a scribe tool. */
export function getScribeInlineToolDef(name: string): ToolSpecInline | undefined {
  return (DEFS as Record<string, ToolSpecInline>)[name];
}

/** All scribe inline tool defs, in declaration order. */
export function getAllScribeInlineToolDefs(): ToolSpecInline[] {
  return SCRIBE_TOOL_NAMES.map((n) => DEFS[n]);
}
