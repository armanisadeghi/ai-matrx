/**
 * THE RUN CONFIGURATION SURVIVES A REOPEN (phone run PB-08 #2, 2026-10-01):
 * a tool and a skill added to a conversation through Chat Options were gone
 * (Tools 0 / Skills 0) when the conversation was reopened from history,
 * because they lived only in Redux.
 *
 * The real middleware + real instance-ui-state reducer + real
 * `mergeJsonColumn`; the one double is the database (an in-memory
 * chat.conversation row behind the supabase client chain).
 *
 * Mutation: remove `runConfigurationPersistMiddleware` from the store, or drop
 * the `setInstanceStatus … "complete"` trigger — "persists after the turn"
 * goes RED. Remove the restore block in load-conversation.thunk.ts and
 * "parse round-trips" stays green but the live reopen check fails.
 */
import { combineReducers, configureStore, type Middleware } from "@reduxjs/toolkit";

const row: { id: string; version: number; metadata: Record<string, unknown> } = {
  id: "c0ffee00-0000-4000-8000-000000000001",
  version: 1,
  metadata: { last_request_context: { agent_id: "a" } },
};
const updates: unknown[] = [];

jest.mock("../../../../../host/db", () => {
  const chain = (op: "select" | "update", patch?: Record<string, unknown>) => {
    const filters: Record<string, unknown> = {};
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return api;
      },
      maybeSingle: async () => {
        if (op === "select") return { data: { ...row }, error: null };
        if (filters.version !== row.version) return { data: null, error: null };
        updates.push(patch);
        Object.assign(row, patch);
        return { data: { ...row }, error: null };
      },
    };
    return api;
  };
  return {
    supabase: {
      schema: () => ({
        from: () => ({
          select: () => chain("select"),
          update: (patch: Record<string, unknown>) => chain("update", patch),
        }),
      }),
    },
  };
});

import instanceUIStateReducer, {
  initInstanceUIState,
  setBuilderAdvancedSettings,
} from "../instance-ui-state.slice";
import conversationsReducer, { setInstanceStatus } from "../../conversations/conversations.slice";
import {
  parsePersistedRunConfiguration,
  runConfigurationPersistMiddleware,
} from "../run-configuration-persist";

const CONV = row.id;
const TOOL = "11111111-1111-4111-8111-111111111111";
const SKILL = "22222222-2222-4222-8222-222222222222";

const reducer = combineReducers({
  instanceUIState: instanceUIStateReducer,
  conversations: conversationsReducer,
});

function makeStore() {
  return configureStore({
    reducer,
    preloadedState: {
      conversations: {
        byConversationId: {
          [CONV]: { conversationId: CONV, status: "running", cacheOnly: false },
        },
        allConversationIds: [CONV],
      },
    } as unknown as ReturnType<typeof reducer>,
    middleware: (g) =>
      g({ serializableCheck: false, immutableCheck: false }).concat(
        runConfigurationPersistMiddleware as Middleware,
      ),
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  updates.length = 0;
});
afterEach(() => jest.useRealTimers());

it("persists tools and skills added mid-turn once the turn completes, keeping the server's keys", async () => {
  const store = makeStore();
  store.dispatch(initInstanceUIState({ conversationId: CONV }));
  store.dispatch(
    setBuilderAdvancedSettings({
      conversationId: CONV,
      changes: { addedTools: [TOOL], addedSkills: [SKILL] },
    }),
  );
  // A turn is in flight — nothing is written yet (the server would overwrite it).
  await jest.advanceTimersByTimeAsync(10_000);
  expect(updates).toEqual([]);

  store.dispatch(setInstanceStatus({ conversationId: CONV, status: "complete" }));
  await jest.advanceTimersByTimeAsync(10_000);

  expect(updates).toHaveLength(1);
  expect(row.metadata.last_request_context).toEqual({ agent_id: "a" });
  expect(parsePersistedRunConfiguration(row.metadata)).toEqual({
    addedTools: [TOOL],
    addedSkills: [SKILL],
    addedMcpServers: [],
    removedTools: [],
    autoTools: null,
    surfaceName: null,
    outputKinds: [],
    outputTypes: ["text"],
  });
});

it("parse round-trips the stored shape and ignores junk", () => {
  expect(
    parsePersistedRunConfiguration({
      run_configuration: { added_tools: [TOOL, 3, ""], added_skills: [SKILL] },
    }),
  ).toEqual({
    addedTools: [TOOL],
    addedSkills: [SKILL],
    addedMcpServers: [],
    removedTools: [],
    autoTools: null,
    surfaceName: null,
    outputKinds: [],
    outputTypes: ["text"],
  });
  // The per-chat switch and removals survive a reopen too.
  expect(
    parsePersistedRunConfiguration({
      run_configuration: { removed_tools: ["web"], auto_tools: false },
    }),
  ).toMatchObject({ removedTools: ["web"], autoTools: false });
  // The shapes picked in the composer's Output ride the same record — stored
  // camelCase because the SERVER reads `run_configuration.outputKinds`.
  expect(
    parsePersistedRunConfiguration({
      run_configuration: { outputKinds: ["quiz_set", 4, ""], outputTypes: ["text", "image"] },
    }),
  ).toMatchObject({ outputKinds: ["quiz_set"], outputTypes: ["text", "image"] });
  // A stored empty types list is a choice (untick everything), not the default.
  expect(
    parsePersistedRunConfiguration({ run_configuration: { outputTypes: [] } }),
  ).toMatchObject({ outputTypes: [] });
  expect(parsePersistedRunConfiguration({})).toBeNull();
  expect(parsePersistedRunConfiguration(null)).toBeNull();
});
