// TASK-003 launch gate: assertModelInteractionLaunchable must refuse
// extraction models on EVERY launch path — it is sync, Redux-only, and
// independent of surfaceName (the pickRuntime check alone was unreachable
// from /chat, the runner, cx-chat bootstrap, and shortcut launches).

import type { RootState } from "@/lib/redux/store";
import { assertModelInteractionLaunchable } from "../runtime-resolver";

const AGENT_ID = "agent-1";
const MODEL_ID = "model-1";

function buildState(opts: {
  modelCapabilities?: unknown;
  modelInRegistry?: boolean;
  agentLoaded?: boolean;
}): () => RootState {
  const state = {
    agentDefinition: {
      agents: opts.agentLoaded === false
        ? {}
        : { [AGENT_ID]: { modelId: MODEL_ID } },
    },
    modelRegistry: {
      entities:
        opts.modelInRegistry === false
          ? {}
          : {
              [MODEL_ID]: {
                id: MODEL_ID,
                name: "gliner2-base",
                capabilities: opts.modelCapabilities,
              },
            },
    },
  } as unknown as RootState;
  return () => state;
}

const EXTRACTION_CAPS = {
  input: ["text"],
  output: ["entities"],
  features: ["ner"],
  interaction: "extraction",
};

describe("assertModelInteractionLaunchable", () => {
  it("refuses an extraction model, naming the model", () => {
    const result = assertModelInteractionLaunchable(
      buildState({ modelCapabilities: EXTRACTION_CAPS }),
      AGENT_ID,
    );
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("gliner2-base");
      expect(result.error).toContain("extraction model");
    }
  });

  it("passes a turn-based model", () => {
    const result = assertModelInteractionLaunchable(
      buildState({
        modelCapabilities: { input: ["text"], output: ["text"], features: [], interaction: "turn" },
      }),
      AGENT_ID,
    );
    expect(result).toEqual({ ok: true });
  });

  it("passes a single-shot (image/video gen) model — deliberate turn-based routing", () => {
    const result = assertModelInteractionLaunchable(
      buildState({
        modelCapabilities: { input: ["text"], output: ["image"], features: [], interaction: "single" },
      }),
      AGENT_ID,
    );
    expect(result).toEqual({ ok: true });
  });

  it("passes when the model is not in the registry (cold-registry gap — carried note)", () => {
    const result = assertModelInteractionLaunchable(
      buildState({ modelInRegistry: false }),
      AGENT_ID,
    );
    expect(result).toEqual({ ok: true });
  });

  it("passes when the agent is not hydrated yet", () => {
    const result = assertModelInteractionLaunchable(
      buildState({ agentLoaded: false }),
      AGENT_ID,
    );
    expect(result).toEqual({ ok: true });
  });
});
