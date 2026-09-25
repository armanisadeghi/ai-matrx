/**
 * THE REQUEST LEDGER — the one list of "what did this tab just ask for".
 *
 * Every HTTP call the app makes bottoms out at `fetch`: supabase-js (the
 * browser singleton and every schema client built from it), the records-ui
 * data source (it reads and writes through that client), `callApi` /
 * `backend-client` / the typed client for aidream, and plain `fetch` in
 * feature code. The capture tap (`install-fetch-tap.ts`) wraps `fetch` once,
 * before hydration, and feeds this ledger from the same three points it feeds
 * the forensic recorder. So there is exactly ONE place a request is logged,
 * and no client path has to remember to report itself.
 *
 * Why a second list beside the recorder: the recorder keeps FULL exchanges
 * (headers, stream events, bodies) and is capped at 3 unless an admin opts in.
 * The ledger keeps a SUMMARY of the last 50 for everyone, always: method,
 * path, status, duration, request id, the JSON request body under 8 KB
 * (credentials redacted, auth endpoints never), and for a failed request the
 * server's own sentence. The Alchemy page capture, LargeIndicator,
 * MediumIndicator and ChatDebug all read it.
 *
 * Replaces `apiConfig.recentCalls`, which nothing ever wrote (lane ALCHEMY-2,
 * 2026-09-25: every capture said `requests="0"`).
 */

export const REQUEST_LEDGER_LIMIT = 50;
export const LEDGER_BODY_MAX_BYTES = 8 * 1024;

export interface LedgerEntry {
  id: string;
  method: string;
  /** Path + query, origin removed (query clipped at 300 chars). */
  path: string;
  /** Origin the request went to (`https://db.matrxserver.com`, the aidream server, this app). */
  baseUrl: string;
  /** Which client door this was, from the URL: supabase-rest, supabase-rpc, supabase-auth, supabase-storage, aidream, next-api, other. */
  client: LedgerClient;
  status: "pending" | "success" | "error";
  httpStatus?: number;
  durationMs?: number;
  requestId?: string;
  /** The JSON request body (redacted) when it is JSON and under 8 KB. */
  requestBody?: unknown;
  /** Why the body is absent when there was one ("over 8 KB", "not JSON", "auth request"). */
  requestBodyNote?: string;
  /** For a failed request: the server's own words (PostgREST message/hint, FastAPI detail). */
  errorSentence?: string;
  timestamp: number;
}

export type LedgerClient =
  | "supabase-rest"
  | "supabase-rpc"
  | "supabase-auth"
  | "supabase-storage"
  | "supabase-functions"
  | "aidream"
  | "next-api"
  | "other";

interface LedgerState {
  entries: LedgerEntry[]; // oldest first
  seq: number;
  listeners: Set<() => void>;
  cached: LedgerEntry[] | null;
}

const GLOBAL_KEY = "__matrxRequestLedger" as const;

function state(): LedgerState {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: LedgerState };
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { entries: [], seq: 0, listeners: new Set(), cached: null };
  return g[GLOBAL_KEY];
}

let flushScheduled = false;
function notify(): void {
  const s = state();
  s.cached = null;
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    for (const l of s.listeners) {
      try {
        l();
      } catch (err) {
        console.error("[request-ledger] listener threw", err);
      }
    }
  });
}

const SENSITIVE_KEY = /pass(word)?|secret|token|api[_-]?key|authorization|cookie|otp|refresh|credential|private[_-]?key/i;

/** Redact credential-shaped keys at any depth. */
export function redactBody(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactBody(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redactBody(v, depth + 1);
  }
  return out;
}

export function classifyClient(url: URL, appOrigin: string | null): LedgerClient {
  const p = url.pathname;
  if (p.startsWith("/rest/v1/rpc/")) return "supabase-rpc";
  if (p.startsWith("/rest/v1/")) return "supabase-rest";
  if (p.startsWith("/auth/v1/")) return "supabase-auth";
  if (p.startsWith("/storage/v1/")) return "supabase-storage";
  if (p.startsWith("/functions/v1/")) return "supabase-functions";
  if (appOrigin && url.origin === appOrigin) return p.startsWith("/api/") ? "next-api" : "other";
  if (/matrxserver\.com$/.test(url.hostname) || /aidream/i.test(url.hostname) || url.port === "8000") return "aidream";
  return "other";
}

function isAuthRequest(client: LedgerClient, url: URL): boolean {
  return client === "supabase-auth" || /\/(auth|login|token|oauth|credential|vault)/i.test(url.pathname);
}

/** Next's own traffic (RSC, HMR, static chunks) is not a request the person made. */
export function isFrameworkNoise(url: URL, appOrigin: string | null): boolean {
  if (appOrigin && url.origin !== appOrigin) return false;
  const p = url.pathname;
  return (
    p.startsWith("/_next/") ||
    p.startsWith("/__nextjs") ||
    p.startsWith("/monitoring") ||
    url.searchParams.has("_rsc") ||
    /\.(js|css|map|png|jpe?g|svg|ico|woff2?|webp)$/i.test(p)
  );
}

function entryById(id: string): LedgerEntry | undefined {
  const list = state().entries;
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.id === id) return list[i];
  return undefined;
}

/**
 * Record an outbound request. `bodyText` is the raw text body when there was
 * one (null when none, undefined when it was not text). Returns the entry id,
 * or null when the request is framework noise.
 */
export function ledgerBegin(init: {
  url: string;
  method: string;
  bodyText: string | null | undefined;
  isRscOrNav?: boolean;
}): string | null {
  const appOrigin = typeof window !== "undefined" ? window.location.origin : null;
  let url: URL;
  try {
    url = new URL(init.url, appOrigin ?? "http://localhost");
  } catch {
    return null;
  }
  if (isFrameworkNoise(url, appOrigin) || init.isRscOrNav) return null;
  const client = classifyClient(url, appOrigin);
  const query = url.search.length > 300 ? `${url.search.slice(0, 300)}…` : url.search;
  const entry: LedgerEntry = {
    id: `req_${++state().seq}`,
    method: init.method.toUpperCase(),
    path: `${url.pathname}${query}`,
    baseUrl: url.origin,
    client,
    status: "pending",
    timestamp: Date.now(),
  };
  if (init.bodyText === undefined) {
    entry.requestBodyNote = "not a text body";
  } else if (init.bodyText !== null && init.bodyText.length > 0) {
    if (isAuthRequest(client, url)) {
      entry.requestBodyNote = "auth request: body not kept";
    } else if (new TextEncoder().encode(init.bodyText).length > LEDGER_BODY_MAX_BYTES) {
      entry.requestBodyNote = "over 8 KB: body not kept";
    } else {
      try {
        entry.requestBody = redactBody(JSON.parse(init.bodyText));
      } catch {
        entry.requestBodyNote = "not JSON: body not kept";
      }
    }
  }
  const s = state();
  s.entries.push(entry);
  if (s.entries.length > REQUEST_LEDGER_LIMIT) s.entries.splice(0, s.entries.length - REQUEST_LEDGER_LIMIT);
  notify();
  return entry.id;
}

export function ledgerResponse(id: string, init: { httpStatus: number; requestId: string | null }): void {
  const e = entryById(id);
  if (!e) return;
  e.httpStatus = init.httpStatus;
  if (init.requestId) e.requestId = init.requestId;
  e.durationMs = Date.now() - e.timestamp;
  e.status = init.httpStatus >= 400 ? "error" : "success";
  notify();
}

/**
 * The server's own sentence from an error body. PostgREST: message (+ details,
 * hint); FastAPI: detail (string, or {message}/{error}); ours: error/sentence.
 * Never invents one: an unreadable body yields undefined.
 */
export function errorSentenceFrom(bodyText: string): string | undefined {
  const text = bodyText.trim();
  if (!text) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text.startsWith("<") ? undefined : text.slice(0, 400);
  }
  const pick = (o: unknown): string | undefined => {
    if (typeof o === "string") return o;
    if (!o || typeof o !== "object") return undefined;
    const r = o as Record<string, unknown>;
    for (const k of ["sentence", "message", "error_description", "msg", "error"]) {
      const v = r[k];
      if (typeof v === "string" && v.trim()) {
        const extra = [r.details, r.hint].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
        return [v, ...extra].join(" ");
      }
      if (v && typeof v === "object") {
        const inner = pick(v);
        if (inner) return inner;
      }
    }
    if ("detail" in r) {
      const d = r.detail;
      if (Array.isArray(d)) return d.map((x) => pick(x) ?? JSON.stringify(x)).join("; ");
      return pick(d);
    }
    return undefined;
  };
  return pick(parsed)?.slice(0, 600);
}

/** The response body text, read only for a failed request, to keep its sentence. */
export function ledgerResponseBody(id: string, bodyText: string): void {
  const e = entryById(id);
  if (!e || e.status !== "error") return;
  const sentence = errorSentenceFrom(bodyText);
  if (sentence) {
    e.errorSentence = sentence;
    notify();
  }
}

/** A request that never got a response (network error, abort). */
export function ledgerFailed(id: string, message: string): void {
  const e = entryById(id);
  if (!e) return;
  e.status = "error";
  e.durationMs = Date.now() - e.timestamp;
  e.errorSentence = message.slice(0, 600);
  notify();
}

/** Newest first, reference-stable between changes (a `useSyncExternalStore` snapshot). */
export function getRequestLedger(): LedgerEntry[] {
  const s = state();
  if (!s.cached) s.cached = [...s.entries].reverse();
  return s.cached;
}

const EMPTY: LedgerEntry[] = [];
export function getServerRequestLedger(): LedgerEntry[] {
  return EMPTY;
}

export function subscribeRequestLedger(listener: () => void): () => void {
  const s = state();
  s.listeners.add(listener);
  return () => {
    s.listeners.delete(listener);
  };
}

export function clearRequestLedger(): void {
  state().entries = [];
  notify();
}

/**
 * The capture's view: failing requests first (newest first), then the rest
 * (newest first), `limit` in all.
 */
export function ledgerForCapture(limit = 20, entries: LedgerEntry[] = getRequestLedger()): LedgerEntry[] {
  const failing = entries.filter((e) => e.status === "error");
  const rest = entries.filter((e) => e.status !== "error");
  return [...failing, ...rest].slice(0, limit);
}
