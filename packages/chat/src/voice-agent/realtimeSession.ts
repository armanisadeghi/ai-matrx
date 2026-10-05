// features/voice-agent/realtimeSession.ts
//
// THE ONE PLACE A VOICE SESSION LEARNS ITS AGENT (PACKAGE-INDEPENDENCE P24v).
//
// aidream reads the agent definition itself — `POST /ai/agents/{id}/realtime-session`
// — and answers with only what the realtime session needs: the xAI wire model
// (from the Holder's catalog model), the persona (its system message), its own
// voice and its agent type. The browser never fetches the definition for a
// voice run (`check:agent-run-tier`, `a-voice-run-never-fetches-the-definition`).
//
// xAI's ephemeral secret cannot carry session config, so the socket holder (the
// browser) still sends the persona in `session.update`; the credential itself
// stays with the token broker (`transport/tokenManager.ts`).
//
// Refusals are the server's: a Holder on a non-realtime model or with no system
// message answers 422 with a message naming the agent and the model. That
// message is returned as `error` — never replaced by a default model or persona.

import { useEffect, useState } from "react";

export interface RealtimeSessionConfig {
  agent_id: string;
  agent_type: string | null;
  model_id: string;
  wire_model: string;
  voice_id: string | null;
  instructions: string;
}

export interface RealtimeSessionResult {
  config: RealtimeSessionConfig | null;
  error: string | null;
}

const REALTIME_SESSION_PATH = (agentId: string): string =>
  `/ai/agents/${encodeURIComponent(agentId)}/realtime-session`;

type Post = <T, B>(path: string, body: B) => Promise<{ data: T }>;

/** One request per agent row in flight/settled; a failure is never cached. */
const cache = new Map<string, Promise<RealtimeSessionResult>>();

function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { userMessage?: unknown; detail?: unknown; message?: unknown };
    const detail = e.detail as { message?: unknown } | string | undefined;
    if (detail && typeof detail === "object" && typeof detail.message === "string")
      return detail.message;
    if (typeof e.userMessage === "string" && e.userMessage) return e.userMessage;
    if (typeof detail === "string" && detail) return detail;
    if (typeof e.message === "string" && e.message) return e.message;
  }
  return "The voice session's agent could not be resolved.";
}

/** The realtime session config for an agent (or version row). Never throws. */
export function fetchRealtimeSessionConfig(
  agentId: string,
  opts: { isVersion?: boolean; post?: Post } = {},
): Promise<RealtimeSessionResult> {
  const isVersion = opts.isVersion ?? false;
  const key = `${agentId}:${isVersion ? "v" : "a"}`;
  const hit = opts.post ? undefined : cache.get(key);
  if (hit) return hit;
  const pending = (async (): Promise<RealtimeSessionResult> => {
    try {
      const send = opts.post ?? (await import("../host/server/python-client")).postJson;
      const { data } = await send<RealtimeSessionConfig, { is_version: boolean }>(
        REALTIME_SESSION_PATH(agentId),
        { is_version: isVersion },
      );
      return { config: data, error: null };
    } catch (err) {
      cache.delete(key);
      return { config: null, error: errorMessage(err) };
    }
  })();
  if (!opts.post) cache.set(key, pending);
  return pending;
}

/** Test seam: forget every cached session config. */
export function clearRealtimeSessionCache(): void {
  cache.clear();
}

/** The session config for `agentId` as React state (null while loading). */
export function useRealtimeSessionConfig(
  agentId: string | null | undefined,
): RealtimeSessionResult & { loading: boolean } {
  const [state, setState] = useState<{ agentId: string | null } & RealtimeSessionResult>({
    agentId: null,
    config: null,
    error: null,
  });
  useEffect(() => {
    if (!agentId) return undefined;
    let cancelled = false;
    void fetchRealtimeSessionConfig(agentId).then((r) => {
      if (!cancelled) setState({ agentId, ...r });
    });
    return () => {
      cancelled = true;
    };
  }, [agentId]);
  const settled = !!agentId && state.agentId === agentId;
  return {
    config: settled ? state.config : null,
    error: settled ? state.error : null,
    loading: !!agentId && !settled,
  };
}
