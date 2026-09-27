import type { AnyMandateKey } from "@/features/mandates/mandate-key";

/**
 * The Composer presentation contract — the optional `composer` prop on
 * SmartAgentInput.
 *
 * 🚨 ABSENT = TODAY. A host that passes no `composer` renders the classic
 * stacked composer byte-for-byte; every existing host keeps working untouched.
 * A host that passes it gets the three-mode, three-size composer from Arman's
 * design (common-docs/projects/ai-matrx-composer/MAP.md). The engine — send,
 * drafts, drop, paste, variables, resources, streaming state — is the SAME
 * code in both; only the chrome is arranged differently.
 */

/** How much of the composer is shown (Amendment 1, A1). */
export type ComposerMode = "chat" | "work" | "advanced";

export const COMPOSER_MODES: readonly ComposerMode[] = ["chat", "work", "advanced"];

export const COMPOSER_MODE_LABELS: Record<ComposerMode, string> = {
  chat: "Chat",
  work: "Work",
  advanced: "Advanced",
};

export function isComposerMode(value: unknown): value is ComposerMode {
  return value === "chat" || value === "work" || value === "advanced";
}

/**
 * Where the composer sits (brief §1 + A5).
 *  - `splash`  — centered hero on an empty conversation; menus open downward.
 *  - `page`    — docked at the bottom of a conversation; menus open upward.
 *  - `compact` — a 440px chat panel footer or a 340px floating panel; the meta
 *                row collapses to agent + Auto and Scope / Output move into +.
 */
export type ComposerSize = "splash" | "page" | "compact";

/**
 * The host's say over the agent. The composer never navigates on its own: a
 * route decides what "switch to this agent" means (the chat route stages the
 * draft and pushes a URL; a canvas panel relaunches its conversation).
 * Absent `onSelectAgent` = the agent is FIXED here: the pill shows the name and
 * the model, never "Change" or presets.
 */
export interface ComposerAgentControl {
  /**
   * `via.mandateKey` is set when the pick is a JOB, not just an agent — Custom
   * is the `chat.default_new_chat` job, and only a launch through that job
   * applies the person's own default chat model. A host launches through the
   * mandate when it is given (the chat route: `/chat/new`; a canvas panel:
   * `launchMandate`).
   */
  onSelectAgent?: (agentId: string, via?: { mandateKey: AnyMandateKey }) => void;
}

export interface ComposerPresentation {
  size: ComposerSize;
  mode: ComposerMode;
  agent?: ComposerAgentControl;
  /** Literal placeholder; absent = the conversation's configured placeholder. */
  placeholder?: string;
  /**
   * Hard cap on the textarea's grown height in px (compact size: the host
   * computes `panelHeight × knob%`). Absent = the classic 200px cap.
   */
  maxInputHeightPx?: number;
}
