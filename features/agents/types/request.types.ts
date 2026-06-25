/**
 * Request Execution Types
 *
 * Tracks everything that happens after an API call fires:
 * stream status, accumulated response, tool lifecycle, content blocks,
 * status updates, and the sub-agent conversation tree.
 *
 * Keyed by requestId (not instanceId) because a single instance can
 * spawn multiple requests via sub-agent conversations.
 *
 * ARCHITECTURE: Every semantically distinct event type from the server gets
 * its own dedicated field on ActiveRequest. The only catch-all is dataPayloads,
 * which holds genuinely unstructured data events. Components subscribe to
 * individual fields — never scan an untyped array.
 */

import type {
  Phase,
  Operation,
  InitCompletionStatus,
  PhasePayload,
  InitPayload,
  CompletionPayload,
  RenderBlockPayload,
  WarningPayload,
  InfoPayload,
  TypedDataPayload,
  UntypedDataPayload,
  MessagePart,
  ToolEventPayload,
  ErrorPayload,
  EndPayload,
  BrokerPayload,
  HeartbeatPayload,
  RecordReservedPayload,
  RecordUpdatePayload,
  ResourceChangedPayload,
  StructuredOutputPayload,
  ProviderRetryPayload,
} from "@/types/python-generated/stream-events";

// =============================================================================
// Client-Side Metrics
//
// Measurements taken by the client, independent of the server's own
// timing/usage reports. Computed once after stream completion — never
// during the stream so they add zero latency overhead.
// =============================================================================

export interface ClientMetrics {
  /** When dispatch(executeInstance) fired. The true "submit" moment. */
  submitAt: number;

  /**
   * When the X-Conversation-ID header arrived (first server ACK).
   *   internalLatency = conversationIdAt - submitAt
   */
  conversationIdAt: number | null;

  /**
   * When the first chunk arrived from the stream.
   *   ttft = firstChunkAt - submitAt
   */
  firstChunkAt: number | null;

  /**
   * When the stream loop exited (end event or error).
   *   streamDuration = streamEndAt - firstChunkAt
   */
  streamEndAt: number | null;

  /**
   * When the final `updateMessageRecord` for the assistant message landed
   * (Redux + React render settled).
   *   renderDelay = renderCompleteAt - streamEndAt
   */
  renderCompleteAt: number | null;

  internalLatencyMs: number | null;
  ttftMs: number | null;
  streamDurationMs: number | null;
  renderDelayMs: number | null;
  totalClientDurationMs: number | null;

  totalEvents: number;
  chunkEvents: number;
  reasoningChunkEvents: number;
  phaseEvents: number;
  initEvents: number;
  completionEvents: number;
  dataEvents: number;
  toolEvents: number;
  renderBlockEvents: number;
  warningEvents: number;
  infoEvents: number;
  recordReservedEvents: number;
  recordUpdateEvents: number;
  resourceChangedEvents: number;
  providerRetryEvents: number;
  otherEvents: number;
  accumulatedTextBytes: number;
  totalPayloadBytes: number;
}

// =============================================================================
// Tool Lifecycle
//
// Full state machine per tool call. The reducer handles transitions:
//   started → progress/step → result_preview → completed/error
//
// Keyed by callId for O(1) lookup. Components subscribe to individual
// entries — no array scanning needed.
// =============================================================================

export type ToolLifecycleStatus =
  | "started"
  | "progress"
  | "step"
  | "result_preview"
  | "completed"
  | "error";

export interface ToolLifecycleEntry {
  callId: string;
  /**
   * Canonical tool name (e.g. "matrx-extend:take_screenshot"). This is what
   * renderers and registries are keyed by — never use `displayName` for
   * lookup. Persisted from `cx_tool_call.tool_name`.
   */
  toolName: string;
  /**
   * What the AI actually called the tool (e.g. "forms:fill_form" if loaded via
   * a bundle alias). Falls back to canonical when the source row pre-dates the
   * `tool_name_as_called` column or the value isn't available. UI surfaces
   * should prefer `displayName` for the primary label and show `toolName` in a
   * tooltip / detail when the two differ.
   */
  displayName: string;
  status: ToolLifecycleStatus;
  arguments: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
  latestMessage: string | null;
  latestData: Record<string, unknown> | null;
  result: unknown | null;
  resultPreview: string | null;
  errorType: string | null;
  errorMessage: string | null;
  isDelegated: boolean;

  /**
   * Raw event log for this tool call, appended in server emission order.
   * Renderers that need step-by-step data (e.g. Brave search step_data tiles)
   * consume this directly.
   */
  events: ToolEventPayload[];
}

// =============================================================================
// Active Request
// =============================================================================

export type RequestStatus =
  | "pending"
  | "connecting"
  | "streaming"
  | "awaiting-tools"
  | "complete"
  | "error"
  | "timeout"
  | "cancelled";

export interface ActiveRequest {
  requestId: string;
  conversationId: string;

  /** If this is a sub-agent request, the parent's conversationId */
  parentConversationId: string | null;

  status: RequestStatus;

  // ── Streaming Text ──────────────────────────────────────────
  /** How many raw chunk events arrived (for metrics/status checks) */
  chunkCount: number;

  /**
   * User-applied override for the rendered text. When non-null, this
   * supersedes the server-derived text built from `renderBlocks` for the
   * lifetime of this active-request entry — i.e. for as long as the
   * conversation instance is mounted. Used by inline edits (inline
   * decision resolves, code-block in-place edits, table cell edits,
   * inline broker updates) so the on-screen content stays in sync with
   * what we already persisted via `cx_message_edit`. Cleared on a new
   * request and explicitly reset by revert flows.
   */
  editedText: string | null;

  // ── Reasoning Chunks ────────────────────────────────────────
  /** Same pattern as textChunks — O(1) push, joined lazily in selectors */
  reasoningChunks: string[];
  accumulatedReasoning: string;
  /** Tracks whether we're inside a reasoning-streaming run (mirrors isTextStreaming) */
  isReasoningStreaming: boolean;
  reasoningRunChunkStart: number;

  // ── Phase (state machine transitions) ────────────────────────
  /** The most recent phase — overwrites on each phase event */
  currentPhase: Phase | null;
  /** Full phase history for debugging / timeline display */
  phaseHistory: Phase[];

  // ── Operation Tracking (init/completion pairs) ──────────────
  /** Active operations keyed by operation_id */
  activeOperations: Record<string, OperationEntry>;
  /** Completed operations keyed by operation_id */
  completedOperations: Record<string, CompletedOperationEntry>;

  // ── Render Blocks ───────────────────────────────────────────
  /** Keyed by blockId for O(1) lookup. Each block upserted in place. */
  renderBlocks: Record<string, RenderBlockPayload>;
  /** Ordered list of blockIds preserving server emission order */
  renderBlockOrder: string[];

  // ── Tool Lifecycle ───────────────────────────────────────────
  /** Delegations that need client action (unchanged from before) */
  pendingToolCalls: PendingToolCall[];
  /** Full lifecycle per tool call — started → progress → completed/error */
  toolLifecycle: Record<string, ToolLifecycleEntry>;

  // ── Completion ───────────────────────────────────────────────
  /**
   * The user_request completion — null until the completion event
   * with operation="user_request" fires. This is the primary
   * "is this request done?" signal.
   */
  completion: CompletionPayload | null;

  // ── Errors & Warnings ────────────────────────────────────────
  /**
   * The raw error payload from the backend, captured verbatim. Mirrors
   * `stream_events.ErrorPayload` exactly. Consumers MUST read both
   * `error.message` (technical / system message — always present) and
   * `error.user_message` (optional human-friendly explanation) and decide
   * which to display. The client never collapses these into a single field.
   */
  error: ErrorPayload | null;
  /** Structured warnings with severity and machine-readable codes */
  warnings: WarningPayload[];
  /** Lightweight info notifications */
  infoEvents: InfoPayload[];
  /**
   * The latest provider-capacity retry state. This is separate from `error`
   * because overload backoff is recoverable and should not render like a failed
   * turn unless the server later emits a fatal error.
   */
  providerRetry: ProviderRetryPayload | null;
  /** Full ordered history for debug/timeline surfaces. */
  providerRetryHistory: ProviderRetryPayload[];

  // ── Record Reservations ─────────────────────────────────────
  /**
   * Keyed by record_id. Tracks database rows reserved by the server.
   * Status flows: pending → active/completed/failed.
   * This is the client-side mirror of what the server persisted.
   */
  reservations: Record<string, ReservationRecord>;

  // ── Data Events (genuine catch-all) ──────────────────────────
  /** ONLY for unstructured data events — NOT status/tools/blocks/completion */
  dataPayloads: Array<TypedDataPayload | UntypedDataPayload>;

  // ── Event Timeline (first-class sequential record) ───────────
  /**
   * The authoritative ordered record of every meaningful event during
   * this request's lifetime. This is NOT a debug copy — it IS the
   * source of truth for event ordering.
   *
   * Chunks are coalesced: a `text_start` entry marks when text began
   * streaming and `text_end` marks when a non-chunk event interrupted
   * (or the stream ended). Text content lives in renderBlocks (the
   * single source of truth). Everything else gets its own timeline entry.
   *
   * This allows full reconstruction of the assistant's behavior:
   *   thinking → tool calls → results → more thinking → text → more tools → text
   */
  timeline: TimelineEntry[];

  /**
   * Tracks whether we're currently inside a text-streaming run.
   * When true, chunks are flowing into textChunks[] and the timeline
   * has an open `text_start` that hasn't been closed by `text_end` yet.
   */
  isTextStreaming: boolean;

  /**
   * Running block-order index for the current text run. When isTextStreaming
   * flips to false, this is written into the text_end entry so selectors can
   * reconstruct which render blocks belong to which text run.
   */
  textRunBlockStart: number;

  /**
   * Raw chunk text accumulated since the current text run opened. Preserves
   * the original markdown as emitted by the model — fences, table pipes,
   * XML tags, etc. — which the block accumulator strips when building
   * typed render blocks. At `text_end` time this snapshot is written onto
   * the timeline entry so the stream-commit path can emit it as the
   * authoritative `CxTextContent` text. Without this the committed DB
   * content is stripped of structure and code blocks re-render as plain
   * text after the stream ends.
   */
  currentTextRunRaw: string;

  // ── Raw Event Log (absolute truth) ──────────────────────────
  /**
   * Every single event yielded by the NDJSON parser, captured BEFORE
   * any type-guard matching or processing. Nothing is filtered, coalesced,
   * or dropped. This is the forensic record — if an event reached the
   * client, it is here.
   *
   * NOT used by any selector or component for rendering — purely for
   * the StreamDebugPanel "Raw" tab.
   */
  rawEvents: RawStreamEvent[];

  // ── JSON Extraction (opt-in per request) ─────────────────────
  /**
   * Extracted JSON values from the streamed text. null when JSON
   * extraction is not enabled for this request.
   */
  extractedJson: ExtractedJsonSnapshot[] | null;
  /** Monotonic revision — bumped only when extractedJson changes */
  jsonExtractionRevision: number;
  /** Flipped to true after the finalize pass at stream end */
  jsonExtractionComplete: boolean;

  // ── Timing ───────────────────────────────────────────────────
  startedAt: string;
  firstChunkAt: string | null;
  completedAt: string | null;
  clientMetrics: ClientMetrics | null;

  /**
   * Factual routing record stamped at send time — the literal target URL, the
   * channel, and the sandbox-binding outcome for THIS request. This is ground
   * truth (it mirrors the exact fetch args + payload), so the Creator Hub
   * Routing tab can show "where did this turn actually go, and did the box
   * bind" without anyone guessing. `null` until the send fires.
   */
  routing: RequestRouting | null;
}

/**
 * Send-time routing facts for one request. Everything here reflects what was
 * actually put on the wire, not intent.
 */
export interface RequestRouting {
  /** Full URL the request was POSTed to (e.g. https://sandbox.matrxserver.com/ai/agents/<id>). */
  url: string;
  /** Which backend channel resolved it: global / override (in-box proxy) / ec2-dedicated. */
  channel: "global" | "override" | "ec2-dedicated";
  /** The active server toggle at send time (production / localhost / custom / …). */
  activeServer: string;
  /**
   * The sandbox the conversation resolved to (sync, pre-mint), or null if none
   * was selected. `source` tells you whether it came from the per-conversation
   * override, the shared user-active preference, or the editor.
   */
  sandboxRef: {
    rowId: string;
    tier?: "ec2" | "hosted";
    source: "conversation-override" | "surface-active" | "editor-active";
  } | null;
  /**
   * Whether the `sandbox` binding actually attached to the payload. When a
   * `sandboxRef` exists but this is false, the binding failed at token mint
   * (box not running / mint error) — the agent got NO sandbox tools.
   */
  sandboxAttached: boolean;
  /** `client.capabilities` sent on the wire (e.g. ["sandbox-fs", "nextjs-surface"]). */
  capabilities: string[];
  /** Tool names sent in `tools` / `tools_replace` (additive request tools). */
  toolNames: string[];
  /** ISO timestamp of the send. */
  recordedAt: string;
}

/**
 * Serializable snapshot of an extracted JSON value.
 * Mirrors ExtractedJson from utils/json but avoids importing
 * the full extraction module into the type file.
 */
export interface ExtractedJsonSnapshot {
  value: unknown;
  type: "object" | "array" | "primitive";
  source: "fenced" | "bare-block" | "inline" | "whole-string";
  isComplete: boolean;
  repairApplied: boolean;
  warnings: string[];
}

export interface RawStreamEvent {
  idx: number;
  timestamp: number;
  eventType: string;
  data: unknown;
}

// =============================================================================
// Operation Tracking (init/completion pairs)
// =============================================================================

export interface OperationEntry {
  operationId: string;
  operation: Operation;
  parentOperationId: string | null;
  startedAt: number;
}

export interface CompletedOperationEntry extends OperationEntry {
  status: InitCompletionStatus;
  result: Record<string, unknown>;
  completedAt: number;
  durationMs: number;
}

// =============================================================================
// Event Timeline — first-class sequential record
//
// CONTRACT — single source of truth: timeline entries that mirror a backend
// stream event MUST embed that event's payload verbatim under `data`. We do
// NOT cherry-pick fields, rename them to camelCase, or fabricate fields
// that aren't on the wire. The backend's generated payload types
// (`@/types/python-generated/stream-events`) are imported and used directly,
// so any backend rename / addition / removal surfaces as a TypeScript error
// the next time `pnpm sync-types` runs.
//
// Client-derived variants (`text_start`, `text_end`, `reasoning_start`,
// `reasoning_end`, `unknown`) are not 1:1 to backend events — they're
// coalesced from chunk events on the client side and therefore have no
// `data` field. Their shapes are documented inline.
// =============================================================================

/**
 * Discriminated union of all timeline entries.
 * `seq` is the global monotonic index across all event types.
 * `timestamp` is performance.now() for sub-millisecond ordering.
 */
export type TimelineEntry =
  | TimelineTextStart
  | TimelineTextEnd
  | TimelineReasoningStart
  | TimelineReasoningEnd
  | TimelinePhase
  | TimelineInit
  | TimelineCompletion
  | TimelineWarning
  | TimelineInfo
  | TimelineToolEvent
  | TimelineRenderBlock
  | TimelineDataEvent
  | TimelineError
  | TimelineEnd
  | TimelineBroker
  | TimelineHeartbeat
  | TimelineRecordReserved
  | TimelineRecordUpdate
  | TimelineResourceChanged
  | TimelineStructuredOutput
  | TimelineProviderRetry
  | TimelineUnknown;

interface TimelineBase {
  seq: number;
  timestamp: number;
}

// ─── Client-derived variants (no backend payload) ───────────────────────────

export interface TimelineTextStart extends TimelineBase {
  kind: "text_start";
  blockStartIndex: number;
}

export interface TimelineTextEnd extends TimelineBase {
  kind: "text_end";
  blockStartIndex: number;
  blockEndIndex: number;
  blockCount: number;
  /**
   * Raw chunk text accumulated between the preceding `text_start` and this
   * `text_end`, with the original markdown markers (fences, pipes, XML
   * tags) preserved. `assembleMessageParts` emits this verbatim as
   * `CxTextContent.text`, so code blocks and tables round-trip correctly
   * through `cx_message.content` back into typed render blocks on reload.
   * Optional for back-compat with entries that predated the raw-text capture.
   */
  rawText?: string;
}

export interface TimelineReasoningStart extends TimelineBase {
  kind: "reasoning_start";
  chunkStartIndex: number;
}

export interface TimelineReasoningEnd extends TimelineBase {
  kind: "reasoning_end";
  chunkStartIndex: number;
  chunkEndIndex: number;
  chunkCount: number;
}

export interface TimelineUnknown extends TimelineBase {
  kind: "unknown";
  /** Server's `event` discriminator string for whatever wasn't recognised. */
  originalEvent: string;
  /** Raw payload from the wire, untouched. */
  rawData: unknown;
}

// ─── Backend-mirrored variants (each embeds its source payload verbatim) ────
//
// The `data` field on each variant below IS the wire payload. No projection.
// Selectors and UIs MUST read fields off `entry.data.x` (snake_case as on
// the wire) so that any backend rename produces a TypeScript error here
// instead of silently losing data.

export interface TimelinePhase extends TimelineBase {
  kind: "phase";
  data: PhasePayload;
}

export interface TimelineInit extends TimelineBase {
  kind: "init";
  data: InitPayload;
}

export interface TimelineCompletion extends TimelineBase {
  kind: "completion";
  data: CompletionPayload;
}

export interface TimelineWarning extends TimelineBase {
  kind: "warning";
  data: WarningPayload;
}

export interface TimelineInfo extends TimelineBase {
  kind: "info";
  data: InfoPayload;
}

export interface TimelineToolEvent extends TimelineBase {
  kind: "tool_event";
  data: ToolEventPayload;
}

export interface TimelineRenderBlock extends TimelineBase {
  kind: "render_block";
  data: RenderBlockPayload;
}

export interface TimelineDataEvent extends TimelineBase {
  kind: "data";
  data: TypedDataPayload | UntypedDataPayload;
}

export interface TimelineError extends TimelineBase {
  kind: "error";
  data: ErrorPayload;
}

export interface TimelineEnd extends TimelineBase {
  kind: "end";
  data: EndPayload;
}

export interface TimelineBroker extends TimelineBase {
  kind: "broker";
  data: BrokerPayload;
}

export interface TimelineHeartbeat extends TimelineBase {
  kind: "heartbeat";
  data: HeartbeatPayload;
}

export interface TimelineRecordReserved extends TimelineBase {
  kind: "record_reserved";
  data: RecordReservedPayload;
}

export interface TimelineRecordUpdate extends TimelineBase {
  kind: "record_update";
  data: RecordUpdatePayload;
}

/**
 * Generic "this resource just moved/changed/got invalidated" event. Driven
 * by the canonical Python `resource_changed` stream event — covers
 * sandbox-mode `fs_write`/`fs_patch`/`fs_mkdir`, and any future kind
 * (cloud_files row updates, sandbox.cwd transitions, cache busts, …).
 */
export interface TimelineResourceChanged extends TimelineBase {
  kind: "resource_changed";
  data: ResourceChangedPayload;
}

export interface TimelineStructuredOutput extends TimelineBase {
  kind: "structured_output";
  data: StructuredOutputPayload;
}

export interface TimelineProviderRetry extends TimelineBase {
  kind: "provider_retry";
  data: ProviderRetryPayload;
}

// =============================================================================
// Compile-time drift guards
//
// These assertions exist solely to make the type-checker shout the moment
// `pnpm sync-types` regenerates `stream-events.ts` with a renamed / removed
// field that we still embed in a Timeline variant. If the backend changes
// (say) `ErrorPayload.message` → `ErrorPayload.text`, the next `tsc` run
// will fail HERE, before the rest of the codebase silently keeps reading a
// non-existent field.
//
// Adding a new `Timeline*` variant: add a corresponding line below.
// Removing one: delete the matching line.
// =============================================================================

type _AssertEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : never;

type _TimelinePayloadGuards = {
  phase: _AssertEqual<TimelinePhase["data"], PhasePayload>;
  init: _AssertEqual<TimelineInit["data"], InitPayload>;
  completion: _AssertEqual<TimelineCompletion["data"], CompletionPayload>;
  warning: _AssertEqual<TimelineWarning["data"], WarningPayload>;
  info: _AssertEqual<TimelineInfo["data"], InfoPayload>;
  tool_event: _AssertEqual<TimelineToolEvent["data"], ToolEventPayload>;
  render_block: _AssertEqual<TimelineRenderBlock["data"], RenderBlockPayload>;
  data: _AssertEqual<
    TimelineDataEvent["data"],
    TypedDataPayload | UntypedDataPayload
  >;
  error: _AssertEqual<TimelineError["data"], ErrorPayload>;
  end: _AssertEqual<TimelineEnd["data"], EndPayload>;
  broker: _AssertEqual<TimelineBroker["data"], BrokerPayload>;
  heartbeat: _AssertEqual<TimelineHeartbeat["data"], HeartbeatPayload>;
  record_reserved: _AssertEqual<
    TimelineRecordReserved["data"],
    RecordReservedPayload
  >;
  record_update: _AssertEqual<
    TimelineRecordUpdate["data"],
    RecordUpdatePayload
  >;
  resource_changed: _AssertEqual<
    TimelineResourceChanged["data"],
    ResourceChangedPayload
  >;
  structured_output: _AssertEqual<
    TimelineStructuredOutput["data"],
    StructuredOutputPayload
  >;
  provider_retry: _AssertEqual<
    TimelineProviderRetry["data"],
    ProviderRetryPayload
  >;
};

// Reference the guards so the compiler actually checks them. If any
// _AssertEqual<...> resolves to `never`, this assignment fails to typecheck
// because `never` is not a `true`.
type _TimelinePayloadDriftGuard = {
  [K in keyof _TimelinePayloadGuards]: _TimelinePayloadGuards[K] extends true
    ? true
    : never;
};
const _ENFORCE_TIMELINE_PAYLOAD_GUARDS: _TimelinePayloadDriftGuard = {
  phase: true,
  init: true,
  completion: true,
  warning: true,
  info: true,
  tool_event: true,
  render_block: true,
  data: true,
  error: true,
  end: true,
  broker: true,
  heartbeat: true,
  record_reserved: true,
  record_update: true,
  resource_changed: true,
  structured_output: true,
  provider_retry: true,
};

// =============================================================================
// Record Reservation
// =============================================================================

export type ReservationStatus = "pending" | "active" | "completed" | "failed";

export interface ReservationRecord {
  dbProject: string;
  table: string;
  recordId: string;
  status: ReservationStatus;
  parentRefs: Record<string, string>;
  metadata: Record<string, unknown>;
}

// =============================================================================
// Tool Delegation
// =============================================================================

export interface PendingToolCall {
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  receivedAt: string;
  deadlineAt: string;
  resolved: boolean;
}

// =============================================================================
// API Request Payloads
// =============================================================================

/**
 * USER-layer overrides on the request — the highest-priority leg of the
 * backend's apply-policy cascade (agent → surface → user). Mirrors the
 * backend `UserOverrides` object. Sent only when a field is explicitly set;
 * an omitted `user` (or omitted field) lets the backend resolve from the
 * surface / agent / default below it.
 */
export interface UserOverrides {
  /** User's chosen output-directive apply policy. See `ApplyPolicy`. */
  apply_policy?: import("./tool-injection.types").ApplyPolicy;
}

/**
 * Assembled snake_case wire payload for POST /ai/agents/{agent_id}.
 * Built by assembleRequest() from all instance slices + appContextSlice.
 * Scope fields are snapshotted at execution time.
 *
 * Tool injection uses the unified contract — `tools`, `tools_replace`, and
 * `client` replace the legacy `client_tools`, `custom_tools`, `ide_state`,
 * and `sandbox` fields. See `features/agents/types/tool-injection.types.ts`.
 */
export interface AssembledAgentStartRequest {
  /** USER-layer overrides (apply policy, …). See `UserOverrides`. */
  user?: UserOverrides;
  user_input?: string | MessagePart[];
  variables?: Record<string, unknown>;
  config_overrides?: Record<string, unknown>;
  context?: Record<string, unknown>;
  /** Additive tools — added on top of capability defaults + agent's saved tool set. */
  tools?: import("./tool-injection.types").ToolSpec[];
  /** When set, becomes the entire active tool set for the turn. */
  tools_replace?: import("./tool-injection.types").ToolSpec[] | null;
  /** Capability envelope — declares what the calling surface can do. */
  client?: import("./tool-injection.types").ClientContext;
  /**
   * Top-level sandbox binding. aidream hydrates
   * `ctx.metadata["active_sandbox"]` — which the matrx-ai fs/shell tools read
   * to route into the container — ONLY from this field. The same payload also
   * rides in `client.state["sandbox-fs"]`, but that lands on a different
   * metadata key the proxy does not read; until aidream bridges the two, this
   * top-level field is what actually routes tools into the box. Promoted from
   * the `sandbox-fs` capability in the execute thunk — never assembled here.
   */
  sandbox?: import("./tool-injection.types").ClientCapabilityPayloads["sandbox-fs"];
  conversation_id?: string;
  is_new?: boolean | null;
  organization_id?: string;
  project_id?: string;
  task_id?: string;
  /**
   * Active scope selections (ctx_scopes ids) from appContextSlice at send
   * time. The server unions them with the conversation's tags inside
   * resolve_full_context so the selected scopes' context cells reach the
   * agent. Membership-validated server-side; ignored by pre-scope_ids
   * backend deploys (pydantic extra='ignore').
   */
  scope_ids?: string[];
  source_app?: string;
  source_feature?: string;
  stream?: boolean;
  debug?: boolean;
  /** Admin: render every assistant turn as a single block instead of a streaming thread. */
  block_mode?: boolean;
  /** Admin: capture a full server-side snapshot of the request + response for offline inspection. */
  snapshot?: boolean;
  /**
   * Admin-only Observational Memory toggle (tri-state):
   *   null / omitted → inherit the conversation's persisted state
   *   true           → enable + persist on cx_conversation.metadata
   *   false          → disable + persist
   * Non-admin values are silently ignored by the server.
   */
  memory?: boolean | null;
  /** Admin-only: per-conversation Observer/Reflector model override. */
  memory_model?: string | null;
  /** Admin-only: "thread" (default) or "resource" scope for memory. */
  memory_scope?: "thread" | "resource";
}

/**
 * Assembled snake_case wire payload for POST /ai/conversations/{conversation_id}.
 */
export interface AssembledConversationRequest {
  /** USER-layer overrides (apply policy, …). See `UserOverrides`. */
  user?: UserOverrides;
  /**
   * Omitted on a retry (`retry: true`). On a normal continuation it carries
   * the user's turn. Exactly one of `user_input` / `retry` must be present —
   * the backend returns 422 `user_input_required` if neither is.
   */
  user_input?: string | MessagePart[];
  /**
   * Re-run the conversation's current persisted state with NO new input. The
   * backend re-attempts the last turn; because a failed assistant turn is
   * persisted `is_visible_to_model=false`, the model's context ends at the
   * user's message and it tries again. See
   * `aidream/api/docs/CONVERSATION_FAILURE_AND_RETRY_FE_GUIDE.md`.
   */
  retry?: boolean;
  config_overrides?: Record<string, unknown>;
  context?: Record<string, unknown>;
  tools?: import("./tool-injection.types").ToolSpec[];
  tools_replace?: import("./tool-injection.types").ToolSpec[] | null;
  client?: import("./tool-injection.types").ClientContext;
  /** See `AssembledAgentStartRequest.sandbox` — same top-level binding, forwarded on every turn. */
  sandbox?: import("./tool-injection.types").ClientCapabilityPayloads["sandbox-fs"];
  organization_id?: string;
  project_id?: string;
  task_id?: string;
  /** See `AssembledAgentStartRequest.scope_ids` — re-sent each turn so the latest selection applies. */
  scope_ids?: string[];
  stream?: boolean;
  debug?: boolean;
  /** Admin: render every assistant turn as a single block instead of a streaming thread. */
  block_mode?: boolean;
  /** Admin: capture a full server-side snapshot of the request + response for offline inspection. */
  snapshot?: boolean;
  /**
   * Admin-only Observational Memory toggle (tri-state):
   *   null / omitted → inherit conversation's persisted state
   *   true           → enable + persist
   *   false          → disable + persist
   */
  memory?: boolean | null;
  /** Admin-only: per-conversation Observer/Reflector model override. */
  memory_model?: string | null;
  /** Admin-only: "thread" (default) or "resource" scope for memory. */
  memory_scope?: "thread" | "resource";
}

/**
 * Snake_case wire format for a single client tool result.
 * Used in POST /ai/conversations/{id}/tool_results.
 */
export interface ClientToolResultWire {
  call_id: string;
  tool_name: string;
  output?: unknown;
  is_error?: boolean;
  error_message?: string | null;
}

/**
 * Internal (camelCase) representation of a tool result before wire serialization.
 * The execute thunk maps these to ClientToolResultWire before sending.
 */
export interface ClientToolResult {
  callId: string;
  toolName: string;
  output?: unknown;
  isError?: boolean;
  errorMessage?: string;
}
