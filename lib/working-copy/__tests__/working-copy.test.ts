// lib/working-copy — one session per record, one commit per record.
//
// Breaks these catch: a session built per acquire (two views → two copies),
// the last release not flushing (a closing view drops typing), a release while
// another view holds the record flushing or dropping it, a commit per view
// (two saves of one record), overlapping commits, adopt clobbering pending
// typing, and a re-acquire during a slow flush building a fresh session from a
// stale source.
import { createCoalescedCommit } from "../coalescedCommit";
import { createRecordSessionRegistry } from "../recordSessions";
import { configureStore } from "@reduxjs/toolkit";
import { defineWorkingCopyKind } from "../workingCopyKind";
import workingCopiesReducer, { getWorkingCopy } from "../workingCopySlice";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("createRecordSessionRegistry", () => {
  it("gives every holder of a record the same session and closes it once, after the last", () => {
    const opened: string[] = [];
    const closed: string[] = [];
    const registry = createRecordSessionRegistry<{ id: string }>({
      open: (id) => {
        opened.push(id);
        return { id };
      },
      close: (session) => closed.push(session.id),
    });
    const tile = registry.acquire("pickup-route-monday");
    const panel = registry.acquire("pickup-route-monday");
    const other = registry.acquire("pickup-route-tuesday");
    expect(tile.session).toBe(panel.session);
    expect(other.session).not.toBe(tile.session);
    tile.release();
    tile.release(); // idempotent
    expect(closed).toEqual([]);
    panel.release();
    expect(closed).toEqual(["pickup-route-monday"]);
    expect(opened).toEqual(["pickup-route-monday", "pickup-route-tuesday"]);
    other.release();
    expect(closed).toEqual(["pickup-route-monday", "pickup-route-tuesday"]);
  });

  it("hands a returning view the SAME session while its last view's flush is still settling", async () => {
    let finishFlush!: () => void;
    let pending = true;
    const registry = createRecordSessionRegistry<{ text: string }>({
      open: () => ({ text: "stored" }),
      lastViewGone: () =>
        new Promise<void>((resolve) => {
          finishFlush = () => {
            pending = false;
            resolve();
          };
        }),
      canDrop: () => !pending,
    });
    const first = registry.acquire("dental-intake");
    first.session.text = "typed before the tile slept";
    first.release();
    const woken = registry.acquire("dental-intake");
    expect(woken.session.text).toBe("typed before the tile slept");
    finishFlush();
    await Promise.resolve();
    await Promise.resolve();
    expect(registry.peek("dental-intake")).toBe(woken.session);
    woken.release();
  });
});

describe("createCoalescedCommit", () => {
  it("commits a burst of edits once, with the latest state", () => {
    let state = "";
    const runs: string[] = [];
    const commit = createCoalescedCommit({ delay: () => 200, read: () => state, run: (v) => void runs.push(v) });
    for (const word of ["Pick", "Pickup", "Pickup at 9"]) {
      state = word;
      commit.schedule();
      jest.advanceTimersByTime(100);
    }
    expect(runs).toEqual([]);
    jest.advanceTimersByTime(200);
    expect(runs).toEqual(["Pickup at 9"]);
    expect(commit.hasPending()).toBe(false);
  });

  it("never overlaps two writes; an edit during a write commits right after it", async () => {
    let state = "v1";
    const started: string[] = [];
    const finishers: Array<() => void> = [];
    const commit = createCoalescedCommit({
      delay: () => 0,
      read: () => state,
      run: (v) =>
        new Promise<void>((resolve) => {
          started.push(v);
          finishers.push(resolve);
        }),
    });
    commit.schedule();
    const first = commit.flush();
    state = "v2";
    commit.schedule();
    jest.advanceTimersByTime(10);
    const second = commit.flush();
    expect(started).toEqual(["v1"]); // still one write in flight
    finishers[0]();
    for (let i = 0; i < 10 && started.length < 2; i += 1) await Promise.resolve();
    expect(started).toEqual(["v1", "v2"]);
    expect(commit.isBusy()).toBe(true);
    finishers[1]();
    await Promise.all([first, second]);
    expect(commit.hasPending()).toBe(false);
    expect(commit.isBusy()).toBe(false);
  });

  it("a flush during a write with nothing new waits for it instead of writing a duplicate", async () => {
    const runs: string[] = [];
    let finish!: () => void;
    const commit = createCoalescedCommit({
      delay: () => 0,
      read: () => "route sheet v1",
      run: (v) =>
        new Promise<void>((resolve) => {
          runs.push(v);
          finish = resolve;
        }),
    });
    commit.schedule();
    const first = commit.flush();
    const second = commit.flush(); // the last view leaving while the save is in flight
    finish();
    await Promise.all([first, second]);
    expect(runs).toEqual(["route sheet v1"]);
  });

  it("keeps a failed commit pending so the next flush retries it", async () => {
    let fail = true;
    const runs: string[] = [];
    const commit = createCoalescedCommit({
      delay: () => 0,
      read: () => "invoice draft",
      run: (v) => {
        if (fail) throw new Error("network down");
        runs.push(v);
      },
      onError: () => {},
    });
    commit.schedule();
    jest.advanceTimersByTime(1);
    expect(commit.hasPending()).toBe(true);
    fail = false;
    await commit.flush();
    expect(runs).toEqual(["invoice draft"]);
    expect(commit.hasPending()).toBe(false);
  });
});

describe("defineWorkingCopyKind (Redux-backed)", () => {
  const makeKind = () => {
    const commits: Array<[string, string]> = [];
    const kind = defineWorkingCopyKind({
      entity: `route-sheet-${Math.random().toString(36).slice(2, 8)}`,
      delay: () => 300,
      save: ({ id, entry }) => {
        commits.push([id, entry.value ?? ""]);
        return { value: entry.value, savedAt: null };
      },
    });
    const store = configureStore({ reducer: { workingCopies: workingCopiesReducer } });
    const value = (id: string) => getWorkingCopy(store.getState(), kind.key(id))?.value;
    return { kind, store, commits, value };
  };

  it("two views of one record share one copy in Redux and one commit", () => {
    const { kind, store, commits, value } = makeKind();
    const releaseA = kind.attach("monday", store);
    const releaseB = kind.attach("monday", store);
    kind.load("monday", "Route 4");
    kind.edit("monday", "Route 4: Elm St bins");
    expect(value("monday")).toBe("Route 4: Elm St bins");
    expect(getWorkingCopy(store.getState(), kind.key("monday"))?.views).toBe(2);
    jest.advanceTimersByTime(300);
    expect(commits).toEqual([["monday", "Route 4: Elm St bins"]]);
    releaseA();
    releaseB();
    expect(commits).toHaveLength(1);
  });

  it("the last view leaving commits pending words and releases the entry; another view leaving does not", () => {
    const { kind, store, commits, value } = makeKind();
    const releaseA = kind.attach("n1", store);
    const releaseB = kind.attach("n1", store);
    kind.load("n1", "");
    kind.edit("n1", "half a sentence");
    releaseA();
    expect(commits).toEqual([]);
    expect(value("n1")).toBe("half a sentence");
    releaseB();
    expect(commits).toEqual([["n1", "half a sentence"]]);
    expect(store.getState().workingCopies.byKey[kind.key("n1")]).toBeUndefined();
    jest.advanceTimersByTime(1000);
    expect(commits).toHaveLength(1);
  });

  it("a moved source never clobbers pending typing, and is taken once it is committed", () => {
    const { kind, store, value } = makeKind();
    const release = kind.attach("n2", store);
    kind.load("n2", "stored words");
    kind.edit("n2", "local words");
    kind.load("n2", "remote words");
    expect(value("n2")).toBe("local words");
    jest.advanceTimersByTime(300);
    kind.load("n2", "remote words again");
    expect(value("n2")).toBe("remote words again");
    release();
  });

  it("reset drops the pending commit (a resolved conflict is not overwritten)", () => {
    const { kind, store, commits } = makeKind();
    const release = kind.attach("n3", store);
    kind.load("n3", "theirs");
    kind.edit("n3", "mine");
    kind.reset("n3", "resolved");
    jest.advanceTimersByTime(1000);
    release();
    expect(commits).toEqual([]);
  });

  it("autosave: false waits for an explicit save, and the last view leaving writes it once", async () => {
    const saves: string[] = [];
    const kind = defineWorkingCopyKind({
      entity: "lease-text",
      autosave: false,
      delay: () => 0,
      save: async ({ entry }) => {
        saves.push(entry.value ?? "");
        return { value: entry.value };
      },
    });
    const store = configureStore({ reducer: { workingCopies: workingCopiesReducer } });
    const release = kind.attach("unit-4b", store);
    kind.load("unit-4b", "Rent due on the 1st");
    kind.edit("unit-4b", "Rent due on the 1st; late fee after the 5th");
    jest.advanceTimersByTime(10_000);
    expect(saves).toEqual([]);
    release();
    await Promise.resolve();
    expect(saves).toEqual(["Rent due on the 1st; late fee after the 5th"]);
  });
});
