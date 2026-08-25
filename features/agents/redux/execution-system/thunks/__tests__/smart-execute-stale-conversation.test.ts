import type { AppDispatch, RootState } from "@/lib/redux/store";
import { toast } from "@/lib/toast";
import { smartExecute } from "../smart-execute.thunk";

jest.mock("@/lib/toast", () => ({
  toast: { info: jest.fn() },
}));

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

  it("keeps missing-organization validation visible without reporting an incident", async () => {
    const conversationId = "new-conversation-without-org";
    const dispatch = jest.fn() as unknown as AppDispatch;
    const getState = () =>
      ({
        conversations: {
          byConversationId: {
            [conversationId]: { cacheOnly: true, organizationId: null },
          },
        },
        appContext: { organization_id: null },
      }) as unknown as RootState;
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await smartExecute({ conversationId })(dispatch, getState, undefined);

    expect(consoleError).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith("Organization required", {
      description:
        "Select an organization before sending this message. The request was not sent.",
    });
    consoleError.mockRestore();
  });
});
