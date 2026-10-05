/**
 * A VOICE RUN NEVER FETCHES THE AGENT DEFINITION (PACKAGE-INDEPENDENCE P24v).
 *
 * The three voice resolvers — the Holder's realtime model, a mandate's agent
 * instructions, and the per-route voice instance — used to dispatch
 * `fetchFullAgent` (the full definition: messages, settings, tools) to build
 * the realtime session. aidream now reads the definition itself
 * (`POST /ai/agents/{id}/realtime-session`) and answers with the session's
 * wire model, voice, agent type and persona.
 *
 * Faked at the edge only: the definition fetch (a spy that must stay
 * uncalled), the HTTP client (`postJson`), the mandate resolver, and the
 * person's voice knob. Breaks this catches: any voice path reaching for the
 * definition again; the session config not reaching the voice slice.
 */

import * as React from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { renderHook, settle } from "../../host/__tests__/render-hook";
import voiceAgentReducer from "../state/voiceAgentSlice";

const AGENT_ID = "00000000-0000-4000-8000-000000000001";

const fetchFullAgent = jest.fn(() => () => ({
  unwrap: () => Promise.reject(new Error("the definition must not be fetched")),
}));
jest.mock("../../agents/redux/agent-definition/thunks", () => ({
  fetchFullAgent: (...args: unknown[]) => (fetchFullAgent as jest.Mock)(...args),
}));

const postJson = jest.fn(async (path: string, _body?: unknown) => {
  if (path === `/ai/agents/${AGENT_ID}/realtime-session`) {
    return {
      data: {
        agent_id: AGENT_ID,
        agent_type: "builtin",
        model_id: "218ac819-f530-4c7e-9dcd-3265c9e4fdb0",
        wire_model: "grok-voice-latest",
        voice_id: "ara",
        instructions: "You are the AI Matrx introduction agent.",
      },
    };
  }
  throw new Error(`unexpected POST ${path}`);
});
jest.mock("../../host/server/python-client", () => ({
  postJson: (path: string, body: unknown) => postJson(path, body),
}));

jest.mock("../../mandates/useMandate", () => ({
  useMandate: () => ({ mandate: { agentId: AGENT_ID }, loading: false, error: null }),
}));
jest.mock("../../host/prefs-react", () => ({ useSessionKnob: () => "" }));

function makeStore() {
  return configureStore({
    reducer: {
      voiceAgent: voiceAgentReducer,
      agentDefinition: (s = { agents: {} }) => s,
      modelRegistry: (
        s = { entities: {}, identityById: {}, identityStatusById: {} },
      ) => s,
    },
  });
}

function wrapperFor(store: ReturnType<typeof makeStore>) {
  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
}

beforeEach(() => {
  fetchFullAgent.mockClear();
  postJson.mockClear();
});

describe("a voice run never fetches the agent definition", () => {
  it("the voice instance + Holder model come from the server-read session", async () => {
    const { useVoiceAgentInstance } = await import("../hooks/useVoiceAgentInstance");
    const { useRealtimeHolderModel } = await import("../realtimeModel");
    const store = makeStore();
    const handle = await renderHook(
      () => {
        const instanceId = useVoiceAgentInstance({ preset: "intro", agentId: AGENT_ID });
        useRealtimeHolderModel({ instanceId, agentId: AGENT_ID });
        return instanceId;
      },
      { wrapper: wrapperFor(store) },
    );
    await settle(
      handle,
      (id) => {
        const i = store.getState().voiceAgent.instances[id];
        return !!i && (!!i.error || (!!i.instructions && !!i.realtimeModel));
      },
      "the session config or an error",
    ).catch(() => undefined);

    expect(fetchFullAgent).not.toHaveBeenCalled();
    const inst = store.getState().voiceAgent.instances[handle.current];
    expect(inst.instructions).toBe("You are the AI Matrx introduction agent.");
    expect(inst.realtimeModel).toBe("grok-voice-latest");
    expect(inst.voiceId).toBe("ara");
    expect(inst.error).toBeNull();
    expect(postJson).toHaveBeenCalledWith(
      `/ai/agents/${AGENT_ID}/realtime-session`,
      expect.objectContaining({ is_version: false }),
    );
    await handle.unmount();
  });

  it("a mandate surface's instructions come from the server-read session", async () => {
    const { useMandateAgentInstructions } = await import("../agentInstructions");
    const store = makeStore();
    const handle = await renderHook(
      () => useMandateAgentInstructions("voice.intro"),
      { wrapper: wrapperFor(store) },
    );
    await settle(handle, (v) => !v.loading, "instructions resolved").catch(() => undefined);

    expect(fetchFullAgent).not.toHaveBeenCalled();
    expect(handle.current.agentId).toBe(AGENT_ID);
    expect(handle.current.instructions).toBe("You are the AI Matrx introduction agent.");
    expect(handle.current.error).toBeNull();
    await handle.unmount();
  });
});
