// features/voice-agent/services/realtimeToolService.ts
//
// Thin client for the realtime tool-execute endpoint (contract §4):
//
//   POST /ai/tools/execute  →  { call_id, ok, output }
//
// A SERVER-execution realtime tool call is round-tripped here: the browser is
// the voice orchestrator (the LLM runs client-side at xAI), so a registry / MCP
// / skill / data tool can't run in the audio loop — it executes server-side via
// the EXACT same `ToolExecutor.execute` path a turn-based agent uses, with the
// identical `cx_tool_call` record. Nothing about the tool changes; only the
// transport that triggered it.
//
// Auth + base URL come from the existing authed Python client, now via the
// contract-bound typed client (`apiPost` in `lib/api/typed-client.ts`): Supabase
// JWT bearer + `apiConfigSlice` base URL. We do NOT hand-roll fetch or auth.
// BOTH the request body AND the response are DERIVED from the generated contract
// (`ToolExecuteRequest` / `ToolExecuteResponse`), so a server rename lights up
// here as a compile error. `store` is optional on the schema (defaults to true
// server-side), so omitting it binds cleanly without changing the wire.
//
// HTTP contract: the endpoint returns 200 even on TOOL failure (so the model
// recovers gracefully) — `ok=false` carries the failure string in `output`. A
// real 5xx/4xx (infra / auth / 403 not-in-allowed-set) throws; the caller
// converts that into an explanatory `output` string so the voice turn never
// crashes.

import { apiPost } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";

/** Optional org/project/task/scope envelope (contract §4 `ToolContextEnvelope`). */
export interface RealtimeToolContextEnvelope {
  organization_id?: string;
  project_id?: string;
  task_id?: string;
  scope_ids?: string[];
}

/** Caller-facing request — the scope envelope is carried as one object here and
 *  FLATTENED onto the wire body below to match the Python `ScopedRequest`. */
export interface RealtimeToolExecuteRequest {
  agent_id: string;
  /** Voice session conversation id; null = ad-hoc (no persistence target). */
  conversation_id: string | null;
  tool_name: string;
  arguments: Record<string, unknown>;
  /** xAI call_id; the backend mints one if absent. */
  call_id: string | null;
  /** Surface name for allowed-set resolution (e.g. "matrx-user/chat-voice"). */
  surface: string;
  /**
   * Per-conversation tool additions (tool UUIDs). MUST mirror exactly what the
   * resolve hook (`useRealtimeAgentConfig`) declared at session start — the
   * Python endpoint re-resolves the allowed set from `added_tool_ids` +
   * `is_version`, so a mismatch 403s a legitimately-added tool. Threaded from
   * the SAME opts the surface passes to the resolve hook.
   */
  added_tool_ids: string[];
  /** Resolve against an agent VERSION row rather than the live agent. Mirrors resolve. */
  is_version: boolean;
  context?: RealtimeToolContextEnvelope | null;
}

/** Wire body — DERIVED from the generated contract. The Python endpoint extends
 *  `ScopedRequest`, so scope fields are TOP-LEVEL, not nested; a nested `context`
 *  object would be silently dropped. Deriving it from the schema (rather than
 *  hand-mirroring the flattened shape) means a server field rename fails to
 *  compile here. */
type RealtimeToolExecuteWireBody = components["schemas"]["ToolExecuteRequest"];

/**
 * Response from `POST /ai/tools/execute` — DERIVED from the generated OpenAPI
 * contract (`ToolExecuteResponse`), never hand-mirrored. `output` is ALWAYS a
 * string (the backend `json.dumps`es non-string tool output). A backend rename
 * changes the generated type and turns every reader here into a compile error.
 */
export type RealtimeToolExecuteResponse =
  components["schemas"]["ToolExecuteResponse"];

const EXECUTE_PATH = "/ai/tools/execute";

export interface RealtimeToolService {
  /**
   * Execute one SERVER tool. Returns `{ ok, output }` — `output` is always a
   * string. Never throws for a tool-level failure (those arrive as `ok=false`);
   * an infra/auth error is surfaced as `{ ok: false, output: "<reason>" }` so
   * the voice loop always has a string to feed back to the model.
   */
  execute: (
    req: RealtimeToolExecuteRequest,
  ) => Promise<{ ok: boolean; output: string }>;
}

export function createRealtimeToolService(): RealtimeToolService {
  return {
    async execute(req) {
      try {
        // Flatten the scope envelope onto the top level — Python's ScopedRequest
        // reads organization_id/project_id/task_id/scope_ids flat, not nested.
        const { context, ...rest } = req;
        const body: RealtimeToolExecuteWireBody = {
          ...rest,
          ...(context?.organization_id
            ? { organization_id: context.organization_id }
            : {}),
          ...(context?.project_id ? { project_id: context.project_id } : {}),
          ...(context?.task_id ? { task_id: context.task_id } : {}),
          ...(context?.scope_ids ? { scope_ids: context.scope_ids } : {}),
        };
        const { data } = await apiPost(EXECUTE_PATH, body);
        return { ok: data.ok, output: data.output };
      } catch (err) {
        // Infra / auth / 403 (tool not in the agent's resolved set). Convert to
        // a non-fatal string so the model can apologise and move on rather than
        // crash the turn. This is the LOUD-but-recoverable path.
        const message =
          err instanceof Error ? err.message : "tool service request failed";
        return { ok: false, output: `Tool service error: ${message}` };
      }
    },
  };
}

/** Process-wide singleton — the service holds no per-call state. */
export const realtimeToolService: RealtimeToolService =
  createRealtimeToolService();
