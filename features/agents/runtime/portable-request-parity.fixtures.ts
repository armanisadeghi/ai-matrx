import type { AgentProjectionEvent } from "@ai-matrx/agents/projection/request";

export const PORTABLE_PARITY_REQUEST_ID = "req_portable_parity";
export const PORTABLE_PARITY_CONVERSATION_ID =
  "11111111-1111-4111-8111-111111111111";

/**
 * One fixture consumed by both the package projector and Matrix's real stream
 * processor. Keep it free of host effects: this sequence proves the portable
 * deterministic core, while separate Matrix tests own persistence and UI.
 */
export const PORTABLE_PARITY_SETTLED_EVENTS = [
  {
    event: "phase",
    stream_seq: 1,
    data: { phase: "processing" },
  },
  {
    event: "init",
    stream_seq: 2,
    data: {
      operation: "llm_request",
      operation_id: "op-llm",
      parent_operation_id: null,
      metadata: { provider: "test" },
    },
  },
  {
    event: "reasoning",
    stream_seq: 3,
    data: { state: "started" },
  },
  {
    event: "reasoning_chunk",
    stream_seq: 4,
    data: { text: "Inspect the request." },
  },
  {
    event: "reasoning",
    stream_seq: 5,
    data: { state: "stopped" },
  },
  {
    event: "record_reserved",
    stream_seq: 6,
    data: {
      db_project: "main",
      table: "message",
      record_id: "22222222-2222-4222-8222-222222222222",
      parent_refs: {
        conversation_id: PORTABLE_PARITY_CONVERSATION_ID,
        user_request_id: "33333333-3333-4333-8333-333333333333",
      },
      metadata: { role: "assistant", position: 1 },
    },
  },
  {
    event: "chunk",
    stream_seq: 7,
    data: { text: "Portable answer." },
  },
  {
    event: "completion",
    stream_seq: 8,
    data: {
      operation: "llm_request",
      operation_id: "op-llm",
      status: "completed",
      result: { finish_reason: "stop" },
    },
  },
  {
    event: "render_block",
    stream_seq: 9,
    data: {
      blockId: "server-block-1",
      blockIndex: 1,
      type: "code",
      status: "complete",
      content: "const proven = true;",
      data: null,
      metadata: null,
    },
  },
  {
    event: "completion",
    stream_seq: 10,
    data: {
      operation: "user_request",
      operation_id: "op-user",
      status: "completed",
      result: {},
    },
  },
  { event: "end", stream_seq: 11, data: {} },
] as const satisfies readonly AgentProjectionEvent[];

/** Duplicate frame 6 must be ignored by both consumers. */
export const PORTABLE_PARITY_REPLAY_EVENTS = [
  ...PORTABLE_PARITY_SETTLED_EVENTS.slice(0, 7),
  PORTABLE_PARITY_SETTLED_EVENTS[6],
  ...PORTABLE_PARITY_SETTLED_EVENTS.slice(7),
] as const satisfies readonly AgentProjectionEvent[];

/**
 * A normal server-side tool start is not necessarily a client suspension.
 * The public 0.2.1 summary currently says awaiting-tools; Matrix deliberately
 * stays streaming/complete unless a delegated client call is pending.
 */
export const PORTABLE_PARITY_SERVER_TOOL_EVENTS = [
  {
    event: "record_reserved",
    stream_seq: 1,
    data: {
      db_project: "main",
      table: "message",
      record_id: "44444444-4444-4444-8444-444444444444",
      parent_refs: {
        conversation_id: PORTABLE_PARITY_CONVERSATION_ID,
        user_request_id: "55555555-5555-4555-8555-555555555555",
      },
      metadata: { role: "assistant", position: 1 },
    },
  },
  {
    event: "tool_event",
    stream_seq: 2,
    data: {
      event: "tool_started",
      call_id: "call-server",
      tool_name: "server_search",
      message: "Searching",
      data: { query: "parity" },
    },
  },
] as const satisfies readonly AgentProjectionEvent[];
