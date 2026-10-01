/**
 * GUARD — `holdUntilHydrated` protects the saved copy without ever trapping
 * a write.
 *
 *   1. A page whose read never settles (boot never started, or stalled) does
 *      not hold the slice forever: after a bounded wait the engine reads the
 *      saved copy itself, lets the slice's REHYDRATE reducer merge it, saves
 *      the merged state, and says so loudly.
 *   2. Only the DEVICE write is held. A slice that also saves to a server
 *      sends that save on its normal debounce; the device copy waits.
 *   3. `scopesTree` (a held slice) no longer stores `{}` over the warm tree
 *      when a fetch goes pending before the read.
 *
 * Real pieces: the real slices + policies, real middleware + scheduler, fake
 * IndexedDB. The settled signal is built as `lib/redux/store.ts` builds it.
 */
import "fake-indexeddb/auto";
import { configureStore } from "@reduxjs/toolkit";
import wizardDraftReducer, {
  patchWizardDraft,
  wizardDraftPolicy,
  type WizardDraftState,
} from "@/lib/redux/slices/wizardDraftSlice";
import scopesReducer, { scopesActions, scopesTreePolicy } from "@/features/scopes/redux/scopesSlice";
import { createSyncMiddleware } from "@/lib/sync/engine/middleware";
import { clearAll, readSlice, writeSlice } from "@/lib/sync/persistence/idb";
import { definePolicy } from "@/lib/sync/policies/define";
import type { SyncChannel } from "@/lib/sync/channel";
import type { IdentityKey, Policy } from "@/lib/sync/types";

const identity: IdentityKey = { type: "auth", userId: "u-hold", key: "auth:u-hold" };
const DEBOUNCE = 20;
const BACKSTOP = 120;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(done: () => boolean | Promise<boolean>, deadlineMs = 3000): Promise<void> {
  const start = Date.now();
  while (!(await done())) {
    if (Date.now() - start > deadlineMs) return;
    await wait(10);
  }
}

function fakeChannel(): SyncChannel {
  return { available: false, post: () => {}, subscribe: () => () => {}, setIdentity: () => {}, close: () => {} };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function storeWith(reducer: Record<string, any>, policies: Policy<any>[]) {
  return configureStore({
    reducer,
    middleware: (gDM) =>
      gDM().concat(
        createSyncMiddleware({
          policies,
          channel: fakeChannel(),
          getIdentity: () => identity,
          defaultDebounceMs: DEBOUNCE,
          holdBackstopMs: BACKSTOP,
          // The read NEVER settles on this page.
          hydrationSettled: () => false,
          onHydrationSettledChange: () => () => {},
        }),
      ),
  });
}

async function savedDrafts(): Promise<WizardDraftState["drafts"]> {
  const record = await readSlice(identity.key, "wizardDraft", wizardDraftPolicy.config.version);
  return ((record?.body as WizardDraftState | undefined)?.drafts ?? {}) as WizardDraftState["drafts"];
}

describe("holdUntilHydrated never traps a write", () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(async () => {
    window.localStorage.clear();
    await clearAll();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it("a read that never settles: after the bound, the saved map is read, merged, saved, and announced", async () => {
    const now = Date.now();
    await writeSlice(identity.key, "wizardDraft", wizardDraftPolicy.config.version, {
      drafts: { saved: { updatedAt: now, data: { keep: true } } },
    });
    const store = storeWith({ wizardDraft: wizardDraftReducer }, [wizardDraftPolicy]);
    store.dispatch(patchWizardDraft({ wizardId: "early", patch: { topic: "cells" } }));

    // Inside the bound: held, the saved map untouched.
    await wait(DEBOUNCE * 3);
    expect(Object.keys(await savedDrafts())).toEqual(["saved"]);

    // Past the bound: merged on disk and in memory, never just the early entry.
    await until(async () => Object.keys(await savedDrafts()).length === 2);
    expect(Object.keys(await savedDrafts()).sort()).toEqual(["early", "saved"]);
    expect(Object.keys((store.getState() as { wizardDraft: WizardDraftState }).wizardDraft.drafts).sort()).toEqual(["early", "saved"]);
    expect(errorSpy.mock.calls.some((c) => String(c[0]).includes("wizardDraft"))).toBe(true);

    // And later edits are no longer held.
    store.dispatch(patchWizardDraft({ wizardId: "later", patch: { topic: "x" } }));
    await until(async () => "later" in (await savedDrafts()));
    expect(Object.keys(await savedDrafts()).sort()).toEqual(["early", "later", "saved"]);
  });

  it("only the device write is held — a server save goes out on its debounce", async () => {
    const remoteWrites: unknown[] = [];
    const policy = definePolicy<{ entries: Record<string, number> }>({
      sliceName: "heldRemote",
      preset: "warm-cache",
      version: 1,
      broadcast: { actions: ["heldRemote/put"] },
      holdUntilHydrated: true,
      remote: {
        write: async ({ body }) => {
          remoteWrites.push(body);
        },
      },
    });
    const reducer = (state = { entries: {} as Record<string, number> }, action: { type: string; payload?: unknown }) =>
      action.type === "heldRemote/put" ? { entries: { ...state.entries, ...(action.payload as Record<string, number>) } } : state;
    await writeSlice(identity.key, "heldRemote", 1, { entries: { saved: 1 } });
    const store = storeWith({ heldRemote: reducer }, [policy]);
    store.dispatch({ type: "heldRemote/put", payload: { early: 2 } });

    await until(() => remoteWrites.length > 0, BACKSTOP - 20);
    expect(remoteWrites).toEqual([{ entries: { early: 2 } }]);
    // The device copy is still the saved one.
    const record = await readSlice(identity.key, "heldRemote", 1);
    expect(record?.body).toEqual({ entries: { saved: 1 } });
  });

  it("scopesTree: a fetch going pending before the read never stores {} over the warm tree", async () => {
    const tree = {
      organizations: { "org-1": { id: "org-1", name: "Org" } },
      organizationIds: ["org-1"],
      treeFetchedAt: 1,
    };
    await writeSlice(identity.key, "scopesTree", scopesTreePolicy.config.version, tree);
    const store = storeWith({ scopesTree: scopesReducer }, [scopesTreePolicy]);
    store.dispatch(scopesActions.treeFetchPending());
    await wait(DEBOUNCE * 4);
    const record = await readSlice(identity.key, "scopesTree", scopesTreePolicy.config.version);
    expect(record?.body).toEqual(tree);
  });
});
