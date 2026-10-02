/**
 * THE SURFACE ALIAS IS ONLY FOR A CONVERSATION THAT DOES NOT EXIST YET.
 *
 * The durable composer draft falls back to a surface-stable key so a room that
 * mints a client-only conversation id — `/chat/new`, the Scout interview room,
 * the Conductor — can still find the draft after a reload re-mints that id.
 *
 * The hazard that buys: a surface key is stable per SURFACE, and `/chat` uses
 * ONE key for every conversation with an agent (`chat:<agentId>`). Keyed on
 * that alone, a draft left on the landing would surface inside an unrelated
 * conversation. `useComposerDraftRestore` is the gate: it registers and
 * consults the alias only while the conversation has NO messages, and releases
 * it at the first turn, after which the conversation's own id is the only key.
 *
 * FORCING FUNCTION: the hook runs for real inside React against a real store
 * carrying the real `instanceUserInput` and `messages` reducers and the real
 * draft middleware. Removing the `hasMessages` gate makes case 2 restore a
 * landing draft into a conversation that already has messages — the leak.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import instanceUserInput, {
  initInstanceUserInput,
  markInputSubmitted,
  setUserInputText,
} from "../instance-user-input.slice";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import messages, {
  addOptimisticUserMessage,
} from "../../messages/messages.slice";
import {
  composerDraftMiddleware,
  __discardComposerDraftWritesForTest,
  __flushComposerDraftWritesForTest,
} from "../composer-draft.middleware";
import {
  composerDraftAliasKey,
  releaseComposerDraftAlias,
  registerComposerDraftAlias,
  __resetComposerDraftGenerationsForTest,
} from "../composer-draft-store";
import { useComposerDraftRestore } from "../useComposerDraftRestore";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  // A PARTIAL MOCK OF A REAL MODULE DIES ON THE NEXT EXPORT (DD-239): spread
  // the real store so a new export can never take this suite down at import.
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

const SURFACE = "chat:agent-7f3a";
const LANDING_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const REMINTED_ID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const REAL_CONVERSATION_ID = "cccccccc-3333-4333-8333-cccccccccccc";
const DRAFT =
  "CHAT LANDING DRAFT: long enough that losing it on a reload would actually hurt, and typed before any conversation exists.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = any;

function makeStore() {
  return configureStore({
    reducer: {
      instanceUserInput,
      messages,
      userPreferences: (state = { prompts: { restoreUnsentDrafts: true } }) =>
        state,
    },
    middleware: (getDefault) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getDefault({ serializableCheck: false }).concat(
        composerDraftMiddleware as AnyStore,
      ),
  });
}

function Probe({
  conversationId,
  surfaceKey,
}: {
  conversationId: string;
  surfaceKey: string;
}) {
  useComposerDraftRestore(conversationId, surfaceKey);
  return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mountProbe(store: AnyStore, conversationId: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <Provider store={store}>
        <Probe conversationId={conversationId} surfaceKey={SURFACE} />
      </Provider>,
    );
  });
}

function unmountProbe() {
  if (root) act(() => root!.unmount());
  if (container) container.remove();
  root = null;
  container = null;
}

function textIn(store: AnyStore, id: string): string {
  return store.getState().instanceUserInput.byConversationId[id]?.text ?? "";
}

/** Everything a real reload destroys, and nothing it keeps. */
function reload() {
  __flushComposerDraftWritesForTest();
  __resetComposerDraftGenerationsForTest();
}

beforeEach(() => {
  window.sessionStorage.clear();
  __discardComposerDraftWritesForTest();
  __resetComposerDraftGenerationsForTest();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  unmountProbe();
  jest.restoreAllMocks();
  (captureError as jest.Mock).mockClear();
});

describe("the surface alias and the handoff line", () => {
  it("/chat/new: a draft typed before the conversation exists survives a re-minted id", () => {
    let store = makeStore();
    mountProbe(store, LANDING_ID);
    act(() => {
      store.dispatch(
        setUserInputText({ conversationId: LANDING_ID, text: DRAFT }),
      );
    });
    unmountProbe();
    reload();
    (captureError as jest.Mock).mockClear();

    // The landing mints a DIFFERENT client-only id on the next visit.
    // Restore waits for the input entry — the same gate ChatRoomClient uses
    // for draft transfer — so a reload does not scream PRE-INIT.
    store = makeStore();
    mountProbe(store, REMINTED_ID);
    expect(textIn(store, REMINTED_ID)).toBe("");
    expect(captureError).not.toHaveBeenCalled();

    act(() => {
      store.dispatch(initInstanceUserInput({ conversationId: REMINTED_ID }));
    });
    expect(textIn(store, REMINTED_ID)).toBe(DRAFT);
    expect(captureError).not.toHaveBeenCalled();
  });

  it("a conversation that already has messages never adopts a landing draft", () => {
    // THE LEAK GUARD. `chat:<agentId>` is one key for every conversation with
    // that agent, so without the hasMessages gate the landing's unsent draft
    // would appear inside an unrelated, already-running conversation.
    let store = makeStore();
    mountProbe(store, LANDING_ID);
    act(() => {
      store.dispatch(
        setUserInputText({ conversationId: LANDING_ID, text: DRAFT }),
      );
    });
    unmountProbe();
    reload();

    store = makeStore();
    act(() => {
      store.dispatch(
        addOptimisticUserMessage({
          conversationId: REAL_CONVERSATION_ID,
          clientTempId: "tmp-1",
          content: [{ type: "text", text: "an earlier turn" } as never],
          position: 0,
        }),
      );
    });
    mountProbe(store, REAL_CONVERSATION_ID);
    expect(textIn(store, REAL_CONVERSATION_ID)).toBe("");
  });

  it("the handoff releases the alias — the surface is not left looking 'already sent'", () => {
    const store = makeStore();
    registerComposerDraftAlias(LANDING_ID, SURFACE);
    store.dispatch(
      setUserInputText({ conversationId: LANDING_ID, text: DRAFT }),
    );
    // The send lays the tombstone on BOTH keys (clear-before-send).
    store.dispatch(
      markInputSubmitted({ conversationId: LANDING_ID, userValues: {} }),
    );
    expect(
      window.sessionStorage.getItem(composerDraftAliasKey(SURFACE)),
    ).toContain('"sent":true');

    // The turn started: the conversation id is real now and owns the fact.
    releaseComposerDraftAlias(LANDING_ID);
    expect(
      window.sessionStorage.getItem(composerDraftAliasKey(SURFACE)),
    ).toBeNull();
  });
});
