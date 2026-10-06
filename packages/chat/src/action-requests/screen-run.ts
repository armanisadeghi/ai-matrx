// packages/chat/src/action-requests/screen-run.ts — THE SCREEN-RUN DOOR'S CLIENT.
//
// Any module's screen runs one registered tool as the signed-in person, with no
// agent and no conversation: aidream's `POST /tools/screen-run`. Only a tool whose
// definition declares `screen_callable` runs (403 otherwise). It is ACTUAL WORK —
// data reads still go direct to Supabase; this door is for what only a tool does.
//
// A paid call above the organization's ask threshold answers `needs_approval`
// with the SAME approve_spend ask an agent's call mints (`approval.render` is the
// form). `useToolAction` shows that form in place and calls again with
// `spend_approval_id`.
//
// The path is `ENDPOINTS.tools.screenRun` from @ai-matrx/agents — the one endpoint
// list. `screen-run.parity.test.ts` pins it to the server route.

import { ENDPOINTS } from "@ai-matrx/agents/matrx";
import { requestRaw } from "../host/server/python-client";
import type { ActionRequestRender } from "./render-types";

/** The `seo.tool_envelope` kind every envelope tool returns as its output. */
export interface ToolEnvelope<TData = unknown> {
  __kind: "seo.tool_envelope";
  status: "ok" | "partial" | "needs_approval" | "processing" | "unavailable";
  data: TData | null;
  cost: {
    class: "free" | "paid";
    estimate_usd?: number | null;
    charged_usd?: number | null;
    reused?: boolean;
    reused_run_ids?: string[];
  };
  evidence?: { run_id: string; observed_at?: string | null; operation: string }[];
  fallbacks?: { from: string; to: string; reason: string }[];
  notices?: string[];
  approval?: {
    action_request_id: string;
    estimate_usd: number | null;
    ceiling_cap_usd?: number | null;
    what_it_buys: string;
  } | null;
  recovery?: Record<string, unknown> | null;
}

export function isToolEnvelope<TData = unknown>(value: unknown): value is ToolEnvelope<TData> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __kind?: unknown }).__kind === "seo.tool_envelope"
  );
}

/** The ask a screen shows in place: the same record and form as an agent's. */
export interface ScreenRunApproval {
  action_request_id: string;
  organization_id: string | null;
  estimate_usd: number | null;
  ceiling_cap_usd: number | null;
  what_it_buys: string | null;
  expires_at: string | null;
  render: ActionRequestRender | null;
}

export interface ScreenRunError {
  error_type: string;
  message: string;
  suggested_action: string | null;
}

export interface ScreenRunResponse<TOutput = unknown> {
  call_id: string;
  tool_name: string;
  status: "ok" | "needs_approval" | "error";
  output: TOutput | null;
  error: ScreenRunError | null;
  approval: ScreenRunApproval | null;
}

export interface ScreenRunRequest {
  tool_name: string;
  arguments: Record<string, unknown>;
  spend_approval_id?: string;
}

/**
 * One call through the door. Tool outcomes (ok / needs_approval / error) are all
 * HTTP 200; a refusal of the call itself (403 undeclared tool, 404 unknown,
 * 401 signed out) comes back as `status: "error"` carrying the server's words,
 * never thrown — a screen renders it like any other failure.
 */
export async function runScreenTool<TOutput = unknown>(
  request: ScreenRunRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<ScreenRunResponse<TOutput>> {
  const response = await requestRaw(
    ENDPOINTS.tools.screenRun,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    { allowHttpError: true, expectedErrorStatuses: [403, 404], signal: opts.signal },
  );
  const body = (await response.json().catch(() => null)) as
    | ScreenRunResponse<TOutput>
    | RefusalBody
    | null;
  if (response.ok && body && "status" in body) return body;
  // aidream's error middleware answers a refusal as `{error, message}` at the
  // top level; FastAPI's raw shape nests it under `detail`. Read either.
  const refusal = body as RefusalBody | null;
  const nested = typeof refusal?.detail === "object" ? refusal.detail : null;
  return {
    call_id: "",
    tool_name: request.tool_name,
    status: "error",
    output: null,
    approval: null,
    error: {
      error_type: refusal?.error || nested?.error || `http_${response.status}`,
      message:
        refusal?.message ||
        nested?.message ||
        (typeof refusal?.detail === "string" ? refusal.detail : null) ||
        `The tool did not run (HTTP ${response.status}).`,
      suggested_action: null,
    },
  };
}

type RefusalBody = {
  error?: string;
  message?: string;
  detail?: { error?: string; message?: string } | string;
};
