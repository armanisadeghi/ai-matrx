/**
 * "Use" on a saved test case restores EVERYTHING, attachments included — as
 * the same chips a person attaching them gets, and sent identically.
 *
 * Until 2026-10-04 the test case's attachment parts were written to the
 * composer's `messageParts`, which no composer renders: the engineer saw the
 * text and variables load and the files apparently not.
 *
 * Round trip under test: chips a person attached → the request parts they
 * send → stored on the test case (as `chat.message` content) → Use → chips on
 * a fresh composer → the request parts they send. The two sends must match.
 */
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import type { MessagePart } from "@ai-matrx/agents/generated/stream-events";
import input from "@ai-matrx/chat/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import variables, {
  initInstanceVariables,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import resources, {
  addResource,
  initInstanceResources,
  setResourcePreview,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/instance-resources.slice";
import {
  selectResourcePayloads,
  userInputPartToMessagePart,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import { initInstanceUserInput } from "@ai-matrx/chat/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import type { ChatDispatch, ChatRootState } from "@ai-matrx/chat/store/root-state";
import { applySampleToComposer } from "@/features/agents/samples/apply-sample";
import { SAMPLE_INPUT_CONTENT_KEY } from "@/features/agents/samples/service";

const PERSON = "composer-person";
const TESTER = "composer-tester";

function makeStore() {
  const store = configureStore({
    reducer: combineReducers({
      instanceUserInput: input,
      instanceVariableValues: variables,
      instanceResources: resources,
    }),
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  for (const conversationId of [PERSON, TESTER]) {
    store.dispatch(initInstanceUserInput({ conversationId }));
    store.dispatch(initInstanceVariables({ conversationId, definitions: [] }));
    store.dispatch(initInstanceResources({ conversationId }));
  }
  return store;
}

type Store = ReturnType<typeof makeStore>;
const root = (store: Store) => store.getState() as unknown as ChatRootState;
/** The slices under test are the chat store's own; its thunks run on them. */
const chatDispatch = (store: Store) => store.dispatch as unknown as ChatDispatch;

/** Attach the way the pickers do: addResource + a label (which readies it). */
function attach(
  store: Store,
  resourceId: string,
  blockType: Parameters<typeof addResource>[0]["blockType"],
  source: unknown,
  label: string,
  options?: { editable: boolean },
) {
  store.dispatch(
    addResource({ conversationId: PERSON, blockType, source, resourceId, options }),
  );
  store.dispatch(
    setResourcePreview({ conversationId: PERSON, resourceId, preview: label }),
  );
}

/** A test case saved from the person's send, as `chat.message.content`. */
function savedTestCase(store: Store) {
  const sent = selectResourcePayloads(PERSON)(root(store));
  const content: MessagePart[] = [
    { type: "text", text: "What do these say?" },
    ...sent.map(userInputPartToMessagePart),
  ];
  return {
    sent,
    sample: {
      user_input: "What do these say?",
      variables: { tone: "plain" },
      metadata: { [SAMPLE_INPUT_CONTENT_KEY]: content },
    },
  };
}

describe("Use on a test case", () => {
  it("shows its attachments as chips and sends exactly what was saved", () => {
    const store = makeStore();
    attach(store, "img", "image", { file_id: "11111111-1111-4111-8111-111111111111", mime_type: "image/png" }, "receipt.png");
    attach(store, "note", "input_notes", ["22222222-2222-4222-8222-222222222222"], "Trip notes", { editable: true });
    attach(store, "web", "input_webpage", ["https://example.com/fares"], "Fares page");
    attach(store, "yt", "youtube_video", "https://www.youtube.com/watch?v=abc123", "Walkthrough");
    const { sent, sample } = savedTestCase(store);
    expect(sent).toHaveLength(4);

    const unattached = chatDispatch(store)(
      applySampleToComposer({ conversationId: TESTER, sample }),
    );

    const state = root(store);
    const chips = Object.values(
      state.instanceResources.byConversationId[TESTER] ?? {},
    ).sort((a, b) => a.sortOrder - b.sortOrder);
    expect(unattached).toEqual([]);
    expect(chips.map((chip) => [chip.blockType, chip.preview, chip.status])).toEqual([
      ["image", "receipt.png", "ready"],
      ["input_notes", "Trip notes", "ready"],
      ["input_webpage", "Fares page", "ready"],
      ["youtube_video", "Walkthrough", "ready"],
    ]);
    // Nothing is left riding invisibly beside the chips.
    expect(state.instanceUserInput.byConversationId[TESTER]?.messageParts).toBeNull();
    expect(state.instanceUserInput.byConversationId[TESTER]?.text).toBe("What do these say?");
    expect(state.instanceVariableValues.byConversationId[TESTER]?.userValues).toEqual({ tone: "plain" });
    // The identical request.
    expect(selectResourcePayloads(TESTER)(state)).toEqual(sent);
    // Composer-shaped parts rebuild from their source: the person's controls
    // (the note's lock) stay live, nothing is frozen into a fixed payload.
    expect(chips.every((chip) => chip.finalPayload === null)).toBe(true);
    expect(chips[1]?.options.editable).toBe(true);
  });

  it("keeps a stored part the composer cannot rebuild exactly as it was saved", () => {
    const store = makeStore();
    const stored: MessagePart = {
      type: "media",
      kind: "image",
      file_id: "33333333-3333-4333-8333-333333333333",
      mime_type: "image/jpeg",
      width: 640,
      height: 480,
      metadata: { display_title: "scan.jpg" },
    };
    chatDispatch(store)(
      applySampleToComposer({
        conversationId: TESTER,
        sample: {
          user_input: "Read it",
          variables: {},
          metadata: { [SAMPLE_INPUT_CONTENT_KEY]: [{ type: "text", text: "Read it" }, stored] },
        },
      }),
    );
    const state = root(store);
    const [chip] = Object.values(state.instanceResources.byConversationId[TESTER] ?? {});
    expect(chip?.preview).toBe("scan.jpg");
    expect(selectResourcePayloads(TESTER)(state)).toEqual([
      {
        type: "media",
        kind: "image",
        file_id: "33333333-3333-4333-8333-333333333333",
        mime_type: "image/jpeg",
        width: 640,
        height: 480,
        metadata: { display_title: "scan.jpg" },
      },
    ]);
  });

  it("returns a part that has no chip form, and still sends it", () => {
    const store = makeStore();
    const contextPart: MessagePart = {
      type: "input_context",
      context_name: "Brand voice",
      context_data: { tone: "warm" },
    };
    const unattached = chatDispatch(store)(
      applySampleToComposer({
        conversationId: TESTER,
        sample: {
          user_input: "Write it",
          variables: {},
          metadata: { [SAMPLE_INPUT_CONTENT_KEY]: [{ type: "text", text: "Write it" }, contextPart] },
        },
      }),
    );
    expect(unattached).toEqual([contextPart]);
    expect(root(store).instanceUserInput.byConversationId[TESTER]?.messageParts).toEqual([contextPart]);
  });
});
