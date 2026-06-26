/**
 * War Room tool name enumeration. Drives:
 *
 *   - the predicate `isWarRoomToolName` used by `surfaceDelegatedToolCall` to
 *     route `tool_delegated` events to the war-room dispatcher (parallel to
 *     `isUiFirstToolName` for the chat ui-first tools and `isWidgetActionName`
 *     for widget actions).
 *   - delegated dispatch of these tools when the war-room agent conversation
 *     has armed them (per-conversation registration in `instanceClientTools`,
 *     done by `ThreadAgentPanel` — see `binding-registry.ts`).
 *   - the dispatcher registry in `tools/registry.ts`.
 *
 * These names are NAMESPACED with the `war_room_` prefix so they never collide
 * with the chat ui-first tool names (`tasks`, `user`, …) — a War Room tile's
 * agent is the SAME studio-assistant agent used elsewhere, and the only thing
 * that brings these online is the per-conversation arming in ThreadAgentPanel.
 *
 * Every war-room tool is a WRITE on the tile's own entities and therefore gated
 * behind explicit human approval (HITL) in the dispatcher. There are no
 * read-only war-room tools — the agent already SEES the tile's task / notes /
 * files / audio as read-only context objects (see warRoomAgentContext.ts).
 */

export const WAR_ROOM_TOOL_NAMES = [
  "war_room_update_task",
  "war_room_add_subtask",
  "war_room_toggle_subtask",
  "war_room_update_note",
  "war_room_update_thread",
] as const;

export type WarRoomToolName = (typeof WAR_ROOM_TOOL_NAMES)[number];

export function isWarRoomToolName(name: string): name is WarRoomToolName {
  return (WAR_ROOM_TOOL_NAMES as readonly string[]).includes(name);
}
