/**
 * Single-hop draft transfer between two chat routes.
 *
 * The user is typing into the default-agent input on `/chat/new` and clicks a
 * quick-action chip. They expect the text they've already typed to follow them
 * to the new agent — not vanish. Redux can't carry it directly because the
 * source and target conversations are different instance IDs (different
 * launchers, different `instanceUserInput` entries).
 *
 * sessionStorage is the right fit here:
 *   - Per-tab — two browser tabs don't cross-contaminate
 *   - Transient — survives the navigation but doesn't persist beyond it
 *   - Synchronous — no race with the dispatch / router.push pair
 *
 * The slot is intentionally a single value (not a queue): if the user
 * triple-clicks chips, only the most recent click's text wins. The target
 * agent ID is included so the receiving route can verify "this draft was
 * meant for me" before applying.
 */

const STORAGE_KEY = "matrx:chat-draft-transfer";

export interface ChatDraftTransfer {
  text: string;
  targetAgentId: string;
}

/**
 * Stash a draft to be applied on the next chat route mount. Safe to call from
 * SSR contexts — does nothing if `window` isn't available.
 */
export function stashChatDraftTransfer(transfer: ChatDraftTransfer): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(transfer));
  } catch {
    // Quota or disabled storage — silently no-op; the chat still works, the
    // user just doesn't get their draft carried over.
  }
}

/**
 * Read-and-clear the stashed draft if it was meant for `expectedAgentId`.
 * Returns `null` when no draft is stashed, when the target doesn't match,
 * or when sessionStorage is unavailable. Always clears the slot if it
 * matched — drafts are single-use.
 */
export function consumeChatDraftTransfer(
  expectedAgentId: string,
): ChatDraftTransfer | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: ChatDraftTransfer | null = null;
  try {
    parsed = JSON.parse(raw) as ChatDraftTransfer;
  } catch {
    // Corrupt entry — clean up and move on.
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
    return null;
  }
  if (!parsed || parsed.targetAgentId !== expectedAgentId) {
    return null;
  }
  // Match — pop the slot before returning so a re-mount doesn't double-apply.
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
  return parsed;
}
