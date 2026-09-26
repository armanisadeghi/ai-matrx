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
// The table below is PROVIDER-ADAPTER plumbing, not a model choice: it only
// translates a catalog model the Holder already chose into the value xAI's
// wire protocol expects. A Holder whose model is not an xAI realtime catalog
// model has no translation — the session REFUSES with a loud error naming the
// agent and the model, and files it to the console for admins. Breaking loudly
// is the point: a silent fallback to a default model is exactly the bypass this
// file exists to remove.

import { useEffect } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { fetchModelIdentityById } from "@/features/ai-models/redux/modelRegistrySlice";
import { applyAgentConfig, setError } from "./state/voiceAgentSlice";

/**
 * Catalog model name (`ai.model_definition.name`) → the `model` query value
 * xAI's realtime socket accepts. Add a row only when a new xAI realtime model
 * is added to the catalog; never to change which model a surface runs (that is
 * a rebind of the mandate's Holder).
 */
const XAI_REALTIME_WIRE_MODEL_BY_CATALOG_NAME: Readonly<Record<string, string>> =
  {
    // "xAI Realtime Voice" (ai.model_definition 218ac819…, api_class xai_realtime)
    "realtime-api": "grok-voice-latest",
  };

/** The wire model for a catalog model name, or null when it is not an xAI realtime model. */
export function xaiRealtimeWireModel(
  catalogModelName: string | null | undefined,
): string | null {
  if (!catalogModelName) return null;
  return XAI_REALTIME_WIRE_MODEL_BY_CATALOG_NAME[catalogModelName] ?? null;
}

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

/**
 * Pure(-ish) resolver: the Holder agent's model → wire model. Reads the agent
 * and the model catalog through the canonical Redux thunks. Never throws.
 */
export async function resolveHolderRealtimeModel(
  agentId: string,
  dispatch: ReturnType<typeof useAppDispatch>,
  getState: () => RootState,
): Promise<HolderRealtimeModel> {
  let agent = getState().agentDefinition.agents?.[agentId];
  if (!agent?.modelId) {
    await dispatch(fetchFullAgent(agentId))
      .unwrap()
      .catch(() => undefined);
    agent = getState().agentDefinition.agents?.[agentId];
  }
  const modelId = agent?.modelId ?? null;
  if (!modelId) {
    return {
      wireModel: null,
      error: `Voice agent ${agentId} has no model set, so no realtime model can be chosen. Set the agent's model to an xAI realtime model.`,
    };
  }
  const readName = (): string | undefined => {
    const reg = getState().modelRegistry;
    return reg.entities[modelId]?.name ?? reg.identityById[modelId]?.name;
  };
  if (!readName()) {
    await dispatch(fetchModelIdentityById(modelId))
      .unwrap()
      .catch(() => undefined);
  }
  // The thunk declines to start while ANOTHER caller's fetch of the same model
  // is in flight (its `condition`), and that decline returns immediately — so
  // a page that resolves the model from two places at once (the flashcard
  // tutor, 2026-09-26) read no name and refused a perfectly good model. Wait
  // for the in-flight read to settle instead of judging mid-flight.
  const inFlight = () =>
    getState().modelRegistry.identityStatusById[modelId] === "loading";
  for (let waited = 0; !readName() && inFlight() && waited < 8000; waited += 100) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const name = readName();
  const wireModel = xaiRealtimeWireModel(name);
  if (!wireModel) {
    return {
      wireModel: null,
      error: `Voice agent ${agentId} is set to model "${name ?? modelId}", which is not an xAI realtime voice model, so the session cannot open. Rebind the voice mandate to an agent whose model is xAI Realtime Voice.`,
    };
  }
  return { wireModel, error: null };
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
  const store = useAppStore();
  const { instanceId, agentId } = opts;

  useEffect(() => {
    if (!agentId) return undefined;
    let cancelled = false;
    void (async () => {
      const result = await resolveHolderRealtimeModel(
        agentId,
        dispatch,
        () => store.getState() as RootState,
      );
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
  }, [agentId, dispatch, instanceId, store]);
}
