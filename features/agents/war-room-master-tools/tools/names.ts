/**
 * War Room MASTER tool name enumeration. Parallel to `war-room-tools/tools/
 * names.ts`, but for the cross-room MASTER agent (`/war-room/all`) — the agent
 * that oversees EVERY room + thread the user owns (see masterAgentContext.ts).
 *
 * Drives:
 *   - the predicate `isWarRoomMasterToolName` used by `surfaceDelegatedToolCall`
 *     to route `tool_delegated` events to the master dispatcher (parallel to
 *     `isWarRoomToolName` for the per-tile war-room tools).
 *   - the inline tool defs in `tools/tool-defs.ts` (declared on the request so
 *     the server can offer them WITHOUT a server-side registry change).
 *   - the dispatch registry in `tools/registry.ts`.
 *   - per-conversation arming: `useMasterAgent` calls
 *     `setClientTools({ conversationId: masterConvId, tools: WAR_ROOM_MASTER_TOOL_NAMES })`
 *     once the master conversation resolves (and clears on unmount). These names
 *     are armed ONLY on the master conversation, never on a tile's agent.
 *
 * NAMESPACE: the `war_room_` prefix is shared with the per-tile war-room tools
 * but the NAMES are distinct (`_read_thread` / `_message_thread` / `_create_room`
 * / `_rename_room`), so a conversation that armed one family never accidentally
 * dispatches the other.
 *
 * DESIGN — NOTIFY-AND-WATCH, not approve-each: unlike the per-tile war-room
 * tools (every write is HITL-gated), the master's actions run WITHOUT a
 * pre-approval pause. Reading a thread, creating/renaming a room, and messaging
 * a thread's agent all execute immediately; messaging fires a toast + opens a
 * live watch window so the user SEES it happen in real time and can step in.
 * That's the user's explicit model for the orchestrator: see it, watch it, jump
 * in — not gate every step.
 */

export const WAR_ROOM_MASTER_TOOL_NAMES = [
  "war_room_read_thread",
  "war_room_message_thread",
  "war_room_create_room",
  "war_room_rename_room",
] as const;

export type WarRoomMasterToolName = (typeof WAR_ROOM_MASTER_TOOL_NAMES)[number];

export function isWarRoomMasterToolName(
  name: string,
): name is WarRoomMasterToolName {
  return (WAR_ROOM_MASTER_TOOL_NAMES as readonly string[]).includes(name);
}
