/**
 * Universal stream capture — the forensic record of every event stream the
 * application receives, regardless of which consumer parsed it.
 *
 * A stream is nothing more than an ordered array of events. That is the whole
 * model, and it does not change per feature: agents, research, podcasts,
 * scraper, RAG and PDF all produce the same shape.
 *
 * Capture happens at the `fetch` boundary (see `install-fetch-tap.ts`), NOT at
 * `parseNdjsonStream`. That distinction is load-bearing: a parser-level tap
 * only records callers who opt in, and ~9 call sites read `response.body`
 * directly. Every HTTP stream, without exception, passes through `fetch`.
 */

/** One event, exactly as it came off the wire. No filtering, no coalescing. */
export interface CapturedStreamEvent {
  /** Position in the stream. Monotonic from 0 — this IS the ordering. */
  idx: number;
  /** epoch ms at which the line was decoded. */
  ts: number;
  /**
   * Best-effort event-type label for filtering in the UI. Derived from the
   * common envelope shapes; `"unknown"` when the payload matches none of them.
   * Never used to decide whether to record — every line is recorded.
   */
  eventType: string;
  /** The parsed JSON payload, untouched. */
  data: unknown;
  /** Present only when the line was NOT valid JSON, so nothing is ever lost. */
  unparsed?: string;
}

export type CapturedStreamStatus =
  | "open"
  | "closed"
  | "errored"
  | "aborted";

/** One stream: its identity, its lifecycle, and its ordered events. */
export interface CapturedStream {
  id: string;
  url: string;
  method: string;
  /** `X-Request-ID` / `X-Conversation-ID` when the server supplied them. */
  requestId: string | null;
  conversationId: string | null;
  httpStatus: number;
  startedAt: number;
  endedAt: number | null;
  status: CapturedStreamStatus;
  /** Populated when `status === "errored"`. */
  error: string | null;
  events: CapturedStreamEvent[];
  /** Total decoded bytes seen on the wire. */
  bytes: number;
  /**
   * True when the per-stream event cap was hit and older events were dropped.
   * Surfaced in the UI so a truncated record can never be mistaken for a
   * complete one.
   */
  truncated: boolean;
}

/** Memory bounds. A debug facility must never be the reason a tab dies. */
export const CAPTURE_LIMITS = {
  /** Streams retained before the oldest is evicted. */
  maxStreams: 50,
  /** Events retained per stream before the oldest are dropped. */
  maxEventsPerStream: 5000,
  /** Raw text retained for a single unparsable line. */
  maxUnparsedChars: 2000,
} as const;

/**
 * Content types that carry an event stream. Anything else passes through the
 * tap untouched — teeing a JSON or HTML body would be pure cost.
 */
export const STREAMING_CONTENT_TYPES = [
  "application/x-ndjson",
  "application/jsonl",
  "application/json-seq",
  "text/event-stream",
] as const;

export function isStreamingContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const normalized = contentType.toLowerCase();
  return STREAMING_CONTENT_TYPES.some((t) => normalized.includes(t));
}
