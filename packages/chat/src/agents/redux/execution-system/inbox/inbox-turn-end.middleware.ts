// features/agents/redux/execution-system/inbox/inbox-turn-end.middleware.ts
//
// The one choke point that makes "a queued message sends when the turn ends"
// true on the client (deliver-stranded-queue.thunk.ts has the why). Every
// completion path — a sent turn, a tool-result resume, a recovered or adopted
// stream — ends in `setInstanceStatus({ status: "complete" })`, so keying here
// covers them all without any of them knowing this exists. The second trigger
// is an enqueue the server acknowledges after the turn already ended locally.

import type { Middleware } from "@reduxjs/toolkit";
import type { ChatRootState } from "../../../../store/root-state";
import { setInstanceStatus } from "../conversations/conversations.slice";
import { confirmInboxItem } from "./inbox.slice";
import { isStrandablePersonLine } from "./inbox.selectors";

function hasPersonLineWaiting(state: ChatRootState, conversationId: string): boolean {
  return (state.conversationInbox?.byConversationId[conversationId] ?? []).some(
    isStrandablePersonLine,
  );
}

export const inboxTurnEndMiddleware: Middleware<object, ChatRootState> =
  (store) => (next) => (action) => {
    const result = next(action);
    let conversationId: string | null = null;
    if (setInstanceStatus.match(action) && action.payload.status === "complete") {
      conversationId = action.payload.conversationId;
    } else if (confirmInboxItem.match(action)) {
      const status =
        store.getState().conversations?.byConversationId[
          action.payload.conversationId
        ]?.status;
      if (status === "complete") conversationId = action.payload.conversationId;
    }
    if (conversationId && hasPersonLineWaiting(store.getState(), conversationId)) {
      const id = conversationId;
      void import("./deliver-stranded-queue.thunk").then(({ deliverStrandedQueue }) =>
        (store.dispatch as (a: unknown) => unknown)(
          deliverStrandedQueue({ conversationId: id }),
        ),
      );
    }
    return result;
  };
