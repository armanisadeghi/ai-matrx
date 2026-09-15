// Audit N-05 — a failed save never retried itself.
//
// The middleware is action-triggered: a save that failed while the wifi was
// down was re-issued only by the user's NEXT keystroke. A student who stops
// typing when class ends and reconnects an hour later had nothing behind them
// — the note simply stayed unsaved. These tests hold the three halves of the
// fix: a failure arms a backoff, the delay doubles and caps, and `online` (or
// the tab becoming visible) re-issues immediately.

import { autoSaveMiddleware, createNotesReconnectRetry, type NotesReconnectRetry } from "./autoSaveMiddleware";

const saveNote = jest.fn();

jest.mock("./thunks", () => ({
  saveNote: (noteId: string) => saveNote(noteId),
}));

type FakeRecord = {
  id: string;
  content: string;
  _dirty: boolean;
  _consecutiveSaveFailures: number;
  _dirtyFields: Set<string>;
  label: string;
};

function record(over: Partial<FakeRecord> = {}): FakeRecord {
  return {
    id: "note-1",
    content: "the essay so far",
    _dirty: true,
    _consecutiveSaveFailures: 1,
    _dirtyFields: new Set(["content"]),
    label: "Essay",
    ...over,
  };
}

let live: NotesReconnectRetry | null = null;

function harness(initial: FakeRecord) {
  const state = {
    notes: { notes: { [initial.id]: initial } },
    userAuth: { id: "user-1" },
  };
  const dispatch = jest.fn((action: unknown) => action);
  live = createNotesReconnectRetry({ getState: () => state, dispatch } as never);
  return { state, dispatch, retry: live };
}

/** A failing save: dispatch returns the thunk's result, `.unwrap()` throws. */
function failingSave() {
  saveNote.mockImplementation((noteId: string) => ({
    type: "notes/saveNote",
    noteId,
    unwrap: async () => {
      throw new Error("Failed to fetch");
    },
  }));
}

describe("autoSave reconnect retry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    saveNote.mockReset();
    failingSave();
  });
  afterEach(() => {
    live?.dispose();
    live = null;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("the middleware wires the reconnect listener for its store", () => {
    const addEventListener = jest.spyOn(window, "addEventListener");
    try {
      const controller = autoSaveMiddleware({
        getState: () => ({ notes: { notes: {} }, userAuth: { id: "user-1" } }),
        dispatch: jest.fn(),
      } as never);
      controller(((a: unknown) => a) as never);
      expect(addEventListener).toHaveBeenCalledWith("online", expect.any(Function));
    } finally {
      addEventListener.mockRestore();
    }
  });

  it("re-issues the save for a failed dirty note when the browser comes back online", async () => {
    harness(record());

    window.dispatchEvent(new Event("online"));
    await Promise.resolve();
    await Promise.resolve();

    expect(saveNote).toHaveBeenCalledTimes(1);
    expect(saveNote).toHaveBeenCalledWith("note-1");
  });

  it("re-issues the save when a hidden tab becomes visible again", async () => {
    harness(record());

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    await Promise.resolve();

    expect(saveNote).toHaveBeenCalledTimes(1);
  });

  it("does not retry a note the database already holds", async () => {
    harness(record({ _dirty: false, _consecutiveSaveFailures: 0 }));

    window.dispatchEvent(new Event("online"));
    await jest.advanceTimersByTimeAsync(60_000);

    expect(saveNote).not.toHaveBeenCalled();
  });

  it("backs off 1s → 2s → 4s instead of looping tight, and stops once the note is clean", async () => {
    const row = record();
    harness(row);

    window.dispatchEvent(new Event("online"));
    await Promise.resolve();
    await Promise.resolve();
    expect(saveNote).toHaveBeenCalledTimes(1);

    // Nothing happens before the first backoff elapses.
    await jest.advanceTimersByTimeAsync(1_999);
    expect(saveNote).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(saveNote).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(3_999);
    expect(saveNote).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(saveNote).toHaveBeenCalledTimes(3);

    // The save finally lands: the record goes clean and the loop must stop.
    row._dirty = false;
    row._consecutiveSaveFailures = 0;
    await jest.advanceTimersByTimeAsync(120_000);
    expect(saveNote).toHaveBeenCalledTimes(3);
  });

  it("spends no write while the browser reports itself offline", async () => {
    const onLine = jest.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    try {
      harness(record());
      window.dispatchEvent(new Event("online"));
      await jest.advanceTimersByTimeAsync(29_000);
      expect(saveNote).not.toHaveBeenCalled();
    } finally {
      onLine.mockRestore();
    }
  });
});
