import { configureStore } from "@reduxjs/toolkit";
import { syncConversationScopes } from "./syncConversationScopes";
import { waitForConversationPersisted } from "@/features/agents/redux/execution-system/conversations/conversation-persistence";
import { ensureEntityScopes } from "./ensureEntityScopes";
import { setEntityScopes } from "./setEntityScopes";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";

jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversation-persistence",
  () => ({ waitForConversationPersisted: jest.fn() }),
);
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectScopeSelectionsContext: () => ({ topic: "scope-1" }),
}));
jest.mock("./ensureEntityScopes", () => ({
  ensureEntityScopes: jest.fn(() => async () => undefined),
  entityScopesKey: () => "conversation:conversation-1",
}));
jest.mock("./setEntityScopes", () => ({
  setEntityScopes: jest.fn(() => async () => ({ ok: true })),
}));

const mockWaitForConversationPersisted = jest.mocked(
  waitForConversationPersisted,
);
const mockEnsureEntityScopes = jest.mocked(ensureEntityScopes);
const mockSetEntityScopes = jest.mocked(setEntityScopes);

function makeHarness() {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
        actionCreatorCheck: false,
      }),
  });
  return { dispatch: store.dispatch, getState: store.getState };
}

describe("syncConversationScopes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("waits for the server-created conversation row before writing ACL-protected associations", async () => {
    let release!: (persisted: boolean) => void;
    mockWaitForConversationPersisted.mockReturnValue(
      new Promise<boolean>((resolve) => {
        release = resolve;
      }),
    );
    const { dispatch, getState } = makeHarness();

    const pending = syncConversationScopes("conversation-1")(
      dispatch,
      getState,
      undefined,
    );
    await Promise.resolve();

    expect(mockWaitForConversationPersisted).toHaveBeenCalledWith(
      "conversation-1",
    );
    expect(mockEnsureEntityScopes).not.toHaveBeenCalled();
    expect(mockSetEntityScopes).not.toHaveBeenCalled();

    release(true);
    await pending;

    expect(mockEnsureEntityScopes).toHaveBeenCalledWith(
      "conversation",
      "conversation-1",
    );
    expect(mockSetEntityScopes).toHaveBeenCalledWith({
      entityType: "conversation",
      entityId: "conversation-1",
      scopeIds: ["scope-1"],
    });
  });

  it("does not attempt the association write when the conversation never becomes readable", async () => {
    mockWaitForConversationPersisted.mockResolvedValue(false);
    const error = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { dispatch, getState } = makeHarness();

    try {
      await syncConversationScopes("conversation-1")(
        dispatch,
        getState,
        undefined,
      );

      expect(mockEnsureEntityScopes).not.toHaveBeenCalled();
      expect(mockSetEntityScopes).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        "[scopes] syncConversationScopes skipped: conversation was not persisted",
        expect.objectContaining({ conversationId: "conversation-1" }),
      );
    } finally {
      error.mockRestore();
    }
  });
});
