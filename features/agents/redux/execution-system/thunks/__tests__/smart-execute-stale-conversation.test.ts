import type { AppDispatch, RootState } from "@/lib/redux/store";
import { toast } from "@/lib/toast";
import {
  hasConversationAtExecutionBoundary,
  smartExecute,
} from "../smart-execute.thunk";
import { claimSubmit, releaseSubmitClaim } from "../submit-claims";

jest.mock("@/lib/toast", () => ({
  toast: { info: jest.fn() },
}));

describe("smartExecute stale conversation admission", () => {
  it("treats a rejected duplicate admission as expected deduplication", async () => {
    const conversationId = "duplicate-before-send";
    const dispatch = jest.fn() as unknown as AppDispatch;
    const getState = jest.fn() as unknown as () => RootState;
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const consoleDebug = jest
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);

    expect(claimSubmit(conversationId)).toBe(true);
    await smartExecute({ conversationId })(dispatch, getState, undefined);

    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleDebug).toHaveBeenCalledWith(
      expect.stringContaining("duplicate submit dropped"),
    );
    expect(getState).not.toHaveBeenCalled();

    releaseSubmitClaim(conversationId);
    consoleDebug.mockRestore();
    consoleError.mockRestore();
  });

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

  it("rejects a conversation removed during asynchronous preflight at final admission", () => {
    const conversationId = "removed-during-preflight";
    const beforePreflight = {
      conversations: {
        byConversationId: { [conversationId]: { organizationId: "org-1" } },
      },
    } as unknown as RootState;
    const afterPreflight = {
      conversations: { byConversationId: {} },
    } as unknown as RootState;

    expect(
      hasConversationAtExecutionBoundary(beforePreflight, conversationId),
    ).toBe(true);
    expect(
      hasConversationAtExecutionBoundary(afterPreflight, conversationId),
    ).toBe(false);
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
