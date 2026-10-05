/**
 * AN ANSWERED ASK MOVES THE BANNER TO "WORKING" AT ONCE.
 *
 * The reconnect stamps `serverOperation` as waiting-for-input while the turn is
 * parked on a person. The answer resumes the turn on the server, but the stamp
 * stayed until the next reconnect answered — and a waiting stamp with no ask left
 * reads "The agent paused without a visible question" + Continue. The one answer
 * door (`rereadAndFollow`) calls this first: a waiting stamp becomes running, and
 * the follow that comes after re-stamps it from server truth (or clears it).
 */
import type { ChatDispatch, ChatRootState } from "../../store/root-state";
import { patchConversation } from "../redux/execution-system/conversations/conversations.slice";

export const markAnswerFollowing =
  (conversationId: string) =>
  (dispatch: ChatDispatch, getState: () => ChatRootState): void => {
    const op = getState().conversations?.byConversationId?.[conversationId]?.serverOperation;
    if (!op || !(op.status === "waiting_input" || op.waitingInput)) return;
    const { recoveryState: _gone, ...rest } = op;
    dispatch(
      patchConversation({
        conversationId,
        serverOperation: {
          ...rest,
          status: "running",
          waitingInput: false,
          checkedAt: new Date().toISOString(),
        },
      }),
    );
  };
