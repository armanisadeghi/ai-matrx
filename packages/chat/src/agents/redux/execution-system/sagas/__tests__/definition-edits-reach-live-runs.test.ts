/**
 * Every builder edit that changes an agent's settings or variables reaches the
 * builder's live test conversation.
 *
 * Real use: in Product Shot Studio the author makes Quality a fixed setting
 * (unbinds it). The test-run panel beside the builder kept offering a
 * "Quality: medium" run input — the unbind travels as `setAgentControlBinding`,
 * which the definition-sync saga never watched, and neither are undo/redo.
 */

import { configureStore } from "@reduxjs/toolkit";
import createSagaMiddleware from "redux-saga";
import agentDefinitionReducer, {
  mergePartialAgent,
  setAgentControlBinding,
  setAgentSettings,
  undoAgentEdit,
} from "@/features/agents/redux/agent-definition/slice";
import { watchDefinitionChanges } from "../syncDefinitionToInstances.saga";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";

const AGENT = "3bf7e37d-26b4-4581-ac29-450462c18b22";
const CONV = "builder-test-run";
const QUALITY: VariableDefinition = {
  name: "quality",
  control: { key: "quality" },
  required: false,
  defaultValue: "medium",
};
const SUBJECT: VariableDefinition = { name: "subject", defaultValue: "" };

type Action = { type: string; payload?: Record<string, unknown> };

function setup() {
  const seen: Action[] = [];
  const sagas = createSagaMiddleware();
  const store = configureStore({
    reducer: {
      agentDefinition: agentDefinitionReducer,
      conversations: (
        state = {
          allConversationIds: [CONV],
          byConversationId: { [CONV]: { conversationId: CONV, agentId: AGENT } },
        },
      ) => state,
      log: (state: Action[] = seen, action: Action) => {
        if (
          action.type.endsWith("updateInstanceDefinitions") ||
          action.type.endsWith("updateBaseSettings")
        ) {
          seen.push(action);
        }
        return state;
      },
    },
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }).concat(sagas),
  });
  sagas.run(watchDefinitionChanges);
  store.dispatch(
    mergePartialAgent({
      id: AGENT,
      modelId: "gpt-image-2",
      settings: { moderation: "low" },
      variableDefinitions: [SUBJECT, QUALITY],
    } as Parameters<typeof mergePartialAgent>[0]),
  );
  return { store, seen };
}

const settle = () => new Promise((r) => setTimeout(r, 400));

function last(seen: Action[], suffix: string) {
  return [...seen].reverse().find((a) => a.type.endsWith(suffix))?.payload;
}

test("unbinding a control updates the live run's variables AND base settings", async () => {
  const { store, seen } = setup();
  store.dispatch(
    setAgentControlBinding({
      id: AGENT,
      settings: { moderation: "low", quality: "medium" },
      variableDefinitions: [SUBJECT],
    }),
  );
  await settle();
  expect(last(seen, "updateInstanceDefinitions")).toEqual({
    conversationId: CONV,
    definitions: [SUBJECT],
  });
  expect(last(seen, "updateBaseSettings")).toEqual({
    conversationId: CONV,
    baseSettings: { moderation: "low", quality: "medium", model: "gpt-image-2" },
  });
});

test("undo of a settings edit reaches the live run too", async () => {
  const { store, seen } = setup();
  store.dispatch(
    setAgentSettings({ id: AGENT, settings: { moderation: "auto" } }),
  );
  await settle();
  store.dispatch(undoAgentEdit({ id: AGENT }));
  await settle();
  expect(last(seen, "updateBaseSettings")).toEqual({
    conversationId: CONV,
    baseSettings: { moderation: "low", model: "gpt-image-2" },
  });
});
