import type { AppDispatch, RootState } from "@host/lib/redux/store";
import { toast } from "../../../../../host/notify";
import {
  hasConversationAtExecutionBoundary,
  smartExecute,
} from "../smart-execute.thunk";
import { claimSubmit, releaseSubmitClaim } from "../submit-claims";

jest.mock("../../../../../host/notify", () => ({
  toast: { info: jest.fn() },
}));

describe("smartExecute stale conversation admission", () => {
  it("drops a resubmit of the draft already being sent as expected deduplication", async () => {
    // A second submit of a DIFFERENT draft is held, never dropped — pinned in
    // a-second-message-is-never-lost.test.ts.
    const conversationId = "duplicate-before-send";
    const dispatch = jest.fn() as unknown as AppDispatch;
    const getState = () =>
      ({
        conversations: { byConversationId: { [conversationId]: {} } },
        instanceUserInput: {
          byConversationId: {
            [conversationId]: {
              text: "same draft",
              lastSubmittedText: "same draft",
              submissionPhase: "pending",
            },
          },
        },
      }) as unknown as RootState;
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
    expect(dispatch).toHaveBeenCalledTimes(2); // pending + fulfilled only

    releaseSubmitClaim(conversationId);
    consoleDebug.mockRestore();
    consoleError.mockRestore();
  });

  it("drops a submit whose browser-local conversation was removed — telling the person, reporting no incident", async () => {
    const conversationId = "removed-before-submit";
    const dispatch = jest.fn() as unknown as AppDispatch;
    const getState = () =>
      ({
        conversations: { byConversationId: {} },
      }) as unknown as RootState;
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const consoleWarn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    (toast.info as jest.Mock).mockClear();

    await smartExecute({ conversationId })(dispatch, getState, undefined);
    await smartExecute({ conversationId })(dispatch, getState, undefined);

    expect(consoleError).not.toHaveBeenCalled();
    // Send never silently does nothing: each dropped send says so.
    expect(toast.info).toHaveBeenCalledTimes(2);
    expect(toast.info).toHaveBeenCalledWith(
      "Message not sent",
      expect.objectContaining({ description: expect.any(String) }),
    );
    consoleWarn.mockRestore();
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
        instanceUserInput: { byConversationId: {} },
        instanceResources: { byConversationId: {} },
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
