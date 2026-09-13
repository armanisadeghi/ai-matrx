// features/ai-models/preferredAuthoringModel.ts
//
// `agents.model_prefs.agent_authoring_default_model` — "the model that powers
// the agent builder when you create or revise an agent" — resolved through
// THE settings ladder (organization → user → device, nearest wins;
// `lib/scoped-config/sessionKnob.ts`).
//
// Null/"" means "the builder's own model" (the Holder bound to the
// agent-authoring mandate answers with the model its version declares).
//
// WHERE IT IS HONOURED:
//   · here — the interactive Agent Generator's run (`AgentGenerator.tsx`) sends
//     it as the run's explicit `llmOverrides.model`;
//   · aidream — the Agent Factory's structure-builder run
//     (`aidream/services/agent_factory/builder.py::_run_meta_agent`) reads the
//     same knob through `scoped_knob_raw` for the ambient principal, so the
//     Agent Service / MCP `agent_author` path honours it too.

import { resolveSessionKnob } from "@/lib/scoped-config/sessionKnob";

export const AGENT_AUTHORING_MODEL_KNOB = "agents.model_prefs.agent_authoring_default_model";

/**
 * The person's preferred builder model id, or null when they (and their
 * organization) left it to the builder. A read failure is announced and
 * answers null — building never blocks on a preference.
 */
export async function resolvePreferredAuthoringModel(): Promise<string | null> {
  try {
    const value = await resolveSessionKnob(AGENT_AUTHORING_MODEL_KNOB);
    return typeof value === "string" && value.trim() !== "" ? value : null;
  } catch (error) {
    console.error(
      `[preferredAuthoringModel] ${AGENT_AUTHORING_MODEL_KNOB} could not be resolved — the builder's own model runs:`,
      error,
    );
    return null;
  }
}
