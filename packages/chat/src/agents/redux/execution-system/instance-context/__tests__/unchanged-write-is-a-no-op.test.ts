/**
 * AN UNCHANGED CONTEXT WRITE IS A NO-OP — regression guard.
 *
 * Defect (2026-09-30): every context write built fresh entry objects, so a
 * writer re-sending the SAME value (the canvas chat re-seeds its snapshot on
 * every pointer-down / focus / Enter; the page-follow refresh re-reads the
 * page on every turn) handed `selectInstanceContextEntries` a new map, the
 * selector a new array, and the composer's context rail, page chip and open
 * detail panel all re-rendered for nothing. The break this catches: any of
 * `setContextEntries`, `setContextEntry` or `replaceSurfaceContextEntries`
 * replacing a conversation's entries when nothing about them changed.
 *
 * Real reducer, real selector, one selector instance across dispatches —
 * exactly how the rail reads it. Each no-op case has a changed twin that MUST
 * produce a new reference, so a reducer that ignores every write fails too.
 */

import { configureStore } from "@reduxjs/toolkit";
import type { ChatRootState } from "../../../../../store/root-state";
import type { InstanceContextEntry } from "../../../../types/instance.types";
import instanceContextReducer, {
  replaceSurfaceContextEntries,
  setContextEntries,
  setContextEntry,
} from "../instance-context.slice";
import { selectInstanceContextEntries } from "../instance-context.selectors";

const CONVERSATION_ID = "conv-pickup-schedule-chat";

/** A recycling company's route note, as the canvas snapshot hands it over. */
function routeSnapshot() {
  return {
    key: "canvas_board",
    label: "Board",
    value: {
      title: "Tuesday commercial pickups — North route",
      stops: [
        { customer: "Harborview Bistro", bins: 3, window: "06:30-08:00" },
        { customer: "Lakeside Dental Group", bins: 1, window: "08:15-09:00" },
      ],
    },
  };
}

function makeStore() {
  return configureStore({
    reducer: { instanceContext: instanceContextReducer },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

type Store = ReturnType<typeof makeStore>;

function entriesOf(store: Store, select: ReturnType<typeof selectInstanceContextEntries>) {
  return select(store.getState() as unknown as ChatRootState);
}

function surfaceEntry(key: string, label: string, value: unknown): InstanceContextEntry {
  return { key, label, value, slotMatched: false, type: "text" };
}

describe("setContextEntries", () => {
  it("keeps the same entries reference when a fresh but equal value is re-sent", () => {
    const store = makeStore();
    const select = selectInstanceContextEntries(CONVERSATION_ID);
    store.dispatch(setContextEntries({ conversationId: CONVERSATION_ID, entries: [routeSnapshot()] }));
    const before = entriesOf(store, select);
    const mapBefore = store.getState().instanceContext.byConversationId[CONVERSATION_ID];

    store.dispatch(setContextEntries({ conversationId: CONVERSATION_ID, entries: [routeSnapshot()] }));

    expect(store.getState().instanceContext.byConversationId[CONVERSATION_ID]).toBe(mapBefore);
    expect(entriesOf(store, select)).toBe(before);
  });

  it("publishes a new reference when a stop's bin count changes", () => {
    const store = makeStore();
    const select = selectInstanceContextEntries(CONVERSATION_ID);
    store.dispatch(setContextEntries({ conversationId: CONVERSATION_ID, entries: [routeSnapshot()] }));
    const before = entriesOf(store, select);

    const changed = routeSnapshot();
    changed.value.stops[1].bins = 2;
    store.dispatch(setContextEntries({ conversationId: CONVERSATION_ID, entries: [changed] }));

    const after = entriesOf(store, select);
    expect(after).not.toBe(before);
    expect((after[0].value as ReturnType<typeof routeSnapshot>["value"]).stops[1].bins).toBe(2);
  });

  it("publishes a new reference when only the label changes", () => {
    const store = makeStore();
    const select = selectInstanceContextEntries(CONVERSATION_ID);
    store.dispatch(setContextEntries({ conversationId: CONVERSATION_ID, entries: [routeSnapshot()] }));
    const before = entriesOf(store, select);

    store.dispatch(
      setContextEntries({
        conversationId: CONVERSATION_ID,
        entries: [{ ...routeSnapshot(), label: "North route board" }],
      }),
    );

    const after = entriesOf(store, select);
    expect(after).not.toBe(before);
    expect(after[0].label).toBe("North route board");
  });
});

describe("setContextEntry", () => {
  it("keeps the same entries reference when the same pickup window is re-sent", () => {
    const store = makeStore();
    const select = selectInstanceContextEntries(CONVERSATION_ID);
    const write = () =>
      store.dispatch(
        setContextEntry({ conversationId: CONVERSATION_ID, key: "next_pickup_window", value: "06:30-08:00" }),
      );
    write();
    const before = entriesOf(store, select);
    write();
    expect(entriesOf(store, select)).toBe(before);
  });

  it("publishes a new reference when the slot match flips", () => {
    const store = makeStore();
    const select = selectInstanceContextEntries(CONVERSATION_ID);
    store.dispatch(
      setContextEntry({ conversationId: CONVERSATION_ID, key: "next_pickup_window", value: "06:30-08:00" }),
    );
    const before = entriesOf(store, select);
    store.dispatch(
      setContextEntry({
        conversationId: CONVERSATION_ID,
        key: "next_pickup_window",
        value: "06:30-08:00",
        slotMatched: true,
      }),
    );
    const after = entriesOf(store, select);
    expect(after).not.toBe(before);
    expect(after[0].slotMatched).toBe(true);
  });
});

describe("replaceSurfaceContextEntries", () => {
  const page = () => [
    surfaceEntry("note_title", "Note", "Tuesday commercial pickups — North route"),
    surfaceEntry("folder", "Folder", "Routes"),
  ];

  it("keeps the entries and the surface keys when the page reads the same", () => {
    const store = makeStore();
    const select = selectInstanceContextEntries(CONVERSATION_ID);
    store.dispatch(replaceSurfaceContextEntries({ conversationId: CONVERSATION_ID, entries: page() }));
    const before = entriesOf(store, select);
    const keysBefore = store.getState().instanceContext.surfaceKeysByConversationId[CONVERSATION_ID];

    store.dispatch(replaceSurfaceContextEntries({ conversationId: CONVERSATION_ID, entries: page() }));

    expect(entriesOf(store, select)).toBe(before);
    expect(store.getState().instanceContext.surfaceKeysByConversationId[CONVERSATION_ID]).toBe(keysBefore);
  });

  it("drops the key the page no longer contributes", () => {
    const store = makeStore();
    const select = selectInstanceContextEntries(CONVERSATION_ID);
    store.dispatch(replaceSurfaceContextEntries({ conversationId: CONVERSATION_ID, entries: page() }));
    const before = entriesOf(store, select);

    store.dispatch(replaceSurfaceContextEntries({ conversationId: CONVERSATION_ID, entries: [page()[0]] }));

    const after = entriesOf(store, select);
    expect(after).not.toBe(before);
    expect(after.map((e) => e.key)).toEqual(["note_title"]);
    expect(store.getState().instanceContext.surfaceKeysByConversationId[CONVERSATION_ID]).toEqual(["note_title"]);
  });

  it("keeps entries another writer set when the page's keys move", () => {
    const store = makeStore();
    store.dispatch(
      setContextEntry({ conversationId: CONVERSATION_ID, key: "quoted_passages", value: "Lakeside needs a Friday pickup" }),
    );
    store.dispatch(replaceSurfaceContextEntries({ conversationId: CONVERSATION_ID, entries: page() }));
    store.dispatch(replaceSurfaceContextEntries({ conversationId: CONVERSATION_ID, entries: [] }));
    const keys = Object.keys(store.getState().instanceContext.byConversationId[CONVERSATION_ID]);
    expect(keys).toEqual(["quoted_passages"]);
  });
});
