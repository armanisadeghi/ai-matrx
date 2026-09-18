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

import type { Resource } from "@/features/agents/resources/types";

const STORAGE_KEY = "matrx:chat-draft-transfer";

export interface ChatDraftTransfer {
  text: string;
  targetAgentId: string;
  /** Prepared context rendered as an attachment, never composer text. */
  resources?: Resource[];
  /** The transfer is valid only for the identity that created it. */
  userId?: string | null;
  organizationId?: string | null;
}

export function isChatSeedTextResource(
  value: unknown,
): value is Extract<Resource, { type: "text" }> {
  if (!value || typeof value !== "object") return false;
  const resource = value as { type?: unknown; data?: unknown };
  if (resource.type !== "text" || !resource.data || typeof resource.data !== "object") return false;
  const data = resource.data as Record<string, unknown>;
  return (
    typeof data.id === "string" &&
    data.id.length > 0 &&
    typeof data.label === "string" &&
    typeof data.text === "string"
  );
}

/**
 * Stash a draft to be applied on the next chat route mount. Safe to call from
 * SSR contexts — does nothing if `window` isn't available.
 */
export function stashChatDraftTransfer(transfer: ChatDraftTransfer): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(transfer));
  } catch (error) {
    if (!transfer.resources?.length) return;
    throw new Error(
      "Prepared chat content could not be held while opening the new chat.",
      { cause: error },
    );
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
  expectedIdentity?: { userId: string | null; organizationId: string | null },
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
  const resources = parsed.resources;
  if (resources !== undefined && (!Array.isArray(resources) || !resources.every(isChatSeedTextResource))) {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
    throw new Error("Prepared chat content was invalid and was not attached.");
  }
  if (resources?.length && (!expectedIdentity ||
    parsed.userId !== expectedIdentity.userId ||
    parsed.organizationId !== expectedIdentity.organizationId)) {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
    throw new Error("Prepared chat content belongs to a different account or organization.");
  }
  // Match — pop the slot before returning so a re-mount doesn't double-apply.
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
  return parsed;
}
