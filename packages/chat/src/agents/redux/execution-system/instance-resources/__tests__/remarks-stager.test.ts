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
 *   3. REHYDRATE — an unsent chip survives a reload (store + in-memory generations
 *      thrown away, localStorage kept); a sent one never comes back; an X'd one
 *      stays gone.
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
import { restoreComposerRemarks } from "../../instance-user-input/restore-composer-remarks.thunk";
import {
  REMARKS_BLOCK_TYPE,
  remarkSourceOf,
  stageRemark,
  unstageRemark,
  type RemarkItem,
} from "../remarks";

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

describe("rehydrate", () => {
  it("an unsent chip comes back after a reload, under its own id", () => {
    let store = reload();
    const id = store.dispatch(stageRemark(CID, comment, { coalesceKey: `comment:${(comment as { commentId: string }).commentId}` }));
    store = reload();
    expect(remarks(store)).toHaveLength(0);
    expect(store.dispatch(restoreComposerRemarks(CID, null))).toBe(1);
    expect(remarks(store).map((r) => r.resourceId)).toEqual([id]);
    expect(remarkSourceOf(remarks(store)[0])?.remark).toEqual(comment);
    // Restoring twice never duplicates.
    expect(store.dispatch(restoreComposerRemarks(CID, null))).toBe(0);
    expect(remarks(store)).toHaveLength(1);
  });

  it("a sent chip never comes back", () => {
    let store = reload();
    store.dispatch(stageRemark(CID, comment));
    send(store);
    store.dispatch(clearSubmittedResources(CID));
    store = reload();
    expect(store.dispatch(restoreComposerRemarks(CID, null))).toBe(0);
    expect(remarks(store)).toHaveLength(0);
  });

  it("a chip staged after a send comes back; the sent one does not", () => {
    let store = reload();
    store.dispatch(stageRemark(CID, comment));
    send(store);
    const nextId = store.dispatch(stageRemark(CID, edit("Pilot: 5 clinics, Q2"), { coalesceKey: `edit:${ANSWER}` }));
    store = reload();
    store.dispatch(restoreComposerRemarks(CID, null));
    expect(remarks(store).map((r) => r.resourceId)).toEqual([nextId]);
  });

  it("an X'd chip stays gone after a reload", () => {
    let store = reload();
    const keep = store.dispatch(stageRemark(CID, comment));
    const drop = store.dispatch(stageRemark(CID, edit("Pilot: 10 clinics"), { coalesceKey: `edit:${ANSWER}` }));
    store.dispatch(removeResource({ conversationId: CID, resourceId: drop }));
    store = reload();
    store.dispatch(restoreComposerRemarks(CID, null));
    expect(remarks(store).map((r) => r.resourceId)).toEqual([keep]);
  });

  it("someone else's staged remarks are never offered", () => {
    let store = reload();
    store.dispatch(stageRemark(CID, comment));
    store = reload();
    expect(store.dispatch(restoreComposerRemarks(CID, "another-person"))).toBe(0);
  });
});
