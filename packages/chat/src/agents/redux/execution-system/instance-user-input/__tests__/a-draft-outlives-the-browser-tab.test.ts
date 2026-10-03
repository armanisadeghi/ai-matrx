/**
 * A TYPED-BUT-UNSENT COMPOSER DRAFT OUTLIVES THE BROWSER TAB — AND IS NEVER
 * OFFERED TO ANYONE BUT THE PERSON WHO TYPED IT.
 *
 * The defect (live sweep, 2026-10-03, Quick Chat as admin@admin.com): the draft
 * was kept in `sessionStorage`, which a reload only keeps inside the SAME
 * browser tab. The canvas remembers its Quick Chat tab in `localStorage` and
 * the conversation lives in the database, so a reload that came back in a fresh
 * tab context brought the chat back with an empty box.
 *
 * FORCING FUNCTION: the REAL middleware, slice, storage module and restore
 * thunk through a real Redux store. A "fresh tab" is modelled honestly: the
 * store, every in-memory generation AND `sessionStorage` are thrown away; only
 * `localStorage` is left as the page left it. Putting the store back on
 * `sessionStorage` fails case 1; dropping the owner check fails case 2.
 */

import { DEFAULT_CHAT_PREFERENCES } from "../../../../../host/defaults/prefs";
import { SIGNED_OUT_IDENTITY } from "../../../../../host/defaults/identity";
import { configureStore } from "@reduxjs/toolkit";
import instanceUserInputReducer, {
  initInstanceUserInput,
  setUserInputText,
} from "../instance-user-input.slice";
import {
  composerDraftMiddleware,
  __discardComposerDraftWritesForTest,
  __flushComposerDraftWritesForTest,
} from "../composer-draft.middleware";
import {
  peekComposerDraft,
  registerComposerDraftAlias,
  __resetComposerDraftGenerationsForTest,
} from "../composer-draft-store";
import { applyComposerDraft } from "../restore-composer-draft.thunk";

const CID = "3b0f5c9e-2222-4222-8222-bbbbbbbbbbbb";
const FRESH_CID = "3b0f5c9e-3333-4333-8333-cccccccccccc";
const SURFACE = "quick-chat:live:default:agent-1:0";
const ALICE = "00000000-0000-4000-8000-00000000a11c";
const BOB = "00000000-0000-4000-8000-000000000b0b";
const DRAFT = "Can you compare the two intake forms for me";

function makeStore(userId: string | null) {
  return configureStore({
    reducer: {
      instanceUserInput: instanceUserInputReducer,
      chatHost: (
        state = {
          preferences: { ...DEFAULT_CHAT_PREFERENCES, restoreUnsentDrafts: true },
          identity: { ...SIGNED_OUT_IDENTITY, userId, isAuthenticated: userId !== null },
        },
      ) => state,
    },
    middleware: (getDefault) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getDefault().concat(composerDraftMiddleware as any),
  });
}

/** A new browser tab context: memory and sessionStorage gone, localStorage kept. */
function freshTab(userId: string | null) {
  __flushComposerDraftWritesForTest();
  __resetComposerDraftGenerationsForTest();
  window.sessionStorage.clear();
  return makeStore(userId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = any;

function restore(store: AnyStore, conversationId: string, owner: string | null, alias?: string) {
  store.dispatch(initInstanceUserInput({ conversationId }));
  const token = peekComposerDraft(conversationId, alias, owner);
  if (!token) return "nothing";
  return store.dispatch(applyComposerDraft(token) as AnyStore);
}

function textIn(store: AnyStore, conversationId: string): string {
  return store.getState().instanceUserInput.byConversationId[conversationId]?.text ?? "";
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  __discardComposerDraftWritesForTest();
  __resetComposerDraftGenerationsForTest();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("the composer draft outlives the browser tab", () => {
  it("type → reload in a fresh tab context → the text is back", () => {
    let store = makeStore(ALICE);
    store.dispatch(initInstanceUserInput({ conversationId: CID }));
    store.dispatch(setUserInputText({ conversationId: CID, text: DRAFT }));

    store = freshTab(ALICE);
    expect(restore(store, CID, ALICE)).toBe("restored");
    expect(textIn(store, CID)).toBe(DRAFT);
  });

  it("an unstarted Quick Chat re-mints its id and still finds the draft", () => {
    let store = makeStore(ALICE);
    registerComposerDraftAlias(CID, SURFACE);
    store.dispatch(initInstanceUserInput({ conversationId: CID }));
    store.dispatch(setUserInputText({ conversationId: CID, text: DRAFT }));

    store = freshTab(ALICE);
    expect(restore(store, FRESH_CID, ALICE, SURFACE)).toBe("restored");
    expect(textIn(store, FRESH_CID)).toBe(DRAFT);
  });

  it("another person signing in on this browser is never offered it", () => {
    let store = makeStore(ALICE);
    registerComposerDraftAlias(CID, SURFACE);
    store.dispatch(initInstanceUserInput({ conversationId: CID }));
    store.dispatch(setUserInputText({ conversationId: CID, text: DRAFT }));

    store = freshTab(BOB);
    expect(restore(store, FRESH_CID, BOB, SURFACE)).toBe("nothing");
    expect(restore(store, CID, BOB)).toBe("nothing");
    expect(textIn(store, FRESH_CID)).toBe("");
  });

  it("an expired record is swept on the next page, not left forever", () => {
    window.localStorage.setItem(
      `matrx.composer-draft.${CID}`,
      JSON.stringify({ v: DRAFT, o: ALICE, at: 1, gen: 0 }),
    );
    const store = freshTab(ALICE);
    expect(restore(store, FRESH_CID, ALICE)).toBe("nothing");
    expect(window.localStorage.getItem(`matrx.composer-draft.${CID}`)).toBeNull();
  });
});
