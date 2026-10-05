/**
 * THE IDENTICAL RE-RUN (Agent Builder test panel, 2026-10-04).
 *
 * An engineer testing an agent must be able to run it again with exactly the
 * inputs of the run before — text, variables AND attachments. Auto-clear does
 * that: every send splits the request into a fresh conversation, and turning
 * Auto-clear on restores the FIRST submit. Both used to carry text + variables
 * only, so every run after the first silently went without its files, and the
 * restore brought back the words without the attachments.
 *
 * Real reducers, real thunks; the only thing simulated is the keypress
 * (`markInputSubmitted` + `markResourcesSubmitted`, exactly as smartExecute
 * dispatches them before it splits).
 */
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import type { MessagePart } from "@ai-matrx/agents/generated/stream-events";
import { chatReducers } from "../../../../../store/slices";
import type { ChatRootState } from "../../../../../store/root-state";
import { createInstanceFull } from "../../create-instance-full";
import {
  markInputSubmitted,
  setUserInputMessageParts,
  setUserInputText,
} from "../../instance-user-input/instance-user-input.slice";
import { setUserVariableValues } from "../../instance-variable-values/instance-variable-values.slice";
import {
  addResource,
  markResourcesSubmitted,
  removeResource,
  setResourcePreview,
} from "../../instance-resources/instance-resources.slice";
import { selectInstanceResources } from "../../instance-resources/instance-resources.selectors";
import { addOptimisticUserMessage } from "../../messages/messages.slice";
import { setFocus } from "../../conversation-focus/conversation-focus.slice";
import {
  setAutoClearMode,
  splitInputIntoNewConversation,
} from "../create-instance.thunk";

const SURFACE = "agent-builder-test";
const RUN_1 = "run-1";
const IMAGE = { file_id: "f1e2d3c4-0000-4000-8000-000000000001", mime_type: "image/png" };
const NOTES_PART: MessagePart = {
  type: "input_notes",
  note_ids: ["a1b2c3d4-0000-4000-8000-000000000002"],
};

function makeStore() {
  const store = configureStore({
    reducer: combineReducers(chatReducers),
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    createInstanceFull({
      conversationId: RUN_1,
      agentId: "",
      agentType: "user",
      origin: "manual",
      sourceFeature: "agent-builder",
      surfaceKey: SURFACE,
      userInput: {},
      variables: { definitions: [] },
      uiState: { autoClearConversation: true, showAutoClearToggle: true },
      messages: { apiEndpointMode: "manual" },
    }),
  );
  store.dispatch(setFocus({ surfaceKey: SURFACE, conversationId: RUN_1 }));
  return store;
}

type Store = ReturnType<typeof makeStore>;
const state = (store: Store) => store.getState() as unknown as ChatRootState;

/** The engineer's first test: a question, a variable, an image chip, a note part. */
function composeFirstRun(store: Store) {
  store.dispatch(
    setUserVariableValues({ conversationId: RUN_1, values: { topic: "tides" } }),
  );
  store.dispatch(
    setUserInputText({
      conversationId: RUN_1,
      text: "Describe {{topic}} in the picture",
      userValues: { topic: "tides" },
    }),
  );
  store.dispatch(
    addResource({
      conversationId: RUN_1,
      blockType: "image",
      source: IMAGE,
      resourceId: "res_image",
    }),
  );
  store.dispatch(
    setResourcePreview({
      conversationId: RUN_1,
      resourceId: "res_image",
      preview: "harbor.png",
    }),
  );
  store.dispatch(
    setUserInputMessageParts({ conversationId: RUN_1, parts: [NOTES_PART] }),
  );
}

/** What smartExecute dispatches at the keypress, before it splits. */
function pressSend(store: Store, conversationId: string) {
  const s = state(store);
  store.dispatch(
    markInputSubmitted({
      conversationId,
      userValues: {
        ...(s.instanceVariableValues.byConversationId[conversationId]
          ?.userValues ?? {}),
      },
      resources: selectInstanceResources(conversationId)(s),
    }),
  );
  store.dispatch(markResourcesSubmitted(conversationId));
}

async function split(store: Store, from: string): Promise<string> {
  const { newConversationId } = await store
    .dispatch(
      splitInputIntoNewConversation({
        currentConversationId: from,
        surfaceKey: SURFACE,
      }),
    )
    .unwrap();
  return newConversationId;
}

function composerOf(store: Store, conversationId: string) {
  const s = state(store);
  return {
    text: s.instanceUserInput.byConversationId[conversationId]?.text,
    messageParts:
      s.instanceUserInput.byConversationId[conversationId]?.messageParts,
    userValues:
      s.instanceVariableValues.byConversationId[conversationId]?.userValues,
    resources: Object.values(
      s.instanceResources.byConversationId[conversationId] ?? {},
    ).map((r) => ({
      resourceId: r.resourceId,
      blockType: r.blockType,
      source: r.source,
      preview: r.preview,
      status: r.status,
    })),
  };
}

const FIRST_RUN_ATTACHMENTS = {
  messageParts: [NOTES_PART],
  resources: [
    {
      resourceId: "res_image",
      blockType: "image",
      source: IMAGE,
      preview: "harbor.png",
      status: "ready",
    },
  ],
};

describe("an auto-clear re-run sends the identical request", () => {
  it("carries the attachments of the run just sent into the next conversation", async () => {
    const store = makeStore();
    composeFirstRun(store);
    pressSend(store, RUN_1);

    const run2 = await split(store, RUN_1);

    expect(run2).not.toBe(RUN_1);
    expect(composerOf(store, run2)).toEqual({
      text: "Describe {{topic}} in the picture",
      userValues: { topic: "tides" },
      ...FIRST_RUN_ATTACHMENTS,
    });
    // ...and the run after that still has them.
    pressSend(store, run2);
    const run3 = await split(store, run2);
    expect(composerOf(store, run3)).toMatchObject(FIRST_RUN_ATTACHMENTS);
  });

  it("turning Auto-clear on restores the first submit's attachments in place", async () => {
    const store = makeStore();
    composeFirstRun(store);
    pressSend(store, RUN_1);
    const run2 = await split(store, RUN_1);

    // The engineer edits the next request: drops the image, the note, the words.
    store.dispatch(removeResource({ conversationId: run2, resourceId: "res_image" }));
    store.dispatch(setUserInputMessageParts({ conversationId: run2, parts: null }));
    store.dispatch(setUserInputText({ conversationId: run2, text: "something else" }));

    await store.dispatch(setAutoClearMode({ conversationId: run2, value: true })).unwrap();

    expect(composerOf(store, run2)).toEqual({
      text: "Describe {{topic}} in the picture",
      userValues: { topic: "tides" },
      ...FIRST_RUN_ATTACHMENTS,
    });
  });

  it("restoring from a conversation with history lands a fresh one holding the first submit's attachments", async () => {
    const store = makeStore();
    composeFirstRun(store);
    pressSend(store, RUN_1);
    store.dispatch(
      addOptimisticUserMessage({
        conversationId: RUN_1,
        clientTempId: "temp-1",
        content: [{ type: "text", text: "Describe tides in the picture" }],
        position: 0,
      }),
    );
    // Its composer has moved on since.
    store.dispatch(removeResource({ conversationId: RUN_1, resourceId: "res_image" }));
    store.dispatch(setUserInputMessageParts({ conversationId: RUN_1, parts: null }));

    await store
      .dispatch(setAutoClearMode({ conversationId: RUN_1, value: true, surfaceKey: SURFACE }))
      .unwrap();

    const fresh = state(store).conversationFocus.bySurface[SURFACE]?.input;
    expect(fresh).toBeDefined();
    expect(fresh).not.toBe(RUN_1);
    expect(composerOf(store, fresh as string)).toEqual({
      text: "Describe {{topic}} in the picture",
      userValues: { topic: "tides" },
      ...FIRST_RUN_ATTACHMENTS,
    });
  });
});
