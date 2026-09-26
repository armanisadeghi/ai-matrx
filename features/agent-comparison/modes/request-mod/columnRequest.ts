/**
 * Which request a Request Mod column saves.
 *
 * Each column sends its OWN request, and its composer empties the moment it
 * sends. Saving the composer alone therefore erased every column's request
 * the moment it ran; these helpers keep the request that actually ran.
 */

import type { RootState } from "@/lib/redux/store";
import type { RequestModColumn, RequestModColumnRequest } from "./types";

/** What the column's composer holds right now. */
export function readLiveColumnRequest(
  state: RootState,
  conversationId: string,
): RequestModColumnRequest {
  return {
    user_message:
      state.instanceUserInput.byConversationId[conversationId]?.text ?? "",
    variables:
      state.instanceVariableValues.byConversationId[conversationId]
        ?.userValues ?? {},
  };
}

/**
 * The request to save for a column: what is being typed now when there is
 * something, otherwise the request it last sent (or was loaded with). A
 * composer is empty after every send, so saving the composer alone erased
 * every column's request the moment it ran.
 */
export function columnRequestToSave(
  state: RootState,
  col: RequestModColumn,
): RequestModColumnRequest {
  const live = readLiveColumnRequest(state, col.conversationId);
  if (live.user_message.trim() || !col.lastRequest) return live;
  return col.lastRequest;
}

