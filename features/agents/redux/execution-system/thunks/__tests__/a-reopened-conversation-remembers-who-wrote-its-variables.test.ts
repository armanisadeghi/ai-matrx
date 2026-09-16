/**
 * A REOPENED CONVERSATION REMEMBERS WHO WROTE ITS VARIABLES — a forcing function.
 *
 * THE DEFECT (cold walk, jobs-bar-2026-09-16; the KNOWN LIMIT `09d06177f0`
 * wrote into the selector instead of hiding, reproduced live before this file).
 *
 * A purpose-built conversation hands its agent the whole job as named launch
 * variables: the Conductor sends `rulebook_id`, `attachments` and the entire
 * rendered `rulebook_document`; the Scout interview sends the mode, the probes,
 * the closing switch and the Expert's goal. `09d06177f0` recorded that
 * authorship in memory so the first user bubble stopped reciting the host's own
 * vocabulary back at her. It did not survive the tab: `chat.conversation.variables`
 * stores the MERGED payload and carries no authorship, so reopening the very
 * same conversation printed "Expert Goal: …" and "Rulebook: …" inside her bubble
 * all over again.
 *
 * Every case below drives the REAL `loadConversation` thunk against a REAL store
 * holding the REAL reducer, and asks the REAL selector and the REAL display
 * builder the bubble renders through. Only the network is stubbed — and the stub
 * returns the row shape `get_cx_conversation_bundle` actually returns
 * (`to_jsonb(c.*)`, which is why the new column needs no RPC change).
 */

import { configureStore } from "@reduxjs/toolkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import messages from "../../messages/messages.slice";
import conversations from "../../conversations/conversations.slice";
import instanceVariableValues from "../../instance-variable-values/instance-variable-values.slice";
import { selectOwnVariableValues } from "../../instance-variable-values/instance-variable-values.selectors";
import { buildVariableDisplayLines } from "@/features/agents/utils/variable-display-lines";
import { loadConversation } from "../load-conversation.thunk";

const mockFetchBundle = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));

jest.mock("../conversation-bundle", () => {
  const actual = jest.requireActual("../conversation-bundle");
  return {
    ...actual,
    fetchConversationBundle: (...args: unknown[]) => mockFetchBundle(...args),
  };
});

jest.mock("@/features/code/redux/codeEditHistoryHydration", () => ({
  loadCodeEditHistoryThunk: () => ({ type: "test/loadCodeEditHistory" }),
}));

jest.mock("../../inbox/inbox.thunks", () => ({
  hydrateInbox: () => ({ type: "test/hydrateInbox" }),
}));

const CONVERSATION_ID = "ee29ba15-63fe-4e22-adc4-0798909929f8";

/** The Scout interview's real launch payload (`buildInterviewLaunchVariables`). */
const INTERVIEW_LAUNCH = {
  rulebook_id: "a84d1c5e-0000-4000-8000-000000000001",
  interview_context_mode: "blank_slate",
  interview_probes: "story_time",
  interview_closing_surprises: "on",
  expert_goal: "How I decide which pallets need a manual sort",
};

/** The Conductor's real launch payload (`ConductorPanel.tsx` `runtime.variables`). */
const CONDUCTOR_LAUNCH = {
  rulebook_id: "a84d1c5e-0000-4000-8000-000000000001",
  attachments: '[{"entity_token":"rulebook","id":"a84d1c5e","name":"Pallets"}]',
  rulebook_document: "# Pallet Triage\n\nRule 1 — hand-sort anything sealed.",
};

function bundleFor(
  variables: Record<string, unknown>,
  hostValueNames: string[] | undefined,
) {
  return {
    // `to_jsonb(c.*)` — the whole row, which is how the new column arrives.
    conversation: {
      id: CONVERSATION_ID,
      created_at: "2026-09-16T00:00:00Z",
      updated_at: "2026-09-16T00:00:00Z",
      created_by: "11111111-1111-4111-8111-111111111111",
      organization_id: "22222222-2222-4222-8222-222222222222",
      initial_agent_id: null,
      initial_agent_version_id: null,
      last_model_id: null,
      parent_conversation_id: null,
      forked_from_id: null,
      forked_at_position: null,
      task_id: null,
      is_ephemeral: false,
      visibility: "private",
      title: "Scout interview",
      description: null,
      keywords: null,
      system_instruction: null,
      status: "active",
      message_count: 2,
      metadata: {},
      overrides: {},
      source_app: "matrx",
      source_feature: "chat",
      sandbox_instance_id: null,
      app_instance_id: null,
      variables,
      ...(hostValueNames === undefined
        ? {}
        : { host_value_names: hostValueNames }),
    },
    messages: [],
    tool_calls: [],
    artifacts: [],
    media: [],
    pagination: {
      limit: 50,
      returned_count: 0,
      oldest_position: null,
      has_more: false,
    },
  };
}

function makeStore() {
  return configureStore({
    reducer: { messages, conversations, instanceVariableValues },
  });
}

async function reopen(
  variables: Record<string, unknown>,
  hostValueNames: string[] | undefined,
) {
  mockFetchBundle.mockResolvedValue(bundleFor(variables, hostValueNames));
  const store = makeStore();
  await store.dispatch(
    loadConversation({
      conversationId: CONVERSATION_ID,
      expectMaterialized: true,
    }) as never,
  );
  return store;
}

const bubbleLines = (store: ReturnType<typeof makeStore>) =>
  buildVariableDisplayLines(
    selectOwnVariableValues(CONVERSATION_ID)(store.getState() as never),
  );

describe.each([
  ["the Scout interview", INTERVIEW_LAUNCH],
  ["the Conductor", CONDUCTOR_LAUNCH],
])("reopening a conversation %s launched", (_name, launch) => {
  it("shows NOTHING in the person's bubble — she typed none of it", async () => {
    const store = await reopen(launch, Object.keys(launch));
    expect(bubbleLines(store)).toHaveLength(0);
  });

  it("is the case that failed before the column existed", async () => {
    // The same row WITHOUT authorship — what every reopen looked like on HEAD.
    // Kept so the case above can never pass because hydration itself broke.
    const store = await reopen(launch, undefined);
    expect(bubbleLines(store).length).toBeGreaterThan(0);
  });

  it("still hydrates every value — authorship is not delivery", async () => {
    const store = await reopen(launch, Object.keys(launch));
    expect(
      store.getState().instanceVariableValues.byConversationId[CONVERSATION_ID]
        ?.userValues,
    ).toEqual(launch);
  });
});

describe("authorship is a claim about named values, never a blanket", () => {
  it("a value the person typed is still hers when the host wired the rest", async () => {
    const store = await reopen(
      { ...INTERVIEW_LAUNCH, topic: "pallets she typed herself" },
      Object.keys(INTERVIEW_LAUNCH),
    );
    expect(
      selectOwnVariableValues(CONVERSATION_ID)(store.getState() as never),
    ).toEqual({ topic: "pallets she typed herself" });
  });

  it("a name the row claims but does not hold is ignored, not invented", async () => {
    const store = await reopen({ topic: "hers" }, ["expert_goal", "topic"]);
    expect(
      store.getState().instanceVariableValues.byConversationId[CONVERSATION_ID]
        ?.hostValueNames,
    ).toEqual(["topic"]);
  });

  it("a row whose column holds junk reads as no claim, never as a throw", async () => {
    const store = await reopen(INTERVIEW_LAUNCH, "expert_goal" as never);
    expect(bubbleLines(store).length).toBeGreaterThan(0);
  });
});

/**
 * THE CENSUS. The cases above prove the reported reopen; this proves the CLASS.
 *
 * `setUserVariableValues` MEANS "the person just set these" and releases host
 * ownership of every name it writes. That is right for a typed edit and a lie
 * for a REPLAY — and every replay path in the system used it, so authorship was
 * erased at first-turn send, at rehydration, and again on every carry into a
 * new or restored conversation. A replay path added later with the user action
 * fails here rather than putting the host's words back in her mouth.
 */
describe("no replay path claims authorship it was not given", () => {
  const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..", "..");
  const read = (relative: string) =>
    readFileSync(join(REPO_ROOT, relative), "utf8");

  const REPLAY_SITES = [
    // The live first turn: stamps the exact payload being sent.
    "features/agents/redux/execution-system/thunks/execute-instance.thunk.ts",
    // The same stamp on the manual request builder.
    "features/agents/redux/execution-system/thunks/execute-manual-instance.thunk.ts",
    // The reopen: stamps `chat.conversation.variables` back in.
    "features/agents/redux/execution-system/thunks/load-conversation.thunk.ts",
    // The carries: into a new conversation, and back to the first submit.
    "features/agents/redux/execution-system/thunks/create-instance.thunk.ts",
  ];

  it.each(REPLAY_SITES)("%s replays through restoreVariableValues", (file) => {
    const source = read(file);
    expect(source).toContain("restoreVariableValues");
  });

  it.each(REPLAY_SITES.slice(0, 3))(
    "%s never replays through the user action",
    (file) => {
      // The CALL, not the word — these files explain in prose what they no
      // longer do, and a guard that cannot tell the two apart is noise.
      expect(read(file)).not.toMatch(/setUserVariableValues\s*\(/);
    },
  );

  it("the reopen reads the authorship column, not a guess", () => {
    const source = read(
      "features/agents/redux/execution-system/thunks/load-conversation.thunk.ts",
    );
    expect(source).toContain("parsePersistedHostValueNames(conv)");
  });

  it("the first turn writes the authorship it just recorded", () => {
    const source = read(
      "features/agents/redux/execution-system/thunks/execute-instance.thunk.ts",
    );
    expect(source).toContain("persistVariableAuthorship({ conversationId })");
  });
});
