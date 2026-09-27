/**
 * "Attach to this chat" — who can receive a hit, and whether a chat is open.
 *
 * Two ways a target reaches the bar:
 *  1. A resource picker opens the bar for its composer and passes its target
 *     explicitly (the picker's search step hands off to ⌘K).
 *  2. A mounted chat registers itself here as the ACTIVE target, so a plain
 *     ⌘K pressed anywhere while that chat is on screen offers the action.
 *     No chat mounted → no action (the action is absent, never dead).
 *
 * Deliberately dependency-free (no Redux, no React): the shell-reachable
 * hotkey and the chat both import it, and it must not drag either graph into
 * the other (code-splitting rule 6 — invert the dependency, tiny registry).
 */

import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";

export interface KnowledgeAttachTarget {
  /** The action's words, e.g. "Attach to this chat". */
  label: string;
  /** Whether this hit can be attached here (the action is absent otherwise). */
  accepts: (hit: KnowledgeHit) => boolean;
  /** Attach; resolves false when the target refused (it says why itself). */
  attach: (hit: KnowledgeHit) => Promise<boolean>;
}

const stack: KnowledgeAttachTarget[] = [];

/** Register the chat on screen. Returns the unregister function. */
export function registerActiveAttachTarget(
  target: KnowledgeAttachTarget,
): () => void {
  stack.push(target);
  return () => {
    const i = stack.lastIndexOf(target);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** The most recently mounted chat, or null when no chat is open. */
export function getActiveAttachTarget(): KnowledgeAttachTarget | null {
  return stack.length ? stack[stack.length - 1] : null;
}
