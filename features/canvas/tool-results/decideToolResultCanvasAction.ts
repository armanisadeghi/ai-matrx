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
 *  2. Revealed once already → nothing more to do; it is already in the canvas.
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
  if (alreadyAutoOpened) return "none";
  if (!autoOpen) return "offer";
  if (canvasHasOtherContent) return "offer";
  if (!isNewest) return "offer";
  return "open";
}
