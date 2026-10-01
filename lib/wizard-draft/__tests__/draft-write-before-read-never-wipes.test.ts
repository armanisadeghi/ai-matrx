/**
 * GUARD — a draft written before the saved drafts were read never wipes them.
 *
 * The bug (2026-09-30, /education/flashcards/new?source=…): the page put the
 * linked Source into its draft on mount, before the sync engine had read the
 * saved drafts back from IndexedDB. The `wizardDraft` slice persists ONE map
 * of every wizard's draft on the device, so the debounced write stored a map
 * holding only that new entry — and the stopped-run record and the restored
 * Style answers were gone for good when the read finally ran.
 *
 * The rule (`holdUntilHydrated` on `wizardDraftPolicy`): nothing reaches
 * storage until the read has settled; then the live state — the loaded drafts
 * merged with the early edit by the REHYDRATE reducer — is saved once.
 *
 * Real pieces end to end: the real slice + policy, the real sync middleware
 * and write scheduler, the real `bootSync` reading fake IndexedDB. The only
 * stand-in is the settled signal, built exactly as `lib/redux/store.ts` does
 * (boot finished → notify).
 */
import "fake-indexeddb/auto";
import { configureStore } from "@reduxjs/toolkit";
import wizardDraftReducer, {
  patchWizardDraft,
  wizardDraftPolicy,
  type WizardDraftState,
} from "@/lib/redux/slices/wizardDraftSlice";
import { createSyncMiddleware } from "@/lib/sync/engine/middleware";
import { bootSync } from "@/lib/sync/engine/boot";
import { clearAll, readSlice, writeSlice } from "@/lib/sync/persistence/idb";
import type { SyncChannel } from "@/lib/sync/channel";
import type { IdentityKey } from "@/lib/sync/types";

const identity: IdentityKey = { type: "auth", userId: "u-drafts", key: "auth:u-drafts" };
const DEBOUNCE = 20;

const RUN_ID = "run:flashcards:new";
const STYLE_ID = "flashcards:create-deck-style";
const SOURCE_ID = "source-input:flashcards-create";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakeChannel(): SyncChannel {
  return {
    available: false,
    post: () => {},
    subscribe: () => () => {},
    setIdentity: () => {},
    close: () => {},
  };
}

/** The store as `makeStore` wires it: middleware sees the settled signal. */
function makeStore() {
  let settled = false;
  const listeners = new Set<() => void>();
  const store = configureStore({
    reducer: { wizardDraft: wizardDraftReducer },
    middleware: (gDM) =>
      gDM().concat(
        createSyncMiddleware({
          policies: [wizardDraftPolicy],
          channel: fakeChannel(),
          getIdentity: () => identity,
          defaultDebounceMs: DEBOUNCE,
          hydrationSettled: () => settled,
          onHydrationSettledChange: (l) => {
            listeners.add(l);
            return () => listeners.delete(l);
          },
        }),
      ),
  });
  const boot = async () => {
    const result = await bootSync({
      store,
      identity,
      policies: [wizardDraftPolicy],
      openChannel: fakeChannel,
    });
    await result.idbHydration;
    result.stale.cancelAll();
    settled = true;
    for (const l of listeners) l();
  };
  return { store, boot };
}

async function saved(): Promise<WizardDraftState["drafts"]> {
  const record = await readSlice(identity.key, "wizardDraft", wizardDraftPolicy.config.version);
  return ((record?.body as WizardDraftState | undefined)?.drafts ?? {}) as WizardDraftState["drafts"];
}

describe("a draft written before the saved drafts are read", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await clearAll();
  });

  it("keeps every saved draft — the stopped run and the Style answers survive a ?source= link", async () => {
    const now = Date.now();
    await writeSlice(identity.key, "wizardDraft", wizardDraftPolicy.config.version, {
      drafts: {
        [RUN_ID]: {
          updatedAt: now,
          data: { runId: "r1", startedAt: now - 5_000, beatAt: now - 4_000, closedAt: now - 3_000, request: { count: 12 } },
        },
        [STYLE_ID]: { updatedAt: now, data: { count: 12, difficulty: "hard" } },
      },
    });

    const { store, boot } = makeStore();
    // The page mounts and seeds the linked Source before the engine has booted.
    store.dispatch(
      patchWizardDraft({ wizardId: SOURCE_ID, patch: { sources: [{ id: "doc-1" }], topic: "" } }),
    );
    await wait(DEBOUNCE * 4);
    // The read has not run, so nothing may have been written over the saved map.
    expect(Object.keys(await saved()).sort()).toEqual([RUN_ID, STYLE_ID].sort());

    await boot();
    await wait(DEBOUNCE * 4);

    const live = store.getState().wizardDraft.drafts;
    expect(Object.keys(live).sort()).toEqual([SOURCE_ID, STYLE_ID, RUN_ID].sort());
    expect(live[RUN_ID].data.runId).toBe("r1");
    expect(live[STYLE_ID].data.difficulty).toBe("hard");

    // …and the merged map is what is now on disk (saved once, after the read).
    const disk = await saved();
    expect(Object.keys(disk).sort()).toEqual([SOURCE_ID, STYLE_ID, RUN_ID].sort());
    expect(disk[SOURCE_ID].data.sources).toEqual([{ id: "doc-1" }]);
  });

  it("still saves the early draft when nothing was saved before (a miss settles too)", async () => {
    const { store, boot } = makeStore();
    store.dispatch(patchWizardDraft({ wizardId: SOURCE_ID, patch: { topic: "cells" } }));
    await wait(DEBOUNCE * 4);
    expect(await saved()).toEqual({});

    await boot();
    await wait(DEBOUNCE * 4);
    expect((await saved())[SOURCE_ID]?.data.topic).toBe("cells");
  });

  it("a page closed before the read (pagehide flush) writes nothing either", async () => {
    await writeSlice(identity.key, "wizardDraft", wizardDraftPolicy.config.version, {
      drafts: { [STYLE_ID]: { updatedAt: Date.now(), data: { count: 7 } } },
    });
    const { store } = makeStore();
    store.dispatch(patchWizardDraft({ wizardId: SOURCE_ID, patch: { topic: "x" } }));
    window.dispatchEvent(new Event("pagehide"));
    await wait(DEBOUNCE * 4);
    expect(Object.keys(await saved())).toEqual([STYLE_ID]);
  });
});
