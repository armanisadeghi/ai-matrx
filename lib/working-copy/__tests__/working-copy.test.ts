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
import { createWorkingCopyStore } from "../workingCopyStore";

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

describe("createWorkingCopyStore", () => {
  const makeStore = () => {
    const commits: Array<[string, string]> = [];
    const store = createWorkingCopyStore<string>({
      name: "test",
      commitDelay: () => 300,
      commit: (id, value) => void commits.push([id, value]),
    });
    return { store, commits };
  };

  it("two views of one record share one copy and one commit", () => {
    const { store, commits } = makeStore();
    const seen: string[] = [];
    const releaseA = store.attach("note-route-sheet");
    const releaseB = store.attach("note-route-sheet");
    store.subscribe("note-route-sheet", () => seen.push(store.get("note-route-sheet") ?? "(none)"));
    store.edit("note-route-sheet", "Route 4: Elm St bins");
    expect(seen).toEqual(["Route 4: Elm St bins"]);
    jest.advanceTimersByTime(300);
    expect(commits).toEqual([["note-route-sheet", "Route 4: Elm St bins"]]);
    releaseA();
    releaseB();
    expect(commits).toHaveLength(1);
  });

  it("the last view leaving commits pending words and releases the copy; another view leaving does not", () => {
    const { store, commits } = makeStore();
    const releaseA = store.attach("n1");
    const releaseB = store.attach("n1");
    store.edit("n1", "half a sentence");
    releaseA();
    expect(commits).toEqual([]);
    expect(store.get("n1")).toBe("half a sentence");
    releaseB();
    expect(commits).toEqual([["n1", "half a sentence"]]);
    expect(store.get("n1")).toBeUndefined();
    jest.advanceTimersByTime(1000);
    expect(commits).toHaveLength(1);
  });

  it("adopt never clobbers pending typing, and takes the source once it is committed", () => {
    const { store } = makeStore();
    const release = store.attach("n2");
    store.edit("n2", "local words");
    expect(store.adopt("n2", "remote words")).toBe(false);
    expect(store.get("n2")).toBe("local words");
    jest.advanceTimersByTime(300);
    expect(store.adopt("n2", "remote words")).toBe(true);
    expect(store.get("n2")).toBe("remote words");
    release();
  });

  it("reset drops the pending commit (a resolved conflict is not overwritten)", () => {
    const { store, commits } = makeStore();
    const release = store.attach("n3");
    store.edit("n3", "mine");
    store.reset("n3", "resolved");
    jest.advanceTimersByTime(1000);
    release();
    expect(commits).toEqual([]);
  });
});
