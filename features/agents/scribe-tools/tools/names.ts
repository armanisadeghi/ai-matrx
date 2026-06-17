/**
 * Scribe tool name enumeration — client-delegated tools armed ONLY on a Scribe
 * session's assistant conversation. Parallel to `war-room-tools/tools/names.ts`
 * and `war-room-master-tools/tools/names.ts`.
 *
 * Drives:
 *   - the predicate `isScribeToolName` used by `surfaceDelegatedToolCall` to
 *     route `tool_delegated` events to the scribe dispatcher.
 *   - the inline tool defs in `tools/tool-defs.ts` (declared on the request so
 *     the server offers them WITHOUT a server-side tool-registry change).
 *   - the dispatch registry in `tools/registry.ts`.
 *   - per-conversation arming: `ScribeScreen` calls
 *     `addClientTool({ conversationId, toolName })` once the session's assistant
 *     conversation resolves. Always-on for Scribe; opt-in elsewhere.
 *
 * DESIGN — NOTIFY-AND-PLAY, not approve-each: playing back a clip of the user's
 * own recording is non-destructive, so these run immediately (no HITL pause),
 * like the war-room MASTER tools.
 */

export const SCRIBE_TOOL_NAMES = ["scribe_play_audio"] as const;

export type ScribeToolName = (typeof SCRIBE_TOOL_NAMES)[number];

export function isScribeToolName(name: string): name is ScribeToolName {
  return (SCRIBE_TOOL_NAMES as readonly string[]).includes(name);
}
