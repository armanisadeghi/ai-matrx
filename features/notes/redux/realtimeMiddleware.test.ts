import type { MiddlewareAPI } from "@reduxjs/toolkit";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { RootState } from "@/lib/redux/rootReducer";
import { supabase } from "@/utils/supabase/client";
import { fetchNotesList } from "./thunks";
import { notesRealtimeMiddleware } from "./realtimeMiddleware";

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

type SubscriptionCallback = (
  status: "CHANNEL_ERROR",
  error: Error,
) => void;

const subscriptionCallbacks: SubscriptionCallback[] = [];

const mockChannel = {
  on: jest.fn(),
  subscribe: jest.fn(),
};
const channelMock = jest.mocked(supabase.channel);

describe("notes realtime disconnect logging", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    subscriptionCallbacks.length = 0;
    mockChannel.on.mockReturnValue(mockChannel);
    mockChannel.subscribe.mockImplementation((callback: SubscriptionCallback) => {
      subscriptionCallbacks.push(callback);
      return mockChannel;
    });
    channelMock.mockReturnValue(mockChannel as unknown as RealtimeChannel);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("keeps a self-healing socket close out of error capture until reconnects repeatedly fail", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const dispatched: unknown[] = [];
    const state = {
      userAuth: { id: "user-1" },
    } as RootState;
    const storeApi = {
      getState: () => state,
      dispatch: (action: unknown) => {
        dispatched.push(action);
        return action;
      },
    } as MiddlewareAPI;
    const next = jest.fn((action: unknown) => action);
    const handle = notesRealtimeMiddleware(storeApi)(next);

    handle(fetchNotesList.fulfilled(undefined, "request-1", undefined));
    expect(subscriptionCallbacks).toHaveLength(1);

    const socketClosed = new Error("socket closed: 1006");
    subscriptionCallbacks[0]("CHANNEL_ERROR", socketClosed);

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[Notes RT] channel dropped (reconnecting):",
      socketClosed,
    );
    expect(dispatched).toContainEqual({
      type: "notes/setRealtimeConnected",
      payload: false,
    });

    subscriptionCallbacks[0]("CHANNEL_ERROR", socketClosed);
    subscriptionCallbacks[0]("CHANNEL_ERROR", socketClosed);
    expect(error).not.toHaveBeenCalled();

    subscriptionCallbacks[0]("CHANNEL_ERROR", socketClosed);
    expect(error).toHaveBeenCalledWith(
      "[Notes RT] realtime still down after 3 reconnect attempts — live note sync is broken for this session:",
      socketClosed,
    );

    handle({ type: "notes/resetNotesState" });
    warn.mockRestore();
    error.mockRestore();
  });
});
