/**
 * features/notes/redux/realtimeMiddleware.test.ts
 *
 * WHAT THIS SUITE IS FOR, AFTER THE PACKAGE ADOPTION.
 *
 * The previous version of this file drove a mocked `supabase.channel` and
 * asserted the reconnect-alarm escalation ladder — backoff attempts, the
 * "still down after 5 attempts" console.error, the stale-SUBSCRIBED teardown.
 * Every one of those is now `@ai-matrx/realtime`'s job and is pinned by that
 * package's own regression suite. Re-asserting them here would test the
 * package through a mock of a client the middleware no longer touches, which
 * is the definition of a test that cannot fail for the right reason.
 *
 * So this suite tests what is genuinely THIS module's contract:
 *
 *  1. It declares the right channel — one `workbench.notes` binding with NO
 *     owner filter (filtering by owner was the collaboration data-loss hole),
 *     and a backfill door.
 *  2. Its backfill re-reads BOTH lists. Realtime has no replay; a door that
 *     forgot the shared list would silently lose sharee updates on every wake.
 *  3. It registers its own writes on the manager's ledger — the load-bearing
 *     half of echo suppression, since `classify` can only recognize an echo of
 *     a write it was told about. This is the freeze-class guard: before the
 *     ledger, an unsuppressed echo of save N landed while the user typed toward
 *     N+1 and drove a self-sustaining false-conflict loop.
 *  4. It still drops a payload whose identity no longer matches the session —
 *     a queued callback must never mutate the new store or issue an
 *     authenticated editor lookup under an absent identity.
 */

import type { MiddlewareAPI } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import {
  createWriteLedger,
  setAmbientRealtimeManager,
  type ChannelSpec,
  type PostgresChangeBinding,
  type RealtimeManager,
  type WriteLedger,
} from "@ai-matrx/realtime";
import { fetchNotesList } from "./thunks";
import { notesRealtimeMiddleware } from "./realtimeMiddleware";

// The list thunks are real (their `pending` action is what proves the backfill
// door fired the right read). Their payload creators are allowed to fail fast:
// createAsyncThunk dispatches `pending` BEFORE the creator runs, so a rejecting
// client still proves which reads were issued without touching a network.
jest.mock("@/utils/supabase/client", () => {
  const boom = () => {
    throw new Error("no network in this suite");
  };
  return {
    supabase: {
      // Supabase reports failure in the envelope, not by rejecting.
      rpc: jest.fn(() =>
        Promise.resolve({ data: null, error: { message: "no network in this suite" } }),
      ),
      schema: boom,
      from: boom,
    },
  };
});

/**
 * A manager stand-in that captures the spec the middleware opens and carries a
 * REAL write ledger — the ledger is the thing under test in case 3, so faking
 * it would prove nothing.
 */
function stubManager(): {
  manager: RealtimeManager;
  spec: () => ChannelSpec;
  ledger: WriteLedger;
  closed: () => number;
} {
  const ledger = createWriteLedger({ actorId: "user-1" });
  let captured: ChannelSpec | null = null;
  let closeCount = 0;
  const manager = {
    clientId: "test-client",
    ledger,
    open: (spec: ChannelSpec) => {
      captured = spec;
      return {
        topic: spec.topic,
        status: () => "connected" as const,
        send: () => {},
        presence: null,
        requestBackfill: () => {},
        close: () => {
          closeCount += 1;
        },
      };
    },
    health: () => "live" as const,
    backfillAll: () => {},
    openChannelCount: () => (captured ? 1 : 0),
    dispose: () => {},
  } as unknown as RealtimeManager;
  return {
    manager,
    spec: () => {
      if (!captured) throw new Error("the middleware opened no channel");
      return captured;
    },
    ledger,
    closed: () => closeCount,
  };
}

function notesBinding(spec: ChannelSpec): PostgresChangeBinding {
  const binding = spec.postgresChanges?.[0];
  if (!binding) throw new Error("no postgres_changes binding declared");
  return binding;
}

interface Harness {
  handle: (action: unknown) => unknown;
  dispatched: unknown[];
  state: RootState;
}

function harness(state: RootState): Harness {
  const dispatched: unknown[] = [];
  // Thunk-aware: the middleware refreshes lists via async thunks, so a plain
  // recorder would capture opaque functions and prove nothing about WHICH
  // reads the backfill door issued.
  const dispatch = (action: unknown): unknown => {
    dispatched.push(action);
    if (typeof action === "function") {
      try {
        const result = (
          action as (d: unknown, g: unknown, e: unknown) => unknown
        )(dispatch, () => state, undefined);
        if (result instanceof Promise) result.catch(() => undefined);
      } catch {
        /* the payload creator is allowed to fail — `pending` already landed */
      }
    }
    return action;
  };
  const storeApi = {
    getState: () => state,
    dispatch,
  } as MiddlewareAPI;
  const handle = notesRealtimeMiddleware(storeApi)(
    jest.fn((action: unknown) => action),
  );
  return { handle, dispatched, state };
}

function baseState(): RootState {
  return {
    userAuth: { id: "user-1" as string | null },
    notes: { notes: {}, _savingNoteIds: [], noteEditors: {} },
  } as unknown as RootState;
}

describe("notes realtime middleware on @ai-matrx/realtime", () => {
  let stub: ReturnType<typeof stubManager>;
  let opened: Harness | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    stub = stubManager();
    setAmbientRealtimeManager(stub.manager);
  });

  // The middleware's subscription state is MODULE-level, because in the real
  // app there is exactly one store and one subscription. A suite runs many
  // middleware instances against that one slot, so each test must hand the
  // channel back — otherwise the previous test's still-registered manager
  // listener re-opens on the next test's stub, carrying the previous test's
  // dispatch closure with it.
  afterEach(() => {
    opened?.handle({ type: "notes/resetNotesState" });
    opened = null;
    setAmbientRealtimeManager(null);
  });

  it("declares one workbench.notes binding with NO owner filter", () => {
    const h = (opened = harness(baseState()));
    h.handle(fetchNotesList.fulfilled(undefined, "request-1", undefined));

    const spec = stub.spec();
    expect(spec.topic).toBe("mx:notes:user-1");
    expect(spec.postgresChanges).toHaveLength(1);

    const binding = notesBinding(spec);
    expect(binding.schema).toBe("workbench");
    expect(binding.table).toBe("notes");
    expect(binding.event).toBe("*");
    // THE COLLABORATION DATA-LOSS HOLE: a `created_by=eq.` filter hides every
    // update to a note shared WITH this user. RLS is the boundary, not a filter.
    expect(binding.filter).toBeUndefined();
  });

  it("declares a backfill door that re-reads BOTH lists", async () => {
    const h = (opened = harness(baseState()));
    h.handle(fetchNotesList.fulfilled(undefined, "request-1", undefined));

    h.dispatched.length = 0;
    await stub.spec().onBackfill?.({
      reason: "wake",
      topic: "mx:notes:user-1",
      gapMs: 60_000,
    });

    const types = h.dispatched.map((a) => (a as { type?: string }).type);
    expect(types).toContain("notes/fetchNotesList/pending");
    // Realtime has no replay — a door that forgot the shared list would lose
    // every sharee update that landed while the tab slept.
    expect(types).toContain("notes/fetchSharedNotesList/pending");
  });

  it("does not backfill under an identity that no longer matches the session", async () => {
    const state = baseState();
    const h = (opened = harness(state));
    h.handle(fetchNotesList.fulfilled(undefined, "request-1", undefined));

    state.userAuth.id = null;
    h.dispatched.length = 0;
    await stub.spec().onBackfill?.({
      reason: "reconnect",
      topic: "mx:notes:user-1",
      gapMs: null,
    });

    expect(h.dispatched).toHaveLength(0);
  });

  describe("THE FREEZE-CLASS GUARD — own writes reach the ledger", () => {
    it("classifies the echo of a save as own-echo, not a collaborator write", () => {
      const state = baseState();
      (state.notes as unknown as { notes: Record<string, unknown> }).notes = {
        "note-1": {
          id: "note-1",
          label: "Ideas",
          content: "hello world",
          folder_name: "Draft",
          tags: [],
          updated_at: "2026-09-07T00:00:00.000Z",
        },
      };
      const h = (opened = harness(state));
      h.handle(fetchNotesList.fulfilled(undefined, "request-1", undefined));

      // Before the save is announced, this payload is a stranger's write.
      const echo = {
        table: "workbench.notes",
        id: "note-1",
        updatedAt: "2026-09-07T00:00:01.000Z",
        fingerprint: JSON.stringify(["Ideas", "hello world", "Draft", []]),
        updatedBy: "user-1",
      };
      expect(stub.ledger.classify(echo).origin).toBe("remote");

      // The autosave path announces the save, then its result.
      h.handle({ type: "notes/markNoteSaving", payload: "note-1" });
      expect(stub.ledger.isPending("workbench.notes", "note-1")).toBe(true);

      h.handle({
        type: "notes/markNoteSaved",
        payload: { id: "note-1", updatedAt: "2026-09-07T00:00:01.000Z" },
      });

      // The echo lands 50-500ms later, after the REST response already
      // returned. Unsuppressed, this is the false-conflict loop.
      expect(stub.ledger.classify(echo).origin).toBe("own-echo");
    });

    it("still lets a genuine collaborator write through", () => {
      const state = baseState();
      (state.notes as unknown as { notes: Record<string, unknown> }).notes = {
        "note-1": {
          id: "note-1",
          label: "Ideas",
          content: "hello world",
          folder_name: "Draft",
          tags: [],
          updated_at: "2026-09-07T00:00:00.000Z",
        },
      };
      const h = (opened = harness(state));
      h.handle(fetchNotesList.fulfilled(undefined, "request-1", undefined));
      h.handle({ type: "notes/markNoteSaving", payload: "note-1" });
      h.handle({
        type: "notes/markNoteSaved",
        payload: { id: "note-1", updatedAt: "2026-09-07T00:00:01.000Z" },
      });

      // Same row, later timestamp, DIFFERENT content: a real remote edit.
      // Suppressing this is data loss, which is why the fingerprint exists.
      expect(
        stub.ledger.classify({
          table: "workbench.notes",
          id: "note-1",
          updatedAt: "2026-09-07T00:00:05.000Z",
          fingerprint: JSON.stringify([
            "Ideas",
            "a colleague rewrote this",
            "Draft",
            [],
          ]),
          updatedBy: "user-2",
        }).origin,
      ).toBe("remote");
    });

    it("registers a save that never announced itself (legacy service path)", () => {
      const state = baseState();
      (state.notes as unknown as { notes: Record<string, unknown> }).notes = {
        "note-2": {
          id: "note-2",
          label: "L",
          content: "c",
          folder_name: null,
          tags: [],
        },
      };
      const h = (opened = harness(state));
      h.handle(fetchNotesList.fulfilled(undefined, "request-1", undefined));

      // No markNoteSaving — a legacy surface called notesService directly.
      h.handle({
        type: "notes/markNoteSaved",
        payload: { id: "note-2", updatedAt: "2026-09-07T00:00:09.000Z" },
      });

      // An echo strictly older than what the ledger now holds is stale, which
      // is exactly what a late echo of that write is.
      expect(
        stub.ledger.classify({
          table: "workbench.notes",
          id: "note-2",
          updatedAt: "2026-09-07T00:00:08.000Z",
          fingerprint: JSON.stringify(["L", "c", null, []]),
        }).origin,
      ).toBe("stale");
    });
  });

  it("drops a queued payload after the auth identity disappears, without issuing editor RPCs", () => {
    const state = baseState();
    const h = (opened = harness(state));
    h.handle(fetchNotesList.fulfilled(undefined, "request-1", undefined));

    const binding = notesBinding(stub.spec());
    state.userAuth.id = null;
    h.dispatched.length = 0;

    binding.onChange({
      payload: {
        eventType: "UPDATE",
        new: {
          id: "note-1",
          updated_by: "other-user",
          updated_at: "2026-08-30T19:12:39.529Z",
        },
        old: {},
      },
      row: {
        id: "note-1",
        updated_by: "other-user",
        updated_at: "2026-08-30T19:12:39.529Z",
      },
      origin: { origin: "remote", reason: "no-local-record", localWritePending: false },
    });

    // The channel is torn down and nothing is dispatched under the dead
    // identity — in particular no editor lookup, which is an authenticated RPC.
    expect(stub.closed()).toBeGreaterThan(0);
    expect(h.dispatched).not.toContainEqual(
      expect.objectContaining({ type: "notes/setNoteEditor" }),
    );
  });
});
