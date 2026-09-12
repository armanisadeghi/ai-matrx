// components/official/composer/composerSubmit.ts
//
// THE ONE COMPOSER KEY RULE, for every message box in the platform.
//
// ## The class this closes (census defect D2, 2026-09-12)
//
// The Scout interview panel was reported as "Return inserts a newline instead
// of sending, and nothing says so". Driven live on 2026-09-12 the Enter key
// DOES send there — but the report was not wrong about the thing underneath
// it: whether Enter sends is a per-conversation setting the Expert can flip,
// the Scout panel deliberately hides the toggle that flips it
// (`showSubmitOnEnterToggle: false`), and NO composer in the product says out
// loud which rule is in force. A person whose preference happens to be off
// presses Return, watches nothing happen, and has no way to find out why.
//
// The deeper class is that the rule itself was written six times, three
// different ways:
//
//   • `AgentTextarea`          — honours the per-conversation preference
//   • `CompactAssistantInput`  — honours it, minus the ⌘/Ctrl+Enter fallback
//   • `NewChatLandingInput`    — IGNORES it; Enter always sends
//   • `cx-chat` / `cx-conversation` — their own local, unpersisted toggle
//   • `whatsapp-clone`         — hardcoded, with a decorative dead toggle
//   • `ProTextarea`            — opt-in, defaulting to Enter-is-a-newline
//
// So the same keystroke means different things on different screens of one
// product. This module is the single decision; `ComposerHint` is the single
// sentence that tells the reader what it decided. A composer imports both —
// it never writes the rule again.

export type ComposerKeyIntent =
  /** Send the message now. */
  | "send"
  /** Deliver mid-run, at the agent's next pause (⌘/Ctrl+Enter while running). */
  | "steer"
  /** Stop the run, then send (⌘/Ctrl+Shift+Enter while running). */
  | "interrupt"
  /** Put a line break in the text. */
  | "newline"
  /** Not ours — let the browser do whatever it does. */
  | "none";

export interface ComposerKeyState {
  /** The conversation's setting: does a bare Enter send? */
  submitOnEnter: boolean;
  /** Is a run streaming right now? Enables steer/interrupt. */
  isRunning?: boolean;
  /** Does this composer support the mid-run modes at all? */
  supportsRunModes?: boolean;
}

/** The keyboard event fields this rule reads — a plain object, so the rule is
 *  testable without a DOM and identical for React and native listeners. */
export interface ComposerKeyEvent {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  /** True mid-IME composition: Enter is committing characters, never sending. */
  isComposing?: boolean;
}

/**
 * What this keystroke means in a composer. `"none"` means the composer must
 * not call `preventDefault` — anything else means it must.
 */
export function composerKeyIntent(
  e: ComposerKeyEvent,
  state: ComposerKeyState,
): ComposerKeyIntent {
  if (e.key !== "Enter") return "none";
  // An IME is mid-word. Enter belongs to the input method, never to us.
  if (e.isComposing) return "none";

  const withCmd = e.metaKey || e.ctrlKey;
  const running = Boolean(state.isRunning) && state.supportsRunModes !== false;

  if (running && withCmd && e.shiftKey) return "interrupt";
  if (running && withCmd && !e.shiftKey && state.submitOnEnter) return "steer";

  if (state.submitOnEnter) {
    // Enter sends; Shift+Enter is the newline. ⌘/Ctrl+Enter is left to the
    // run modes above — outside a run it is simply another send.
    if (e.shiftKey) return "newline";
    return "send";
  }
  // Enter is a newline; ⌘/Ctrl+Enter is the send.
  return withCmd ? "send" : "newline";
}

/** True when the composer must swallow the browser's own Enter handling. */
export function intentTakesTheKey(intent: ComposerKeyIntent): boolean {
  return intent !== "none" && intent !== "newline";
}

const MODIFIER = (): string => {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
    ? "⌘"
    : "Ctrl";
};

/**
 * THE ONE SENTENCE. A composer never invents its own wording — three of them
 * used to ("Ctrl+Enter to submit", "⌘+Enter to send, Shift+Enter for new
 * line", and nothing at all), and the rest said nothing, which is how a dead
 * Return key became invisible.
 */
export function composerHintText(submitOnEnter: boolean): string {
  return submitOnEnter
    ? "Enter to send · Shift+Enter for a new line"
    : `${MODIFIER()}+Enter to send · Enter for a new line`;
}
