/**
 * THE REMARKS STAGER — a comment (or choice, edit, answers…) on an agent answer
 * is staged as ONE chip that rides along with the person's next message.
 *
 * Three promises, each a forcing function over the REAL slice, the REAL draft
 * middleware and the REAL storage module through a real Redux store:
 *
 *   1. COALESCE — staging twice under one key updates one chip; no key = a new chip.
 *   2. MINT-AFTER-SUBMIT — once a chip is part of a submitted message it is never
 *      mutated: the next stage under the same key mints a NEW resource id, and the
 *      submitted one keeps exactly what was sent.
 *   3. DURABILITY — an unsent comment / edit chip is written through the durability
 *      port (server-side block state), the X retires it for good, and the send
 *      carries `block_state_ref` so the server marks it sent.
 *
 * Use case: Dana highlights "Ship the pilot to 40 clinics in Q1" in the agent's
 * rollout answer and comments "Too aggressive — our onboarding team is two
 * people", then edits the answer's timeline.
 */

import { configureStore } from "@reduxjs/toolkit";
import { DEFAULT_CHAT_PREFERENCES } from "../../../../../host/defaults/prefs";
import instanceResourcesReducer, {
  clearSubmittedResources,
  markResourcesSubmitted,
  removeResource,
} from "../instance-resources.slice";
import instanceUserInputReducer, {
  initInstanceUserInput,
  markInputSubmitted,
} from "../../instance-user-input/instance-user-input.slice";
import { composerDraftMiddleware } from "../../instance-user-input/composer-draft.middleware";
import { __resetComposerDraftGenerationsForTest } from "../../instance-user-input/composer-draft-store";
import {
  REMARKS_BLOCK_TYPE,
  attachRemarkRef,
  dismissRemarkChip,
  registerRemarkDurability,
  remarkSourceOf,
  restageRemarks,
  stageRemark,
  unstageRemark,
  type RemarkItem,
} from "../remarks";
import { remarkToWire } from "../remarks-wire";

const CID = "4b2d8e10-7c3a-4f5e-9a61-2d0c5b7e9f13";
const ANSWER = "8d7f6e5c-4b3a-4291-8f0e-1d2c3b4a5f60";

const comment: RemarkItem = {
  kind: "comment",
  target: { conversationId: CID, messageId: ANSWER },
  commentId: "c8a1f2e3-0b4d-4c5e-8f6a-7b8c9d0e1f2a",
  quote: "Ship the pilot to 40 clinics in Q1",
  body: "Too aggressive — our onboarding team is two people",
};

function edit(after: string): RemarkItem {
  return {
    kind: "edit",
    target: { conversationId: CID, messageId: ANSWER },
    before: "Pilot: 40 clinics, Q1",
    after,
    origin: "text",
    projection: null,
  };
}

function makeStore() {
  return configureStore({
    reducer: {
      instanceResources: instanceResourcesReducer,
      instanceUserInput: instanceUserInputReducer,
      chatHost: (state = { preferences: { ...DEFAULT_CHAT_PREFERENCES, restoreUnsentDrafts: true } }) => state,
    },
    middleware: (getDefault) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getDefault().concat(composerDraftMiddleware as any),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = any;

function remarks(store: AnyStore) {
  const bucket = store.getState().instanceResources.byConversationId[CID] ?? {};
  return Object.values(bucket).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => r.blockType === REMARKS_BLOCK_TYPE,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any[];
}

/** What a real reload destroys (the store, the in-memory generations) and nothing it keeps. */
function reload(): AnyStore {
  __resetComposerDraftGenerationsForTest();
  const store = makeStore();
  store.dispatch(initInstanceUserInput({ conversationId: CID }));
  return store;
}

/** The send path, in the order smart-execute dispatches it. */
function send(store: AnyStore) {
  store.dispatch(markInputSubmitted({ conversationId: CID, userValues: {} }));
  store.dispatch(markResourcesSubmitted(CID));
}

beforeEach(() => {
  window.localStorage.clear();
  __resetComposerDraftGenerationsForTest();
});

describe("coalesce", () => {
  it("one chip per key, updated in place while unsent", () => {
    const store = reload();
    const first = store.dispatch(stageRemark(CID, edit("Pilot: 10 clinics, Q1"), { coalesceKey: `edit:${ANSWER}` }));
    const second = store.dispatch(stageRemark(CID, edit("Pilot: 10 clinics, Q2"), { coalesceKey: `edit:${ANSWER}` }));
    expect(second).toBe(first);
    expect(remarks(store)).toHaveLength(1);
    expect(remarkSourceOf(remarks(store)[0])?.remark).toMatchObject({ after: "Pilot: 10 clinics, Q2" });
    expect(remarks(store)[0].status).toBe("ready");
  });

  it("no key = a new chip each time; unstage removes the keyed one", () => {
    const store = reload();
    store.dispatch(stageRemark(CID, comment));
    store.dispatch(stageRemark(CID, comment));
    store.dispatch(stageRemark(CID, edit("Pilot: 10 clinics"), { coalesceKey: `edit:${ANSWER}` }));
    expect(remarks(store)).toHaveLength(3);
    expect(store.dispatch(unstageRemark(CID, `edit:${ANSWER}`))).toBe(true);
    expect(remarks(store)).toHaveLength(2);
    expect(store.dispatch(unstageRemark(CID, `edit:${ANSWER}`))).toBe(false);
  });
});

describe("mint after submit", () => {
  it("never mutates a chip that went with a message", () => {
    const store = reload();
    const sentId = store.dispatch(stageRemark(CID, edit("Pilot: 10 clinics, Q1"), { coalesceKey: `edit:${ANSWER}` }));
    send(store);
    // The person keeps editing while the reply streams.
    const nextId = store.dispatch(stageRemark(CID, edit("Pilot: 5 clinics, Q2"), { coalesceKey: `edit:${ANSWER}` }));
    expect(nextId).not.toBe(sentId);
    const bucket = store.getState().instanceResources.byConversationId[CID];
    expect(remarkSourceOf(bucket[sentId])?.remark).toMatchObject({ after: "Pilot: 10 clinics, Q1" });
    expect(remarkSourceOf(bucket[nextId])?.remark).toMatchObject({ after: "Pilot: 5 clinics, Q2" });
    // Stream end clears only what was sent; the new chip is the next message's.
    store.dispatch(clearSubmittedResources(CID));
    expect(remarks(store).map((r) => r.resourceId)).toEqual([nextId]);
  });

  it("a rehydration id that belongs to a submitted message is never reused", () => {
    const store = reload();
    const sentId = store.dispatch(stageRemark(CID, comment));
    send(store);
    const restagedId = store.dispatch(stageRemark(CID, comment, { resourceId: sentId }));
    expect(restagedId).not.toBe(sentId);
  });
});

describe("durability port (unsent chips live server-side, never in the browser)", () => {
  function fakeServer() {
    const rows = new Map<string, { item: RemarkItem; retired: boolean }>();
    const release = registerRemarkDurability({
      save: (_c, _r, key, item) => void rows.set(key ?? "", { item, retired: false }),
      retire: (_c, _r, key) => {
        const row = rows.get(key ?? "");
        if (row) row.retired = true;
      },
      restore: () => {},
    });
    return { rows, release };
  }

  it("a staged comment / edit is written through the port, and an update re-writes it", () => {
    const server = fakeServer();
    const store = reload();
    store.dispatch(stageRemark(CID, comment, { coalesceKey: "comment:c5" }));
    store.dispatch(stageRemark(CID, edit("Pilot: 10 clinics"), { coalesceKey: `edit:${ANSWER}` }));
    store.dispatch(stageRemark(CID, edit("Pilot: 12 clinics"), { coalesceKey: `edit:${ANSWER}` }));
    expect([...server.rows.keys()].sort()).toEqual([`comment:c5`, `edit:${ANSWER}`].sort());
    expect(server.rows.get(`edit:${ANSWER}`)?.item).toMatchObject({ after: "Pilot: 12 clinics" });
    server.release();
  });

  it("a passage handed over by New chat about this is WRITTEN (it is new to the server); a restore of server rows is not re-written", () => {
    const server = fakeServer();
    const store = reload();
    const passage = {
      resourceId: "res_passage1",
      coalesceKey: `passage:${ANSWER}:Ship the pilot`,
      item: { ...comment, commentId: null, body: "", quote: "Ship the pilot" },
    };
    store.dispatch(restageRemarks(CID, [passage], { persist: true }));
    expect([...server.rows.keys()]).toEqual([passage.coalesceKey]);
    server.rows.clear();
    store.dispatch(
      restageRemarks(CID, [{ ...passage, resourceId: "res_passage2", coalesceKey: "passage:other" }]),
    );
    expect(server.rows.size).toBe(0);
    server.release();
  });

  it("the X and an emptied edit retire the chip durably", () => {
    const server = fakeServer();
    const store = reload();
    const id = store.dispatch(stageRemark(CID, comment, { coalesceKey: "comment:c5" }));
    store.dispatch(stageRemark(CID, edit("Pilot: 10 clinics"), { coalesceKey: `edit:${ANSWER}` }));
    store.dispatch(dismissRemarkChip(CID, id));
    store.dispatch(unstageRemark(CID, `edit:${ANSWER}`));
    expect(server.rows.get("comment:c5")?.retired).toBe(true);
    expect(server.rows.get(`edit:${ANSWER}`)?.retired).toBe(true);
    expect(remarks(store)).toHaveLength(0);
    server.release();
  });

  it("a chip put back from the server is not written again, and keeps its reference", () => {
    const server = fakeServer();
    const store = reload();
    const ref = { id: "11111111-1111-4111-8111-111111111111", stateVersion: 3 };
    store.dispatch(
      stageRemark(CID, { ...comment, blockStateRef: ref }, { coalesceKey: "comment:c5", fromServer: true }),
    );
    expect(server.rows.size).toBe(0);
    expect(remarkSourceOf(remarks(store)[0])?.remark.blockStateRef).toEqual(ref);
    server.release();
  });

  it("the send carries block_state_ref beside the chip", () => {
    const store = reload();
    const id = store.dispatch(stageRemark(CID, comment));
    store.dispatch(attachRemarkRef(CID, id, { id: "22222222-2222-4222-8222-222222222222", stateVersion: 4 }));
    const wire = remarkToWire(remarkSourceOf(remarks(store)[0])!.remark) as { block_state_ref?: unknown } | null;
    expect(wire?.block_state_ref).toEqual({ id: "22222222-2222-4222-8222-222222222222", state_version: 4 });
  });
});
