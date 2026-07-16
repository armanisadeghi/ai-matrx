/**
 * flipMessageToDbRender — after a message-content rewrite (attach-as-context,
 * unbind), re-pull the ONE `cx_message` row and flip the in-session render
 * source from the live stream anchor to the DB content.
 *
 * Clears `_streamRequestId` on EVERY message that shares the request — a
 * multi-iteration agentic turn collapses by requestId, and clearing only one
 * row would duplicate the answer. Extracted verbatim from
 * `attachBlockAsEditableContext` step 3 so unbind reuses the exact behavior.
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { updateMessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";
import { refetchSingleMessage } from "@/features/agents/redux/execution-system/message-crud/refetch-single-message.thunk";

export async function flipMessageToDbRender(
  args: { conversationId: string; messageId: string },
  deps: { dispatch: AppDispatch; getState: () => RootState },
): Promise<void> {
  const { conversationId, messageId } = args;
  await deps.dispatch(refetchSingleMessage({ conversationId, messageId }));
  const afterState = deps.getState();
  const entry = afterState.messages.byConversationId[conversationId];
  const streamReqId = entry?.byId?.[messageId]?._streamRequestId;
  if (streamReqId && entry) {
    for (const mid of entry.orderedIds) {
      const rec = entry.byId[mid];
      if (rec?._streamRequestId === streamReqId) {
        deps.dispatch(
          updateMessageRecord({
            conversationId,
            messageId: mid,
            patch: { _streamRequestId: undefined },
          }),
        );
      }
    }
  } else {
    deps.dispatch(
      updateMessageRecord({
        conversationId,
        messageId,
        patch: { _streamRequestId: undefined },
      }),
    );
  }
}
