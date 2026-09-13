import type { AppDispatch, RootState } from "@/lib/redux/store";
import { destroyInstance } from "../conversations.slice";
import { destroyInstanceIfAbandoned } from "../conversations.thunks";

const CONVERSATION_ID = "ambient-handoff";

function stateWithInput(
  submissionPhase: "idle" | "pending" | "persisted",
  text: string,
): RootState {
  return {
    conversations: {
      debugSessionActive: false,
      byConversationId: {
        [CONVERSATION_ID]: { status: "ready" },
      },
    },
    messages: {
      byConversationId: {
        [CONVERSATION_ID]: { orderedIds: [] },
      },
    },
    instanceUserInput: {
      byConversationId: {
        [CONVERSATION_ID]: {
          submissionPhase,
          text,
        },
      },
    },
  } as unknown as RootState;
}

function runCleanup(state: RootState) {
  const dispatch = jest.fn() as unknown as AppDispatch;
  destroyInstanceIfAbandoned(CONVERSATION_ID)(
    dispatch,
    () => state,
    undefined,
  );
  return dispatch;
}

describe("destroyInstanceIfAbandoned", () => {
  it("preserves a message-less conversation while its first turn is pending", () => {
    const dispatch = runCleanup(stateWithInput("pending", "Do not lose me"));

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("preserves an unsent draft even before the first message exists", () => {
    const dispatch = runCleanup(stateWithInput("idle", "Still composing"));

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("removes a truly empty idle conversation", () => {
    const dispatch = runCleanup(stateWithInput("idle", ""));

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(destroyInstance(CONVERSATION_ID));
  });
});
