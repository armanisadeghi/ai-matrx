import { supabase } from "@/utils/supabase/client";
import { consumeStream } from "@/lib/api/stream-parser";
import type { StreamCallbacks } from "@/lib/api/stream-parser";
import type {
  StreamEventHandlers,
  ToolStreamEvent,
  FinalPayload,
  ToolDefinition,
  TestContext,
} from "@/features/tool-call-visualization/testing/types";

/**
 * Execute a tool test via the Python backend streaming endpoint.
 * Sends the full TestContext (conversation_id + optional scope) in the request body.
 * Uses the universal `consumeStream` callback API with V2 event types.
 */
export async function executeToolTest(
  baseUrl: string,
  authToken: string,
  toolName: string,
  args: Record<string, unknown>,
  handlers: StreamEventHandlers,
  abortSignal?: AbortSignal,
  context?: TestContext,
): Promise<void> {
  const body: Record<string, unknown> = {
    tool_name: toolName,
    arguments: args,
  };

  if (context) {
    body.conversation_id = context.conversation_id;
    if (context.organization_id) body.organization_id = context.organization_id;
    if (context.project_id) body.project_id = context.project_id;
    if (context.task_id) body.task_id = context.task_id;
  }

  const response = await fetch(`${baseUrl}/tools/test/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(
      errorBody?.detail ?? `HTTP ${response.status}: ${response.statusText}`,
    );
  }

  const callbacks: StreamCallbacks = {
    onEvent(event) {
      handlers.onRawEvent?.(event);
    },

    onPhase(data) {
      handlers.onPhase?.(data);
      if (data.phase === "complete") {
        handlers.onFinalResult?.({ status: "complete" } as FinalPayload);
      }
    },

    onToolEvent(data) {
      handlers.onToolEvent?.(data as unknown as ToolStreamEvent);
    },

    onCompletion(data) {
      handlers.onCompletion?.(data);
      handlers.onFinalResult?.(data as unknown as FinalPayload);
    },

    onData(data) {
      handlers.onFinalResult?.(data as unknown as FinalPayload);
    },

    onError(data) {
      handlers.onError?.(data);
    },

    onHeartbeat() {
      handlers.onHeartbeat?.();
    },

    onEnd(data) {
      handlers.onEnd?.(data);
    },
  };

  await consumeStream(response, callbacks, abortSignal);
}

/**
 * Fetch all active tools directly from the Supabase `tools` table.
 * This is the single source of truth — no Python backend needed.
 */
export async function fetchToolsFromDatabase(): Promise<ToolDefinition[]> {
  const { data, error } = await supabase
    .from("tl_def")
    .select("*")
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load tools: ${error.message}`);
  }

  return (data ?? []) as unknown as ToolDefinition[];
}
