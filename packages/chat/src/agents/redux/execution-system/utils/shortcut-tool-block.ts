/**
 * A SHORTCUT'S TOOL BLOCK LIST — the knob that keeps a show-only shortcut
 * (Summarize, Translate, Extract Key Points…) from being offered the write
 * tools of the page it was launched on (Arman, 2026-10-05: "nothing should be
 * in the code that could be in the database").
 *
 * The list lives in the shortcut's treatment (`never_include_tools`, served on
 * `mandate.vw_shortcut` / `mandate.context_menu_view`) and reaches the record
 * as `AgentShortcut.neverIncludeTools`. A name blocks that tool; a trailing
 * `*` blocks the whole prefix (`widget_*`). A replace/insert shortcut simply
 * lists nothing, so it keeps every tool it was ever offered.
 *
 * Applied by `buildToolInjection` (the surface write tool, surface client
 * tools, widget-handle tools and armed client tools) and by the widget-handle
 * capability provider — the two places the CLIENT decides what a run is offered.
 */

import type { ChatRootState } from "../../../../store/root-state";

/** The patterns blocked for this conversation's shortcut ([] when none). */
export function selectBlockedToolPatterns(
  state: ChatRootState,
  conversationId: string,
): readonly string[] {
  const shortcutId =
    state.conversations?.byConversationId?.[conversationId]?.shortcutId ?? null;
  if (!shortcutId) return [];
  return state.agentShortcut?.shortcuts?.[shortcutId]?.neverIncludeTools ?? [];
}

/** True when `name` matches a blocked name or `prefix*` pattern. */
export function isToolBlocked(
  name: string,
  patterns: readonly string[],
): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern,
  );
}
