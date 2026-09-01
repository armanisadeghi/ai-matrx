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
  status: "SUBSCRIBED" | "CHANNEL_ERROR",
  error?: Error,
) => void;

const subscriptionCallbacks: SubscriptionCallback[] = [];
const changeCallbacks: Array<(payload: unknown) => void> = [];

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
    changeCallbacks.length = 0;
    mockChannel.on.mockImplementation((_event, _filter, callback) => {
      changeCallbacks.push(callback as (payload: unknown) => void);
      return mockChannel;
    });
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

  it("keeps socket closes quiet through the 30s recovery window, then captures a sustained outage", () => {
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
    subscriptionCallbacks[0]("CHANNEL_ERROR", socketClosed);
    subscriptionCallbacks[0]("CHANNEL_ERROR", socketClosed);
    expect(error).not.toHaveBeenCalled();

    subscriptionCallbacks[0]("CHANNEL_ERROR", socketClosed);
    expect(error).toHaveBeenCalledWith(
      "[Notes RT] realtime still down after 5 reconnect attempts — live note sync is broken for this session:",
      socketClosed,
    );

    handle({ type: "notes/resetNotesState" });
    warn.mockRestore();
    error.mockRestore();
  });

  it("drops a stale subscribed callback after auth identity disappears", () => {
    const dispatched: unknown[] = [];
    const state = {
      userAuth: { id: "user-1" as string | null },
    } as RootState;
    const storeApi = {
      getState: () => state,
      dispatch: (action: unknown) => {
        dispatched.push(action);
        return action;
      },
    } as MiddlewareAPI;
    const handle = notesRealtimeMiddleware(storeApi)(
      jest.fn((action: unknown) => action),
    );

    handle(fetchNotesList.fulfilled(undefined, "request-1", undefined));
    expect(subscriptionCallbacks).toHaveLength(1);

    state.userAuth.id = null;
    subscriptionCallbacks[0]("SUBSCRIBED");

    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
    expect(dispatched).not.toContainEqual(
      expect.objectContaining({ type: "notes/fetchNotesList/pending" }),
    );
    expect(dispatched).not.toContainEqual(
      expect.objectContaining({ type: "notes/fetchSharedNotesList/pending" }),
    );
  });

  it("drops a queued realtime payload after auth identity disappears without issuing editor RPCs", () => {
    const state = {
      userAuth: { id: "user-1" as string | null },
      notes: { notes: {}, _savingNoteIds: [], noteEditors: {} },
    } as unknown as RootState;
    const storeApi = {
      getState: () => state,
      dispatch: jest.fn((action: unknown) => action),
    } as unknown as MiddlewareAPI;
    const handle = notesRealtimeMiddleware(storeApi)(
      jest.fn((action: unknown) => action),
    );

    handle(fetchNotesList.fulfilled(undefined, "request-1", undefined));
    expect(changeCallbacks).toHaveLength(1);

    state.userAuth.id = null;
    changeCallbacks[0]({
      eventType: "UPDATE",
      new: {
        id: "note-1",
        updated_by: "other-user",
        updated_at: "2026-08-30T19:12:39.529Z",
      },
      old: {},
    });

    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
    expect(storeApi.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "notes/setNoteEditor" }),
    );
  });
});
