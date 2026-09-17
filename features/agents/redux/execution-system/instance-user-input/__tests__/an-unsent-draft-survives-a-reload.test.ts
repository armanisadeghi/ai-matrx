/**
 * A TYPED-BUT-UNSENT COMPOSER MESSAGE SURVIVES A RELOAD — AND A SENT ONE NEVER
 * COMES BACK.
 *
 * The defect (FOUND_DEFECTS, 2026-09-17): `instanceUserInput` is in-memory, so
 * the protection in `input-draft-protection.ts` ended at the tab. 198
 * characters typed into the interview composer, reload, field empty, nothing
 * said.
 *
 * The thing that made it dangerous to fix is the other half: a restore landing
 * after a send would put the sent message back and the user would send it
 * twice. So these cases are a matched pair — the draft must come back, and the
 * sent message must never come back, including when the restore and the send
 * race.
 *
 * FORCING FUNCTION: every case drives the REAL middleware, the REAL slice, the
 * REAL storage module and the REAL restore thunk through a real Redux store.
 * A "reload" is modelled honestly: the store and every in-memory generation are
 * thrown away while `sessionStorage` — the only thing a reload keeps — is left
 * exactly as the page left it. Deleting the middleware from the chain fails
 * case 1; deleting the generation check in the thunk fails case 4.
 */

import { configureStore } from "@reduxjs/toolkit";
import instanceUserInputReducer, {
  clearUserInput,
  markInputPersisted,
  markInputSubmitted,
  resetSubmissionPhase,
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
  type ComposerDraftToken,
} from "../composer-draft-store";
import { applyComposerDraft } from "../restore-composer-draft.thunk";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(),
}));

const CID = "9f1c0b7e-1111-4111-8111-aaaaaaaaaaaa";
/** The exact length measured live on the Rulebook interview composer. */
const LONG_DRAFT = "x".repeat(198);

function makeStore(restoreUnsentDrafts: boolean | undefined = true) {
  return configureStore({
    reducer: {
      instanceUserInput: instanceUserInputReducer,
      userPreferences: (
        state = { prompts: { restoreUnsentDrafts } },
      ) => state,
    },
    middleware: (getDefault) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getDefault().concat(composerDraftMiddleware as any),
  });
}

/** Everything a real reload destroys, and nothing it keeps. */
function reload() {
  __flushComposerDraftWritesForTest();
  __resetComposerDraftGenerationsForTest();
  return makeStore();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = any;

function textIn(store: AnyStore): string {
  return store.getState().instanceUserInput.byConversationId[CID]?.text ?? "";
}

function apply(store: AnyStore, token: ComposerDraftToken) {
  return store.dispatch(applyComposerDraft(token) as AnyStore);
}

function restoreInto(store: AnyStore) {
  const token = peekComposerDraft(CID);
  if (!token) return "nothing";
  return apply(store, token);
}

beforeEach(() => {
  window.sessionStorage.clear();
  __discardComposerDraftWritesForTest();
  __resetComposerDraftGenerationsForTest();
  // The slice's protection paths scream by design (loud recovery); keep the
  // test output clean without hiding a failure.
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("the composer draft survives a reload", () => {
  it("type → reload → the text is back", () => {
    let store = makeStore();
    store.dispatch(setUserInputText({ conversationId: CID, text: LONG_DRAFT }));

    store = reload();
    expect(textIn(store)).toBe("");

    expect(restoreInto(store)).toBe("restored");
    expect(textIn(store)).toBe(LONG_DRAFT);
  });

  it("type → send → reload → the composer is empty", () => {
    let store = makeStore();
    store.dispatch(setUserInputText({ conversationId: CID, text: LONG_DRAFT }));
    // The real send order: snapshot-and-tombstone first, server acknowledges
    // the reservation second.
    store.dispatch(
      markInputSubmitted({ conversationId: CID, userValues: {} }),
    );
    store.dispatch(markInputPersisted(CID));

    store = reload();
    expect(peekComposerDraft(CID)).toBeNull();
    expect(restoreInto(store)).toBe("nothing");
    expect(textIn(store)).toBe("");
  });

  it("a send racing a restore never resurrects the sent message", () => {
    const store = makeStore();
    store.dispatch(setUserInputText({ conversationId: CID, text: LONG_DRAFT }));
    __flushComposerDraftWritesForTest();

    // The restore reads the draft…
    const token = peekComposerDraft(CID);
    expect(token).not.toBeNull();

    // …and before it applies, the user sends. Clear-before-send bumps the
    // generation and lays the tombstone.
    store.dispatch(
      markInputSubmitted({ conversationId: CID, userValues: {} }),
    );
    store.dispatch(markInputPersisted(CID));
    expect(textIn(store)).toBe("");

    // The stale token must be refused, not applied.
    expect(apply(store, token!)).toBe("superseded");
    expect(textIn(store)).toBe("");
  });

  it("a restore never overwrites text the person can already see", () => {
    let store = makeStore();
    store.dispatch(setUserInputText({ conversationId: CID, text: LONG_DRAFT }));

    store = reload();
    store.dispatch(setUserInputText({ conversationId: CID, text: "typing" }));
    const token = peekComposerDraft(CID);
    expect(apply(store, token!)).toBe("occupied");
    expect(textIn(store)).toBe("typing");
  });

  it("a FAILED send keeps the draft restorable (the tombstone is not the end)", () => {
    let store = makeStore();
    store.dispatch(setUserInputText({ conversationId: CID, text: LONG_DRAFT }));
    store.dispatch(
      markInputSubmitted({ conversationId: CID, userValues: {} }),
    );
    // The request died. `resetSubmissionPhase` is the error/abort path: the
    // slice keeps the text, so storage must keep it too.
    store.dispatch(resetSubmissionPhase(CID));

    store = reload();
    expect(restoreInto(store)).toBe("restored");
    expect(textIn(store)).toBe(LONG_DRAFT);
  });

  it("a next-message draft typed during a stream survives the stream's clear", () => {
    // `clearUserInput` PRESERVES a live next-message draft (the sacred
    // invariant). Storage must follow the slice, never the action's intent.
    let store = makeStore();
    store.dispatch(setUserInputText({ conversationId: CID, text: "sent one" }));
    store.dispatch(
      markInputSubmitted({ conversationId: CID, userValues: {} }),
    );
    store.dispatch(markInputPersisted(CID));
    store.dispatch(setUserInputText({ conversationId: CID, text: LONG_DRAFT }));
    store.dispatch(clearUserInput(CID));
    expect(textIn(store)).toBe(LONG_DRAFT);

    store = reload();
    expect(restoreInto(store)).toBe("restored");
    expect(textIn(store)).toBe(LONG_DRAFT);
  });

  it("a room that re-mints its conversation id still finds the draft", () => {
    // The Scout interview and Conductor rooms mint a CLIENT-ONLY conversation
    // id until the person has spoken, and mint a different one after a reload.
    // Measured live 2026-09-17 in the Conductor: without the surface alias the
    // draft is orphaned under an id nothing will ask for again.
    const SURFACE = "masterwork-conduct:rulebook-1";
    const FIRST = "11111111-1111-4111-8111-111111111111";
    const SECOND = "22222222-2222-4222-8222-222222222222";

    let store = makeStore();
    registerComposerDraftAlias(FIRST, SURFACE);
    store.dispatch(setUserInputText({ conversationId: FIRST, text: LONG_DRAFT }));
    __flushComposerDraftWritesForTest();
    __resetComposerDraftGenerationsForTest();

    store = makeStore();
    registerComposerDraftAlias(SECOND, SURFACE);
    expect(peekComposerDraft(SECOND)).toBeNull(); // the id is gone…
    const token = peekComposerDraft(SECOND, SURFACE); // …the surface is not
    expect(token?.value).toBe(LONG_DRAFT);
    expect(apply(store, token!)).toBe("restored");
    expect(
      store.getState().instanceUserInput.byConversationId[SECOND]?.text,
    ).toBe(LONG_DRAFT);
  });

  it("a send tombstones the surface alias too — no second door back", () => {
    const SURFACE = "masterwork-conduct:rulebook-2";
    const FIRST = "33333333-3333-4333-8333-333333333333";
    const SECOND = "44444444-4444-4444-8444-444444444444";

    let store = makeStore();
    registerComposerDraftAlias(FIRST, SURFACE);
    store.dispatch(setUserInputText({ conversationId: FIRST, text: LONG_DRAFT }));
    store.dispatch(
      markInputSubmitted({ conversationId: FIRST, userValues: {} }),
    );

    __resetComposerDraftGenerationsForTest();
    store = makeStore();
    registerComposerDraftAlias(SECOND, SURFACE);
    expect(peekComposerDraft(SECOND, SURFACE)).toBeNull();
  });

  it("the knob off means nothing is kept at all", () => {
    const store = makeStore(false);
    store.dispatch(setUserInputText({ conversationId: CID, text: LONG_DRAFT }));
    __flushComposerDraftWritesForTest();
    expect(peekComposerDraft(CID)).toBeNull();
  });

  it("a preferences blob written before the knob existed defaults to ON", () => {
    let store = makeStore(undefined);
    store.dispatch(setUserInputText({ conversationId: CID, text: LONG_DRAFT }));
    __flushComposerDraftWritesForTest();
    __resetComposerDraftGenerationsForTest();
    store = makeStore(undefined);
    expect(restoreInto(store)).toBe("restored");
    expect(textIn(store)).toBe(LONG_DRAFT);
  });
});
