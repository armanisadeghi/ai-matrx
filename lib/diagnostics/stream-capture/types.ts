/**
 * Universal exchange capture — the forensic record of everything that leaves
 * the application and everything that comes back, in order.
 *
 * The model is deliberately flat and feature-agnostic: an exchange is one
 * request out, one response in, and — when the response is a stream — the
 * ordered array of events that arrived on it. That shape does not change per
 * feature. Agents, research, podcasts, scraper, RAG and PDF all produce it.
 *
 * Capture happens at the `fetch` boundary (see `install-fetch-tap.ts`), NOT at
 * `parseNdjsonStream`. A parser-level tap records only the callers that opt in,
 * and ~9 call sites read `response.body` directly. Every HTTP call in the app
 * bottoms out at `fetch`.
 */

/** One stream event, exactly as it came off the wire. No filtering, no coalescing. */
export interface CapturedStreamEvent {
  /** Position in the stream. Monotonic from 0 — this IS the ordering. */
  idx: number;
  /** epoch ms at which the line was decoded. */
  ts: number;
  /**
   * Best-effort label for filtering in the UI, derived from the common
   * envelope shapes. Recording NEVER depends on this succeeding.
   */
  eventType: string;
  /** The parsed JSON payload, untouched. */
  data: unknown;
  /** Present only when the line was NOT valid JSON, so nothing is ever lost. */
  unparsed?: string;
}

export type CapturedExchangeStatus =
  | "open"
  | "closed"
  | "errored"
  | "aborted";

/** One full round trip: what went out, what came back. */
export interface CapturedExchange {
  id: string;

  // ── Outbound ────────────────────────────────────────────────────────────
  url: string;
  method: string;
  /** Sensitive values are redacted at capture time — see `redactHeaders`. */
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  requestBodyTruncated: boolean;

  // ── Inbound ─────────────────────────────────────────────────────────────
  httpStatus: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  /** `X-Request-ID` / `X-Conversation-ID` when the server supplied them. */
  requestId: string | null;
  conversationId: string | null;

  /** True when the response carried an event stream rather than a single body. */
  isStream: boolean;
  /** Ordered events — populated only when `isStream`. */
  events: CapturedStreamEvent[];
  /** Whole body — populated only when NOT `isStream`. */
  responseBody: string | null;
  responseBodyTruncated: boolean;

  // ── Lifecycle ───────────────────────────────────────────────────────────
  startedAt: number;
  endedAt: number | null;
  status: CapturedExchangeStatus;
  error: string | null;
  /** Total decoded response bytes seen on the wire. */
  bytes: number;
  /**
   * True when a cap dropped events. Surfaced in the UI so a truncated record
   * can never be mistaken for a complete one.
   */
  truncated: boolean;
  /** Which mode was active when this was recorded. */
  mode: CaptureMode;
}

/**
 * `minimal` is the always-on floor: enough of a trail to answer "did anything
 * even go out?" without accumulating. `full` is opt-in, admin-gated, and
 * retains everything.
 */
export type CaptureMode = "minimal" | "full";

export const CAPTURE_LIMITS = {
  minimal: {
    /** Deliberately tiny — this must never build up in a normal session. */
    maxExchanges: 3,
    maxEventsPerExchange: 25,
    maxBodyChars: 2_000,
  },
  full: {
    maxExchanges: 100,
    maxEventsPerExchange: 5_000,
    maxBodyChars: 200_000,
  },
} as const satisfies Record<
  CaptureMode,
  { maxExchanges: number; maxEventsPerExchange: number; maxBodyChars: number }
>;

export const MAX_UNPARSED_CHARS = 2_000;

/**
 * Content types that carry an event stream. Anything else is captured as a
 * single body instead of a tee'd event sequence.
 *
 * `text/plain` is included deliberately: some backend stream routes omit an
 * explicit NDJSON content type, and a stream misclassified as a plain body
 * would be invisible in exactly the way this system exists to prevent.
 */
export const STREAMING_CONTENT_TYPES = [
  "application/x-ndjson",
  "application/jsonl",
  "application/json-seq",
  "text/event-stream",
  "text/plain",
] as const;

export function isStreamingContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const normalized = contentType.toLowerCase();
  return STREAMING_CONTENT_TYPES.some((t) => normalized.includes(t));
}

/**
 * Header names whose values must never enter the buffer. Capturing outbound
 * traffic means capturing credentials unless we actively prevent it — and this
 * buffer is readable from any devtools console.
 */
const REDACTED_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "apikey",
  "x-api-key",
  "proxy-authorization",
]);

export function redactHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = REDACTED_HEADERS.has(key.toLowerCase()) ? "[redacted]" : value;
  });
  return out;
}
