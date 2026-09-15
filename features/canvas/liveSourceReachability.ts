/**
 * liveSourceReachability — THE ONE RULE for panes the canvas can never rebuild
 * from the database.
 *
 * ## The defect this exists for
 *
 * Independent review, production commit `528560bbc8`, 2026-09-15: a chat bound
 * to a live sandbox, with a document the agent had created. Reload, wait for
 * the composer chip to read *"Sandbox for this chat: … Connected."*, click
 * Canvas — and the canvas showed ONLY the document. `[data-canvas-switcher]`
 * was absent (the switcher needs two items), so there was no control anywhere
 * that reached the Sandbox again. The box was running, the chat was bound to
 * it, and the only way back was to wait for the agent to run another shell
 * command. Reproduced twice, cleanly.
 *
 * ## Why it happened
 *
 * The canvas slice is deliberately NOT persisted; the reveal memory IS. So
 * after a reload the canvas is empty and the memory says "already revealed".
 * `decideSandboxCanvasAction` answered `"none"` to that combination — nothing
 * to open, so nothing was done at all — and `"nothing to do"` meant the item
 * was never even OFFERED. With one restorable item (the document) the switcher
 * stayed hidden and the live pane was stranded.
 *
 * The document family had learned this exact lesson hours earlier
 * (`decideToolResultCanvasAction`: `alreadyAutoOpened → "offer"`). This module
 * is that lesson written once, so it cannot be learned a third time.
 *
 * ## The rule
 *
 * **While its source still exists, a non-persistable pane is ALWAYS at least
 * offered.** A pty, a live browser session and a working document are never
 * written to `canvas_items`; nothing restores them on load except the surface
 * that owns them. So that surface must keep putting them in the switcher for
 * as long as the live thing behind them is real — every load, not just the
 * first tool call.
 *
 * Offered, never opened: the user's put-away memory and the never-hijack rule
 * are untouched. This only forbids the one answer that makes a live pane
 * UNREACHABLE.
 *
 * And the other half is just as load-bearing: **no source, no item.** An
 * unbound conversation must not carry a Sandbox entry in its switcher — a
 * control with nothing behind it is the defect this platform calls a dead
 * affordance (law 4).
 */

/** What a surface should do with its own pane right now. */
export type LiveCanvasPaneAction = "open" | "offer" | "none";

/**
 * Normalize a pane decision so a live source is never stranded.
 *
 * Every non-persistable pane's decision function ends here.
 *
 * @param action       what the surface's own rules concluded
 * @param sourceExists is the live thing behind the pane real RIGHT NOW (a
 *                     bound sandbox box, a live browser run, a document row)?
 */
export function keepLiveSourceReachable(
  action: LiveCanvasPaneAction,
  sourceExists: boolean,
): LiveCanvasPaneAction {
  // Nothing behind it: no pane, no switcher entry, no dead control.
  if (!sourceExists) return "none";
  // The source is live, so the pane is reachable — offering costs nothing on
  // screen and is the difference between "one click away" and "gone".
  return action === "none" ? "offer" : action;
}

/**
 * Canvas content types whose pane is a DOOR to something still running, not a
 * copy of something stored.
 *
 * Two consequences, both of them the same rule seen from different sides:
 *  - their surface re-offers them for as long as the live thing exists
 *    (`keepLiveSourceReachable`), so a reload can never strand them;
 *  - the canvas history therefore does not offer to REMOVE them. Removing one
 *    would close the only door to a running box or browser and the surface
 *    would immediately put it back — a control that visibly loses its own
 *    fight. Absent, never dead (law 4). Put-away (the pane header's own
 *    control) is the honest way to make one go away, and it is remembered.
 */
const LIVE_SOURCE_PANE_TYPES = new Set(["sandbox", "cloud_browser"]);

export function isLiveSourcePaneType(type: string | undefined | null): boolean {
  return !!type && LIVE_SOURCE_PANE_TYPES.has(type);
}
