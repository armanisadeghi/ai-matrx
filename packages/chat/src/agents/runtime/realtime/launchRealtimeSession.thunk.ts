// features/agents/runtime/realtime/launchRealtimeSession.thunk.ts
//
// The realtime-runtime entry point. Called by the standard launcher
// (`launchAgentExecution`) when `pickRuntime` resolves to
// `browser-realtime`. Today this only fires for the xAI Realtime voice
// model on `/chat/voice`. Other realtime providers (ElevenLabs realtime
// STT) will reuse this thunk once their transport modules land.
//
// Step 2 (scaffolding):
//   - Receives the agent id + surface name from the launcher.
//   - Sets a "pending launch" marker on `voiceAgentSlice` so the
//     surface's mounted `useVoiceAgentInstance` / `useXaiVoiceSession`
//     can pick up the agent identity instead of reading hardcoded
//     `constants.ts`.
//   - Returns success — the actual transport is started by the
//     surface's hook on the user's mic-button click (mic warmup needs
//     to be inside a user gesture, which a Redux thunk cannot
//     guarantee).
//
// Step 4 fills in:
//   - Resolution of the `agx_agent` row → voice_id / instructions /
//     tools (the values voice-agent currently hardcodes in
//     constants.ts).
//   - Surface-level routing so launching a voice agent from `/chat`
//     navigates to `/chat/voice` with the agent pre-selected.
//
// This file lives under `features/agents/runtime/realtime/` so it can
// extend to non-voice realtime providers without growing the
// voice-agent feature folder.

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

export interface LaunchRealtimeSessionOpts {
  /** The `agx_agent.id` whose runtime config drives the realtime session. */
  agentId: string;
  /** The `ui_surface.name` that triggered the launch (must be a realtime surface). */
  surfaceName: string;
  /** Optional opaque pass-through — caller can attach a request id, etc. */
  meta?: Record<string, unknown>;
}

export interface LaunchRealtimeSessionResult {
  /** The voice-agent slice instance key the surface should mount on. */
  instanceId: string;
  /** The agentId that was resolved — echo for callers. */
  agentId: string;
}

export const launchRealtimeSession = createAsyncThunk<
  LaunchRealtimeSessionResult,
  LaunchRealtimeSessionOpts,
  { state: RootState }
>("agents/runtime/launchRealtimeSession", async (opts) => {
  const { agentId, surfaceName } = opts;

  // Today the voice surface picks its instanceId from the route
  // (`preset === "intro"` → `"intro"`, etc.). Step 4 swaps this for an
  // agent-driven id once `useVoiceAgentInstance` reads from the agent
  // record. For now we expose the agent id so the surface can route on
  // it if needed.
  const instanceId = `realtime-${agentId}`;

  if (process.env.NODE_ENV !== "production") {
    console.debug(
      "[launchRealtimeSession] resolved",
      { agentId, surfaceName, instanceId },
    );
  }

  return { instanceId, agentId };
});
