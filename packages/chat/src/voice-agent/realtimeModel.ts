// features/voice-agent/realtimeModel.ts
//
// WHICH REALTIME MODEL A VOICE SESSION OPENS IS THE MANDATE'S DECISION.
//
// Until 2026-09-25 the session socket was hard-coded to
// `wss://api.x.ai/v1/realtime?model=grok-voice-latest` — the model a voice
// session ran was chosen by a constant in this repo, so rebinding a voice
// mandate to another Holder changed the persona but never the model
// (BYPASS-CENSUS frontend-features, row 1). Now:
//
//   mandate (voice.intro / voice.communicator / transcript_studio.scribe_live /
//   education.voice_tutor) → resolved Holder agent → its `modelId` →
//   the catalog model row → this adapter's wire name → the socket URL
//   (endpoint from the token broker credential, never a constant).
//
// Since P24v (2026-10-05) the translation lives on the server: aidream reads
// the Holder's definition and catalog model and answers with the wire model
// (`POST /ai/agents/{id}/realtime-session`, `realtimeSession.ts`). A Holder
// whose model is not an xAI realtime catalog model is REFUSED there with a
// loud error naming the agent and the model; this hook files it to the console
// and the session. Breaking loudly is the point: a silent fallback to a default
// model is exactly the bypass this file exists to remove.

import { useEffect } from "react";
import { useAppDispatch } from "../store/hooks";
import { applyAgentConfig, setError } from "./state/voiceAgentSlice";
import { fetchRealtimeSessionConfig } from "./realtimeSession";

/** The socket URL: broker-issued endpoint + the Holder's wire model. */
export function xaiRealtimeSocketUrl(endpoint: string, wireModel: string): string {
  const sep = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${sep}model=${encodeURIComponent(wireModel)}`;
}

export interface HolderRealtimeModel {
  /** Wire model when resolvable, else null with `error` set. */
  wireModel: string | null;
  error: string | null;
}

/** The Holder agent's wire model, read on the server. Never throws. */
export async function resolveHolderRealtimeModel(
  agentId: string,
): Promise<HolderRealtimeModel> {
  const { config, error } = await fetchRealtimeSessionConfig(agentId);
  if (config?.wire_model) return { wireModel: config.wire_model, error: null };
  return {
    wireModel: null,
    error: error ?? `Voice agent ${agentId}: no realtime model was resolved.`,
  };
}

/**
 * Resolves the realtime model from the mandate-resolved Holder agent and writes
 * it to the voice slice. On failure: loud console error + a visible session
 * error; `useXaiVoiceSession.start()` refuses while no model is resolved.
 */
export function useRealtimeHolderModel(opts: {
  instanceId: string;
  agentId: string | null | undefined;
}): void {
  const dispatch = useAppDispatch();
  const { instanceId, agentId } = opts;

  useEffect(() => {
    if (!agentId) return undefined;
    let cancelled = false;
    void (async () => {
      const result = await resolveHolderRealtimeModel(agentId);
      if (cancelled) return;
      if (result.wireModel) {
        dispatch(applyAgentConfig({ instanceId, realtimeModel: result.wireModel }));
        return;
      }
      console.error(`[voice-agent] realtime model unresolved: ${result.error}`);
      dispatch(
        setError({
          instanceId,
          error: { code: "realtime-model-unresolved", message: result.error ?? "" },
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, dispatch, instanceId]);
}
