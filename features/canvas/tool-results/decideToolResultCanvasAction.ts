/**
 * The reveal rules for a record a tool just created — pure, so the rules that
 * matter are pinned by guards rather than by reading a component.
 *
 * Same shape as the sandbox's `decideSandboxCanvasAction`, deliberately: the
 * canvas' right-hand region is SHARED (documents, artifacts, the browser, the
 * sandbox) and every pane that can appear on its own obeys the identical
 * courtesy — offer always, open only into an empty canvas, and never twice.
 */

export type ToolResultCanvasAction = "open" | "offer" | "none";

export interface ToolResultCanvasDecisionInput {
  /** The user preference — on by default, off means never auto-open. */
  autoOpen: boolean;
  /** Have we already revealed this exact record? (survives reload) */
  alreadyAutoOpened: boolean;
  /** Did the user PUT THIS PANE AWAY? Then it stays away. */
  userClosed: boolean;
  /** Is the canvas holding anything OTHER than this record's pane? */
  canvasHasOtherContent: boolean;
  /** Is this the newest record in the conversation? Only it may auto-open. */
  isNewest: boolean;
}

/**
 *  1. A put-away pane stays away — offered, so it is still one click away in
 *     the switcher, never opened.
 *  2. Revealed once already → offered, never opened again. Across a reload the
 *     canvas is empty but the memory is not, so "nothing to do" would strand
 *     the record outside every switcher.
 *  3. Auto-open off → offer.
 *  4. The canvas is showing something else → OFFER. NEVER HIJACK. This is the
 *     rule the whole design turns on: the agent creating a document while the
 *     user reads the terminal must not yank the terminal away.
 *  5. Only the newest record of the turn may take an empty canvas — a reloaded
 *     conversation with six past documents offers six and opens none of them
 *     over each other.
 *  6. Otherwise: the canvas is empty and this is new → OPEN, the way Claude.ai
 *     shows an artifact the moment it is written.
 */
export function decideToolResultCanvasAction({
  autoOpen,
  alreadyAutoOpened,
  userClosed,
  canvasHasOtherContent,
  isNewest,
}: ToolResultCanvasDecisionInput): ToolResultCanvasAction {
  if (userClosed) return "offer";
  // Revealed once already → never open it again, but STILL OFFER it. Measured
  // live on 2026-09-15: returning "none" here meant that after a reload (the
  // canvas slice is deliberately not persisted, the reveal memory is) a
  // document the chat had created was in no switcher at all — reachable only
  // by finding its card again. A record this conversation made is always one
  // click away in the canvas; it is only ever *opened* once.
  if (alreadyAutoOpened) return "offer";
  if (!autoOpen) return "offer";
  if (canvasHasOtherContent) return "offer";
  if (!isNewest) return "offer";
  return "open";
}

/**
 * Is the canvas showing something OTHER than this record's own pane?
 *
 * Per record, never per conversation. Measured live on production
 * 2026-09-15: computed once against every offer of the conversation, a canvas
 * already showing the FIRST document read as empty, and the second document
 * the agent created took the pane out from under it. A document the user is
 * reading is "something else", exactly like the sandbox or the browser.
 *
 * @param presentSourceIds the canvas identities currently on the canvas
 * @param sourceId         this record's own canvas identity
 */
export function canvasHoldsOtherContent(
  presentSourceIds: readonly string[],
  sourceId: string,
): boolean {
  return presentSourceIds.some((id) => id !== sourceId);
}
