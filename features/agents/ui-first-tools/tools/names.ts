/**
 * UI-first tool name enumeration. Drives:
 *
 *   - the predicate `isUiFirstToolName` used by `process-stream.ts` to route
 *     `tool_delegated` events to the ui-first dispatcher (parallel to
 *     `isWidgetActionName` for widget actions).
 *   - delegated dispatch of these tools when the active surface (e.g.
 *     matrx-user/chat) brings them online via the DB surface resolver.
 *   - the dispatcher registry in `tools/registry.ts`.
 *
 * Keep this in lockstep with the matrx-extend canonical tool names — both
 * surfaces have to announce the same names to the aidream backend.
 */

export const UI_FIRST_TOOL_NAMES = [
  "user",
  "update_plan",
  "request_user_takeover",
  // NOTE: `tasks` was removed 2026-07-22 — it moved from client-delegated to
  // server-executed in aidream (aidream/tools/agent_tasks_tool.py). It was a pure
  // chat.agent_task write with no client-only work, and delegating it stalled the
  // loop on every task update. The TaskPanel still renders the list via its
  // Supabase Realtime subscription; the agent's writes now happen server-side.
  "user_todos",
] as const;

export type UiFirstToolName = (typeof UI_FIRST_TOOL_NAMES)[number];

export function isUiFirstToolName(name: string): name is UiFirstToolName {
  return (UI_FIRST_TOOL_NAMES as readonly string[]).includes(name);
}
