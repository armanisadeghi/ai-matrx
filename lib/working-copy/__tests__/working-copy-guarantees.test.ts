// lib/working-copy — the two guarantees every kind inherits (2026-10-03 review).
//
// 1. A FAILED SAVE IS RETRIED BY THE PRIMITIVE, view or no view: backoff, no
//    write while offline, at once on reconnect; a permanent failure
//    (permission, conflict) stops and waits for the person; the session is
//    held until the edit is saved or the person resolved it.
// 2. NO SILENT LOST UPDATE: the base an edit started from is kept; a stored
//    state that moves under unsaved work is a CONFLICT — nothing is written
//    until the person chooses keep mine / take theirs / merge.
//
// Breaks that turn these red: a failure only marked dirty (nothing re-arms
// it), a retry that runs on permission errors, a session dropped with the edit
// unwritten, `load` moving the base under a dirty copy, a save that writes
// over a stored state it never compared, a reload draft adopted over a newer
// version without a word, an engine's "changed elsewhere" that only logs.
import { configureStore } from "@reduxjs/toolkit";
import { defineWorkingCopyKind } from "../workingCopyKind";
import workingCopiesReducer, { getWorkingCopy } from "../workingCopySlice";
import { mergeText } from "../mergeText";

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true });
});

const mkStore = () => configureStore({ reducer: { workingCopies: workingCopiesReducer } });
const flushMicro = async () => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
};

describe("a failed save is retried by the primitive", () => {
  it("retries a save that failed after the last view left, and releases the session once it lands", async () => {
    const written: string[] = [];
    let failNext = 1;
    const kind = defineWorkingCopyKind({
      entity: "wcg-retry",
      delay: () => 100,
      save: async ({ entry }) => {
        if (failNext > 0) {
          failNext -= 1;
          throw new Error("Failed to fetch");
        }
        written.push(entry.value!);
        return {};
      },
    });
    const store = mkStore();
    const release = kind.attach("dentist-intake", store);
    kind.load("dentist-intake", "Confirm insurance.");
    kind.edit("dentist-intake", "Confirm insurance, then x-rays.");
    release(); // the tile closes; its flush fails (offline)
    await flushMicro();
    expect(getWorkingCopy(store.getState(), "wcg-retry:dentist-intake")?.failure).toMatchObject({
      permanent: false,
      attempts: 1,
    });
    expect(kind.openIds()).toEqual(["dentist-intake"]); // held: the edit is unwritten

    jest.advanceTimersByTime(1_000); // first backoff step
    await flushMicro();
    expect(written).toEqual(["Confirm insurance, then x-rays."]);
    await flushMicro();
    expect(kind.openIds()).toEqual([]);
    expect(getWorkingCopy(store.getState(), "wcg-retry:dentist-intake")).toBeUndefined();
  });

  it("backs off, spends no write while offline, and retries at once when the connection returns", async () => {
    let attempts = 0;
    let online = false;
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
    const kind = defineWorkingCopyKind({
      entity: "wcg-offline",
      delay: () => 10,
      save: async () => {
        attempts += 1;
        if (!online) throw new Error("Failed to fetch");
        return {};
      },
    });
    const store = mkStore();
    const release = kind.attach("route-plan", store);
    kind.load("route-plan", "");
    kind.edit("route-plan", "Stop 1: Harbor Dental");
    release();
    await flushMicro();
    expect(attempts).toBe(1);
    jest.advanceTimersByTime(60_000); // offline: the timer fires but writes nothing
    await flushMicro();
    expect(attempts).toBe(1);
    online = true;
    window.dispatchEvent(new Event("online"));
    await flushMicro();
    expect(attempts).toBe(2);
    await flushMicro();
    expect(kind.openIds()).toEqual([]);
  });

  it("stops on a permanent failure, says so, and holds the edit until the person resolves it", async () => {
    let attempts = 0;
    const failures: Array<{ permanent: boolean; attempts: number }> = [];
    const kind = defineWorkingCopyKind({
      entity: "wcg-permanent",
      delay: () => 10,
      save: async () => {
        attempts += 1;
        throw Object.assign(new Error("new row violates row-level security policy"), { code: "42501" });
      },
      onSaveFailed: (_id, _message, _reason, failure) => failures.push(failure),
    });
    const store = mkStore();
    const release = kind.attach("shared-note", store);
    kind.load("shared-note", "v1");
    kind.edit("shared-note", "v1 edited by a viewer");
    release();
    await flushMicro();
    jest.advanceTimersByTime(10 * 60_000);
    await flushMicro();
    expect(attempts).toBe(1);
    expect(failures).toEqual([{ permanent: true, attempts: 1 }]);
    const entry = getWorkingCopy(store.getState(), "wcg-permanent:shared-note");
    expect(entry?.status).toBe("error");
    expect(entry?.failure?.permanent).toBe(true);
    expect(kind.openIds()).toEqual(["shared-note"]);
    kind.discard("shared-note"); // the person resolved it
    await flushMicro();
    expect(kind.openIds()).toEqual([]);
  });
});

describe("a stored state moving under unsaved work is a conflict", () => {
  it("load: keeps the person's text and base, writes nothing, and holds the session until they choose", async () => {
    const written: string[] = [];
    const kind = defineWorkingCopyKind({
      entity: "wcg-load",
      delay: () => 1000,
      save: ({ entry }) => {
        written.push(entry.value!);
        return {};
      },
    });
    const store = mkStore();
    const release = kind.attach("n", store);
    kind.load("n", "Line one\nLine two\nLine three", { version: 4 });
    kind.edit("n", "Line one EDITED HERE\nLine two\nLine three");
    kind.load("n", "Line one\nLine two\nLine three EDITED ON THE PHONE", { version: 5 });
    const entry = getWorkingCopy(store.getState(), "wcg-load:n")!;
    expect(entry.value).toBe("Line one EDITED HERE\nLine two\nLine three");
    expect(entry.base).toBe("Line one\nLine two\nLine three");
    expect(entry.baseVersion).toBe(4);
    expect(entry.status).toBe("conflict");
    expect(entry.conflict).toMatchObject({ theirs: "Line one\nLine two\nLine three EDITED ON THE PHONE", theirsVersion: 5 });
    release();
    jest.advanceTimersByTime(5_000);
    await flushMicro();
    expect(written).toEqual([]);
    expect(kind.openIds()).toEqual(["n"]);
  });

  it("merge writes both edits on top of the stored version; take theirs drops mine", async () => {
    const written: Array<{ value: string; base: number | null }> = [];
    const kind = defineWorkingCopyKind({
      entity: "wcg-choose",
      delay: () => 100,
      save: ({ entry }) => {
        written.push({ value: entry.value!, base: entry.baseVersion });
        return { version: (entry.baseVersion ?? 0) + 1 };
      },
    });
    const store = mkStore();
    kind.attach("a", store);
    kind.load("a", "Intro\nBody\nOutro", { version: 1 });
    kind.edit("a", "Intro (mine)\nBody\nOutro");
    kind.load("a", "Intro\nBody\nOutro (theirs)", { version: 2 });
    const merged = mergeText("Intro\nBody\nOutro", "Intro (mine)\nBody\nOutro", "Intro\nBody\nOutro (theirs)");
    expect(merged).toBe("Intro (mine)\nBody\nOutro (theirs)");
    await kind.resolveConflict("a", "merge", merged!);
    expect(written).toEqual([{ value: "Intro (mine)\nBody\nOutro (theirs)", base: 2 }]);

    kind.attach("b", store);
    kind.load("b", "Agenda", { version: 7 });
    kind.edit("b", "Agenda — mine");
    kind.load("b", "Agenda — theirs", { version: 8 });
    await kind.resolveConflict("b", "theirs");
    const b = getWorkingCopy(store.getState(), "wcg-choose:b")!;
    expect(b).toMatchObject({ value: "Agenda — theirs", dirty: false, conflict: null, baseVersion: 8 });
    jest.advanceTimersByTime(1_000);
    expect(written).toHaveLength(1);
  });

  it("the save compares the stored state first (`source`): a move nobody loaded is a conflict, not an overwrite", () => {
    let stored = "Pickup at 9";
    const written: string[] = [];
    const kind = defineWorkingCopyKind({
      entity: "wcg-source",
      delay: () => 200,
      source: () => ({ value: stored }),
      save: ({ entry }) => {
        written.push(entry.value!);
        return {};
      },
    });
    const store = mkStore();
    kind.attach("r", store);
    kind.load("r", stored);
    kind.edit("r", "Pickup at 9:30");
    stored = "Pickup at 10 (changed on the other tab)"; // landed in the debounce window
    jest.advanceTimersByTime(200);
    expect(written).toEqual([]);
    expect(getWorkingCopy(store.getState(), "wcg-source:r")?.conflict?.theirs).toBe(stored);
  });

  it("a draft kept across reload, typed on an older version, is adopted as a conflict", () => {
    const kind = defineWorkingCopyKind({ entity: "wcg-draft", autosave: false, delay: () => 0, save: () => ({}) });
    const store = mkStore();
    kind.attach("f", store);
    kind.load("f", "price: 12\nqty: 3\nnote: rush", {
      version: 6,
      draft: "price: 15\nqty: 3\nnote: rush",
      draftBaseVersion: 5,
      draftBase: "price: 12\nqty: 3",
    });
    const entry = getWorkingCopy(store.getState(), "wcg-draft:f")!;
    expect(entry.value).toBe("price: 15\nqty: 3\nnote: rush");
    expect(entry.conflict).toMatchObject({ theirs: "price: 12\nqty: 3\nnote: rush", theirsVersion: 6 });
    expect(entry.baseVersion).toBe(5);
  });

  it("a draft typed on the version that is loaded is adopted as plain unsaved work", () => {
    const kind = defineWorkingCopyKind({ entity: "wcg-draft-same", autosave: false, delay: () => 0, save: () => ({}) });
    const store = mkStore();
    kind.attach("f", store);
    kind.load("f", "a", { version: 6, draft: "a b", draftBaseVersion: 6 });
    const entry = getWorkingCopy(store.getState(), "wcg-draft-same:f")!;
    expect(entry).toMatchObject({ value: "a b", base: "a", dirty: true, conflict: null });
  });

  it("our own write's echo is never a conflict", async () => {
    let finish!: () => void;
    const kind = defineWorkingCopyKind({
      entity: "wcg-echo",
      delay: () => 10,
      save: () => new Promise<void>((resolve) => (finish = resolve)),
    });
    const store = mkStore();
    kind.attach("e", store);
    kind.load("e", "one");
    kind.edit("e", "one two");
    jest.advanceTimersByTime(10); // the save of "one two" is in flight
    kind.edit("e", "one two three"); // typing continues
    kind.load("e", "one two", { version: 2 }); // the echo lands before the response
    expect(getWorkingCopy(store.getState(), "wcg-echo:e")?.conflict).toBeNull();
    finish();
    await flushMicro();
  });

  it("an engine's 'changed elsewhere' blocks the save until the person chooses", async () => {
    const saves: string[] = [];
    const resolved: string[] = [];
    let handle!: { conflict: (moved: { ref?: string | null }) => void };
    const kind = defineWorkingCopyKind<null>({
      entity: "wcg-engine",
      delay: () => 100,
      createEngine: (h) => {
        handle = h;
        return null;
      },
      save: () => {
        saves.push("snapshot");
        return {};
      },
      resolveConflict: (_engine, choice) => void resolved.push(choice),
    });
    const store = mkStore();
    kind.attach("doc", store);
    kind.touch("doc"); // an unsaved edit in the engine
    handle.conflict({ ref: "snap-from-colleague" }); // a collaborator's snapshot landed
    expect(getWorkingCopy(store.getState(), "wcg-engine:doc")?.conflict).toMatchObject({
      theirsRef: "snap-from-colleague",
    });
    jest.advanceTimersByTime(1_000);
    await flushMicro();
    expect(saves).toEqual([]);
    await kind.resolveConflict("doc", "mine");
    expect(resolved).toEqual(["mine"]);
    expect(saves).toEqual(["snapshot"]);
  });
});

describe("mergeText", () => {
  it("merges edits on different lines and refuses overlapping ones", () => {
    expect(mergeText("a\nb\nc", "A\nb\nc", "a\nb\nC")).toBe("A\nb\nC");
    expect(mergeText("a\nb\nc", "a\nb\nc\nd", "z\na\nb\nc")).toBe("z\na\nb\nc\nd");
    expect(mergeText("a\nb\nc", "a\nB1\nc", "a\nB2\nc")).toBeNull();
    expect(mergeText("a\nb", "a\nX\nb", "a\nX\nb")).toBe("a\nX\nb");
    expect(mergeText("a", "a", "b")).toBe("b");
  });
});
