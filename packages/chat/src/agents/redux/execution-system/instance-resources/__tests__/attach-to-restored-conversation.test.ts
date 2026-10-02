/**
 * An attachment is never silently dropped because a conversation reached
 * Redux by a path that did not seed the resources bucket.
 *
 * Found 2026-10-01 on /notes: a floating agent window restored from
 * `?panels=agent:<id>` (or reloaded after its first turn) is created by
 * `loadConversation` → `hydrateConversation`, which never seeded
 * `instanceResources.byConversationId[id]`. `addResource` then no-oped, so a
 * picked note/task attached nothing and an uploaded file's chip vanished (its
 * durable edge still reached the agent). /chat worked only because its route
 * created the instance through `createInstanceFull` first.
 *
 * The real reducers run here, wired the way the root store wires them; the
 * restore path is reproduced with the same action `loadConversation` uses.
 */
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import conversationsReducer, {
  hydrateConversation,
} from "../../conversations/conversations.slice";
import instanceResourcesReducer, {
  addResource,
  initInstanceResources,
} from "../instance-resources.slice";
import instanceClientToolsReducer, {
  addClientTool,
} from "../../instance-client-tools/instance-client-tools.slice";
import { createInstanceFull } from "../../create-instance-full";

const RESTORED_ID = "6a1d4c2e-2f43-4c0b-9b77-1f0c3d9e8a51";

function makeStore() {
  return configureStore({
    reducer: combineReducers({
      conversations: conversationsReducer,
      instanceResources: instanceResourcesReducer,
      instanceClientTools: instanceClientToolsReducer,
    }),
  });
}

function restoreFromDatabase(store: ReturnType<typeof makeStore>) {
  store.dispatch(
    hydrateConversation({
      conversationId: RESTORED_ID,
      agentId: "92c37a37-7630-4517-b2a2-b6f1d2427208",
      agentType: "user",
      origin: "manual",
      status: "ready",
    }),
  );
}

const cascadeNote = {
  id: "659409b8-453c-4d44-92fb-d8fda8ce0add",
  label: "Cascade Electronics — Q4 pickup schedule",
  content: "## Pickups\n- Oct 22: 40 rack servers, drives shredded on site",
};

describe("attaching to a conversation restored from the database", () => {
  it("lands a picked note on a conversation that only hydrateConversation created", () => {
    const store = makeStore();
    restoreFromDatabase(store);

    store.dispatch(
      addResource({
        conversationId: RESTORED_ID,
        blockType: "input_notes",
        source: cascadeNote,
        resourceId: "res_note_1",
      }),
    );

    const bucket =
      store.getState().instanceResources.byConversationId[RESTORED_ID];
    expect(bucket).toBeDefined();
    expect(bucket?.res_note_1?.source).toEqual(cascadeNote);
  });

  it("keeps a second resource beside the first", () => {
    const store = makeStore();
    restoreFromDatabase(store);
    for (const [resourceId, blockType] of [
      ["res_note_1", "input_notes"],
      ["res_task_1", "input_task"],
    ] as const) {
      store.dispatch(
        addResource({
          conversationId: RESTORED_ID,
          blockType,
          source: { id: resourceId },
          resourceId,
        }),
      );
    }
    const bucket =
      store.getState().instanceResources.byConversationId[RESTORED_ID] ?? {};
    expect(Object.keys(bucket).sort()).toEqual(["res_note_1", "res_task_1"]);
    expect(bucket.res_task_1?.sortOrder).toBe(1);
  });

  it("never lets a later instance init wipe an attachment made before it", () => {
    const store = makeStore();
    store.dispatch(
      addResource({
        conversationId: RESTORED_ID,
        blockType: "input_notes",
        source: cascadeNote,
        resourceId: "res_early",
      }),
    );
    store.dispatch(
      createInstanceFull({
        conversationId: RESTORED_ID,
        agentId: "92c37a37-7630-4517-b2a2-b6f1d2427208",
        agentType: "user",
        origin: "manual",
      }),
    );
    store.dispatch(initInstanceResources({ conversationId: RESTORED_ID }));
    expect(
      store.getState().instanceResources.byConversationId[RESTORED_ID]
        ?.res_early,
    ).toBeDefined();
  });

  it("registers a client tool on a restored conversation", () => {
    const store = makeStore();
    restoreFromDatabase(store);
    store.dispatch(
      addClientTool({ conversationId: RESTORED_ID, toolName: "scribe_add_task" }),
    );
    expect(
      store.getState().instanceClientTools.byConversationId[RESTORED_ID],
    ).toEqual(["scribe_add_task"]);
  });
});
