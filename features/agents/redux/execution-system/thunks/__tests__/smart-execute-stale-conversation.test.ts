import type { AppDispatch, RootState } from "@/lib/redux/store";
import { smartExecute } from "../smart-execute.thunk";

describe("smartExecute stale conversation admission", () => {
  it("quietly drops a submit whose browser-local conversation was removed", async () => {
    const conversationId = "removed-before-submit";
    const dispatch = jest.fn() as unknown as AppDispatch;
    const getState = () =>
      ({
        conversations: { byConversationId: {} },
      }) as unknown as RootState;
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await smartExecute({ conversationId })(dispatch, getState, undefined);
    await smartExecute({ conversationId })(dispatch, getState, undefined);

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
