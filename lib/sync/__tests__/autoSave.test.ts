/**
 * autoSave.test.ts — Phase 5 PR 5.B
 *
 * Covers the per-record autoSave scheduler (`createAutoSaveScheduler`) +
 * `definePolicy` validation of the new `autoSave` config block + the
 * middleware integration that schedules saves on triggerAction match.
 *
 * Critical invariants:
 *   - debounce collapses rapid changes to ONE write
 *   - shouldSave predicate guards each scheduled save
 *   - optimistic actions dispatch in the right order
 *   - identity swap cancels pending + in-flight
 *   - isPendingEcho reflects the live tracking set
 *   - validator rejects autoSave on non-warm-cache presets
 */

import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { definePolicy } from "../policies/define";
import { createAutoSaveScheduler } from "../engine/autoSaveScheduler";
import { createSyncMiddleware, type SyncEngineApi } from "../engine/middleware";
import type { SyncChannel } from "../channel";
import type { IdentityKey } from "../types";
import type { SyncMessage } from "../messages";

function makeFakeChannel(): SyncChannel {
    const sent: SyncMessage[] = [];
    return {
        available: true,
        post: (m: SyncMessage) => void sent.push(m),
        subscribe: () => () => {},
        setIdentity: () => {},
        close: () => {},
    } as SyncChannel;
}

const identity: IdentityKey = { type: "auth", userId: "u1", key: "auth:u1" };

interface Record1 {
    id: string;
    content: string;
    _dirty?: boolean;
    _saving?: boolean;
}

// The engine's autoSave callbacks receive `record: unknown` (the scheduler is
// record-shape-agnostic); tests narrow with this predicate instead of casting.
function isRecord1(v: unknown): v is Record1 {
    return typeof v === "object" && v !== null && "id" in v && "content" in v;
}

interface SliceState {
    records: Record<string, Record1>;
}

function makeStore(preload: SliceState = { records: {} }) {
    const slice = createSlice({
        name: "rec",
        initialState: preload,
        reducers: {
            updateContent: (
                s,
                a: PayloadAction<{ id: string; content: string }>,
            ) => {
                if (!s.records[a.payload.id]) {
                    s.records[a.payload.id] = {
                        id: a.payload.id,
                        content: "",
                    };
                }
                s.records[a.payload.id].content = a.payload.content;
                s.records[a.payload.id]._dirty = true;
            },
            markSaving: (s, a: PayloadAction<{ id: string }>) => {
                if (s.records[a.payload.id]) {
                    s.records[a.payload.id]._saving = true;
                }
            },
            markSaved: (
                s,
                a: PayloadAction<{ id: string; updatedAt?: string }>,
            ) => {
                if (s.records[a.payload.id]) {
                    s.records[a.payload.id]._dirty = false;
                    s.records[a.payload.id]._saving = false;
                }
            },
            markError: (
                s,
                a: PayloadAction<{ id: string; error: string }>,
            ) => {
                if (s.records[a.payload.id]) {
                    s.records[a.payload.id]._saving = false;
                }
            },
        },
    });

    const store = configureStore({
        reducer: { rec: slice.reducer },
        preloadedState: { rec: preload },
    });
    return { store, actions: slice.actions };
}

afterEach(() => {
    jest.useRealTimers();
});

describe("createAutoSaveScheduler — direct API", () => {
    it("debounces rapid schedule calls to one write", async () => {
        const writes: string[] = [];
        const policy = definePolicy<SliceState>({
            sliceName: "rec",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["rec/updateContent"] },
            autoSave: {
                recordsKey: "records",
                triggerActions: ["rec/updateContent"],
                debounceMs: 50,
                write: async ({ recordId, record }) => {
                    writes.push(
                        `${recordId}:${(record as Record1).content}`,
                    );
                },
            },
        });
        const { store, actions } = makeStore();
        const sched = createAutoSaveScheduler({
            policies: [policy],
            store: store as never,
            getIdentity: () => identity,
            attachPageHide: () => () => {},
            defaultDebounceMs: 50,
        });

        store.dispatch(actions.updateContent({ id: "r1", content: "a" }));
        sched.schedule("rec", "r1");
        store.dispatch(actions.updateContent({ id: "r1", content: "ab" }));
        sched.schedule("rec", "r1");
        store.dispatch(actions.updateContent({ id: "r1", content: "abc" }));
        sched.schedule("rec", "r1");

        await new Promise((r) => setTimeout(r, 80));
        expect(writes).toEqual(["r1:abc"]);
        sched.dispose();
    });

    it("shouldSave predicate skips clean records", async () => {
        const writes: string[] = [];
        const policy = definePolicy<SliceState>({
            sliceName: "rec",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["rec/updateContent"] },
            autoSave: {
                recordsKey: "records",
                triggerActions: ["rec/updateContent"],
                debounceMs: 20,
                shouldSave: (rec) =>
                    isRecord1(rec) && rec._dirty === true && !rec._saving,
                write: async ({ recordId }) => {
                    writes.push(recordId);
                },
            },
        });
        const { store } = makeStore({
            records: {
                clean: { id: "clean", content: "x", _dirty: false },
            },
        });
        const sched = createAutoSaveScheduler({
            policies: [policy],
            store: store as never,
            getIdentity: () => identity,
            attachPageHide: () => () => {},
        });
        sched.schedule("rec", "clean");
        await new Promise((r) => setTimeout(r, 30));
        expect(writes).toEqual([]);
        sched.dispose();
    });

    it("dispatches optimistic onStart/onSuccess in order", async () => {
        const dispatched: string[] = [];
        const policy = definePolicy<SliceState>({
            sliceName: "rec",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["rec/updateContent"] },
            autoSave: {
                recordsKey: "records",
                triggerActions: ["rec/updateContent"],
                debounceMs: 10,
                write: async ({ recordId }) => ({
                    id: recordId,
                    updatedAt: "now",
                }),
                optimistic: {
                    onStart: (id) => ({
                        type: "rec/markSaving",
                        payload: { id },
                    }),
                    onSuccess: (id) => ({
                        type: "rec/markSaved",
                        payload: { id, updatedAt: "now" },
                    }),
                },
            },
        });
        const { store, actions } = makeStore();
        const realDispatch = store.dispatch;
        store.dispatch = ((action: any) => {
            if (action && typeof action.type === "string") {
                dispatched.push(action.type);
            }
            return realDispatch(action);
        }) as typeof store.dispatch;

        const sched = createAutoSaveScheduler({
            policies: [policy],
            store: store as never,
            getIdentity: () => identity,
            attachPageHide: () => () => {},
        });
        store.dispatch(actions.updateContent({ id: "r1", content: "x" }));
        sched.schedule("rec", "r1");
        await new Promise((r) => setTimeout(r, 50));
        expect(dispatched).toContain("rec/markSaving");
        expect(dispatched).toContain("rec/markSaved");
        // onStart fires before onSuccess
        expect(dispatched.indexOf("rec/markSaving")).toBeLessThan(
            dispatched.indexOf("rec/markSaved"),
        );
        sched.dispose();
    });

    it("dispatches optimistic onError when write throws", async () => {
        const dispatched: string[] = [];
        const policy = definePolicy<SliceState>({
            sliceName: "rec",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["rec/updateContent"] },
            autoSave: {
                recordsKey: "records",
                triggerActions: ["rec/updateContent"],
                debounceMs: 10,
                write: async () => {
                    throw new Error("boom");
                },
                optimistic: {
                    onError: (id, error) => ({
                        type: "rec/markError",
                        payload: { id, error },
                    }),
                },
            },
        });
        const { store, actions } = makeStore();
        const realDispatch = store.dispatch;
        store.dispatch = ((action: any) => {
            if (action && typeof action.type === "string") {
                dispatched.push(action.type);
            }
            return realDispatch(action);
        }) as typeof store.dispatch;

        const sched = createAutoSaveScheduler({
            policies: [policy],
            store: store as never,
            getIdentity: () => identity,
            attachPageHide: () => () => {},
        });
        store.dispatch(actions.updateContent({ id: "r1", content: "x" }));
        sched.schedule("rec", "r1");
        await new Promise((r) => setTimeout(r, 50));
        expect(dispatched).toContain("rec/markError");
        sched.dispose();
    });

    it("isPendingEcho is true while scheduled, false after write resolves", async () => {
        const policy = definePolicy<SliceState>({
            sliceName: "rec",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["rec/updateContent"] },
            autoSave: {
                recordsKey: "records",
                triggerActions: ["rec/updateContent"],
                debounceMs: 30,
                trackEchoes: true,
                write: async () => {},
            },
        });
        const { store, actions } = makeStore();
        const sched = createAutoSaveScheduler({
            policies: [policy],
            store: store as never,
            getIdentity: () => identity,
            attachPageHide: () => () => {},
        });
        store.dispatch(actions.updateContent({ id: "r1", content: "x" }));
        sched.schedule("rec", "r1");
        expect(sched.isPendingEcho("rec", "r1")).toBe(true);
        await new Promise((r) => setTimeout(r, 60));
        expect(sched.isPendingEcho("rec", "r1")).toBe(false);
        sched.dispose();
    });

    it("identity swap cancels pending + in-flight", async () => {
        const writes: string[] = [];
        const policy = definePolicy<SliceState>({
            sliceName: "rec",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["rec/updateContent"] },
            autoSave: {
                recordsKey: "records",
                triggerActions: ["rec/updateContent"],
                debounceMs: 100,
                write: async ({ recordId }) => writes.push(recordId),
            },
        });
        const { store, actions } = makeStore();
        const sched = createAutoSaveScheduler({
            policies: [policy],
            store: store as never,
            getIdentity: () => identity,
            attachPageHide: () => () => {},
        });
        store.dispatch(actions.updateContent({ id: "r1", content: "x" }));
        sched.schedule("rec", "r1");
        sched.onIdentitySwap();
        await new Promise((r) => setTimeout(r, 130));
        expect(writes).toEqual([]);
        sched.dispose();
    });

    it("flush(slice, id) runs the write immediately", async () => {
        const writes: string[] = [];
        const policy = definePolicy<SliceState>({
            sliceName: "rec",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["rec/updateContent"] },
            autoSave: {
                recordsKey: "records",
                triggerActions: ["rec/updateContent"],
                debounceMs: 5_000,
                write: async ({ recordId }) => void writes.push(recordId),
            },
        });
        const { store, actions } = makeStore();
        const sched = createAutoSaveScheduler({
            policies: [policy],
            store: store as never,
            getIdentity: () => identity,
            attachPageHide: () => () => {},
        });
        store.dispatch(actions.updateContent({ id: "r1", content: "x" }));
        sched.schedule("rec", "r1");
        await sched.flush("rec", "r1");
        expect(writes).toEqual(["r1"]);
        sched.dispose();
    });

    it("adaptive debounceMs receives the record", async () => {
        const seen: number[] = [];
        const policy = definePolicy<SliceState>({
            sliceName: "rec",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["rec/updateContent"] },
            autoSave: {
                recordsKey: "records",
                triggerActions: ["rec/updateContent"],
                debounceMs: (rec) => {
                    if (!isRecord1(rec)) return 10;
                    seen.push(rec.content.length);
                    return 10;
                },
                write: async () => {},
            },
        });
        const { store, actions } = makeStore();
        const sched = createAutoSaveScheduler({
            policies: [policy],
            store: store as never,
            getIdentity: () => identity,
            attachPageHide: () => () => {},
        });
        store.dispatch(
            actions.updateContent({ id: "r1", content: "abcdef" }),
        );
        sched.schedule("rec", "r1");
        await new Promise((r) => setTimeout(r, 30));
        expect(seen).toContain(6);
        sched.dispose();
    });
});

describe("definePolicy validates autoSave block", () => {
    it("rejects autoSave on non-warm-cache presets", () => {
        expect(() =>
            definePolicy<SliceState>({
                sliceName: "rec",
                preset: "boot-critical",
                version: 1,
                broadcast: { actions: ["rec/updateContent"] },
                storageKey: "matrx:rec",
                partialize: ["records"],
                autoSave: {
                    recordsKey: "records",
                    triggerActions: ["rec/updateContent"],
                    write: async () => {},
                },
            }),
        ).toThrow(/autoSave is only legal on the "warm-cache" preset/);
    });

    it("rejects empty triggerActions", () => {
        expect(() =>
            definePolicy<SliceState>({
                sliceName: "rec",
                preset: "warm-cache",
                version: 1,
                broadcast: { actions: ["rec/updateContent"] },
                autoSave: {
                    recordsKey: "records",
                    triggerActions: [],
                    write: async () => {},
                },
            }),
        ).toThrow(/triggerActions must be a non-empty array/);
    });

    it("rejects non-function write", () => {
        expect(() =>
            definePolicy<SliceState>({
                sliceName: "rec",
                preset: "warm-cache",
                version: 1,
                broadcast: { actions: ["rec/updateContent"] },
                autoSave: {
                    recordsKey: "records",
                    triggerActions: ["rec/updateContent"],
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    write: "not a function" as any,
                },
            }),
        ).toThrow(/autoSave\.write must be a function/);
    });

    it("rejects negative debounceMs", () => {
        expect(() =>
            definePolicy<SliceState>({
                sliceName: "rec",
                preset: "warm-cache",
                version: 1,
                broadcast: { actions: ["rec/updateContent"] },
                autoSave: {
                    recordsKey: "records",
                    triggerActions: ["rec/updateContent"],
                    debounceMs: -1,
                    write: async () => {},
                },
            }),
        ).toThrow(/debounceMs \(number\) must be >= 0/);
    });

    it("accepts a fully-formed autoSave config", () => {
        const policy = definePolicy<SliceState>({
            sliceName: "rec",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["rec/updateContent"] },
            autoSave: {
                recordsKey: "records",
                triggerActions: ["rec/updateContent"],
                debounceMs: 100,
                write: async () => {},
                optimistic: {
                    onStart: (id) => ({ type: "rec/markSaving", payload: { id } }),
                },
                trackEchoes: true,
            },
        });
        expect(policy.config.autoSave?.recordsKey).toBe("records");
        expect(policy.config.autoSave?.trackEchoes).toBe(true);
    });
});

describe("middleware integration — schedules autoSave on triggerActions", () => {
    it("schedules a save when an autoSave-trigger action lands", async () => {
        const writes: string[] = [];
        const policy = definePolicy<SliceState>({
            sliceName: "rec",
            preset: "warm-cache",
            version: 1,
            broadcast: { actions: ["rec/updateContent"] },
            autoSave: {
                recordsKey: "records",
                triggerActions: ["rec/updateContent"],
                debounceMs: 30,
                write: async ({ recordId }) =>
                    void writes.push(recordId),
            },
        });
        const apiRef: { current: SyncEngineApi | null } = { current: null };
        const channel = makeFakeChannel();
        const slice = createSlice({
            name: "rec",
            initialState: { records: {} } as SliceState,
            reducers: {
                updateContent: (
                    s,
                    a: PayloadAction<{ id: string; content: string }>,
                ) => {
                    if (!s.records[a.payload.id]) {
                        s.records[a.payload.id] = {
                            id: a.payload.id,
                            content: "",
                        };
                    }
                    s.records[a.payload.id].content = a.payload.content;
                    s.records[a.payload.id]._dirty = true;
                },
            },
        });
        const store = configureStore({
            reducer: { rec: slice.reducer },
            middleware: (gDM) =>
                gDM().concat(
                    createSyncMiddleware({
                        policies: [policy],
                        channel,
                        getIdentity: () => identity,
                        apiRef,
                    }),
                ),
        });
        store.dispatch(
            slice.actions.updateContent({ id: "r1", content: "x" }),
        );
        // The middleware schedules a save; isPendingEcho would be true if
        // tracking enabled (this test doesn't enable trackEchoes — the
        // engine still routes the schedule).
        await new Promise((r) => setTimeout(r, 60));
        expect(writes).toEqual(["r1"]);
    });
});
