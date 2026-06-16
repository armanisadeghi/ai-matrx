// features/voice-agent/hooks/useRealtimeAgentConfig.ts
//
// Resolves the authoritative realtime tool set for an agent and writes it into
// the voice slice (contract §5.4 / handoff §4c). Mounted ALONGSIDE
// `useVoiceAgentInstance`:
//
//   useVoiceAgentInstance  → seeds the slice synchronously (voice / instructions
//                            / builtin-tool fallback) and resolves voice +
//                            instructions from the agent row.
//   useRealtimeAgentConfig → POSTs `/ai/agents/{id}/realtime-tools`, then
//                            `applyAgentConfig({ instanceId, tools })` with the
//                            resolved `RealtimeToolSet` (server/client/builtin).
//
// Because `applyAgentConfig` applies only the fields it's given, this hook
// overwrites ONLY `tools` and never clobbers the voice/instructions the other
// hook derived. Order is irrelevant — the `session.update` WebSocket message is
// sent on user mic-click, by which time both have settled (mount-once + the
// seed-then-update pattern preserved).
//
// On error the slice keeps whatever tools it already holds (the synchronous
// seed) and the error is surfaced via the return value — NON-FATAL, the mic
// never bricks on a transient tool-resolve failure.
//
// Auth + base URL come from the existing authed Python client (`postJson`):
// Supabase JWT + `apiConfigSlice` base URL. The endpoint is not yet in the
// generated OpenAPI `paths`, so `callApi`'s `keyof paths` constraint can't type
// it; once `pnpm sync-types` regenerates, a typed `callApi` wrapper can replace
// `postJson` here.

import { useEffect, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { applyAgentConfig } from "../state/voiceAgentSlice";
import type { RealtimeToolSet, ResolvedRealtimeTool } from "../types";

const REALTIME_TOOLS_PATH = (agentId: string): string =>
  `/ai/agents/${encodeURIComponent(agentId)}/realtime-tools`;

/** Request body for `POST /ai/agents/{id}/realtime-tools` (contract §3). */
export interface RealtimeToolsRequest {
  surface: string;
  added_tool_ids: string[];
  is_version: boolean;
}

/** Response from `POST /ai/agents/{id}/realtime-tools` (contract §3). */
export interface RealtimeToolsResponse {
  agent_id: string;
  model_supports_tools: boolean;
  tools: ResolvedRealtimeTool[];
}

/**
 * Outcome of a single resolve attempt — the testable core of the hook.
 *
 * Both fields are ALWAYS present (not a discriminated union) because this repo
 * runs with `strictNullChecks: false`, under which TS cannot narrow a union by
 * its boolean `ok` tag — `result.error` after an `if (result.ok)` guard would
 * error. Flat fields side-step that: `ok=true` ⇒ `error=null`; `ok=false` ⇒
 * `tools=[]` (the caller keeps its seeded set).
 */
export interface ResolveRealtimeToolsResult {
  ok: boolean;
  tools: RealtimeToolSet;
  error: string | null;
}

/**
 * Pure(-ish) resolver: POST the resolve endpoint and normalise the result.
 * Extracted from the hook so it is unit-testable without a React renderer.
 * Never throws — a failure is returned as `{ ok: false, error }` so the hook
 * (and any other caller) keeps whatever tools it already holds.
 *
 * `post` is injected (defaults to the authed `postJson`, imported lazily so
 * this module — and the unit test — doesn't construct the Supabase client at
 * load) so tests can supply a fake without touching the network or auth.
 */
export async function resolveRealtimeTools(
  agentId: string,
  body: RealtimeToolsRequest,
  post?: <T, B>(path: string, b: B) => Promise<{ data: T }>,
): Promise<ResolveRealtimeToolsResult> {
  try {
    const send =
      post ?? (await import("@/lib/python-client")).postJson;
    const { data } = await send<RealtimeToolsResponse, RealtimeToolsRequest>(
      REALTIME_TOOLS_PATH(agentId),
      body,
    );
    return { ok: true, tools: data.tools ?? [], error: null };
  } catch (err) {
    return {
      ok: false,
      tools: [],
      error: err instanceof Error ? err.message : "tool resolution failed",
    };
  }
}

export interface UseRealtimeAgentConfigOpts {
  instanceId: string;
  /** When unset, nothing is resolved (e.g. the playground's ad-hoc config). */
  agentId?: string;
  /** Surface name for default-tool resolution (e.g. "matrx-user/chat-voice"). */
  surface: string;
  /** Per-conversation tool additions (tool UUIDs). Mirrors `addedToolIds` for text. */
  addedToolIds?: string[];
  /** Resolve against an agent VERSION row rather than the live agent. */
  isVersion?: boolean;
}

export interface UseRealtimeAgentConfigResult {
  /** True once the resolve attempt has settled (success OR error). */
  ready: boolean;
  /** Non-null when the resolve failed; the slice keeps its seeded tools. */
  error: string | null;
}

export function useRealtimeAgentConfig(
  opts: UseRealtimeAgentConfigOpts,
): UseRealtimeAgentConfigResult {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<UseRealtimeAgentConfigResult>({
    ready: false,
    error: null,
  });

  const { instanceId, agentId, surface, addedToolIds, isVersion } = opts;
  // Stable dep for the (possibly undefined) array.
  const addedToolIdsKey = JSON.stringify(addedToolIds ?? []);

  useEffect(() => {
    if (!agentId) {
      // Nothing to resolve (playground / ad-hoc). The slice keeps its seed.
      setState({ ready: true, error: null });
      return;
    }

    let cancelled = false;
    setState({ ready: false, error: null });

    void (async () => {
      const result = await resolveRealtimeTools(agentId, {
        surface,
        added_tool_ids: addedToolIds ?? [],
        is_version: isVersion ?? false,
      });
      if (cancelled) return;

      if (result.ok) {
        // Apply tools ONLY — voice/instructions are owned by useVoiceAgentInstance.
        dispatch(applyAgentConfig({ instanceId, tools: result.tools }));
        setState({ ready: true, error: null });
        return;
      }

      // Non-fatal: keep the seeded tools, surface the error. The mic still works.
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[useRealtimeAgentConfig] tool resolve failed for agent ${agentId}; ` +
            `keeping seeded tools. ${result.error}`,
        );
      }
      setState({ ready: true, error: result.error });
    })();

    return () => {
      cancelled = true;
    };
    // addedToolIdsKey captures the array contents; the rest are primitives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, instanceId, agentId, surface, addedToolIdsKey, isVersion]);

  return state;
}
