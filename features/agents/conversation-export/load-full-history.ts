// load-full-history — "the whole conversation" means EVERY message, not the
// window the chat happened to load. Pages older history through the same
// cursor pager the transcript uses (`loadOlderMessages`, 200 per page — the
// RPC's ceiling) until the server says there is none, reporting progress so
// the caller can say "Loading all messages… 120 loaded".

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { loadOlderMessages } from "@/features/agents/redux/execution-system/thunks/load-older-messages.thunk";

const PAGE_SIZE = 200;
/** Bound on pages (40k messages) so a server that never says "done" cannot spin. */
const MAX_PAGES = 200;

export async function loadFullConversationHistory(
  dispatch: AppDispatch,
  getState: () => RootState,
  conversationId: string,
  onProgress?: (loaded: number) => void,
): Promise<{ complete: boolean; loaded: number }> {
  const count = () =>
    getState().messages.byConversationId[conversationId]?.orderedIds?.length ?? 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const entry = getState().messages.byConversationId[conversationId];
    if (!entry?.hasMoreOlder) {
      onProgress?.(count());
      return { complete: true, loaded: count() };
    }
    try {
      await dispatch(loadOlderMessages({ conversationId, pageSize: PAGE_SIZE })).unwrap();
    } catch (err) {
      const reason = (err as { reason?: string } | null)?.reason;
      if (reason === "no-more") return { complete: true, loaded: count() };
      console.error("[loadFullConversationHistory] a page of history failed", err);
      return { complete: false, loaded: count() };
    }
    onProgress?.(count());
  }
  return { complete: false, loaded: count() };
}
