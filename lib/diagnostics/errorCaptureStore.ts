/**
 * errorCaptureStore.ts
 *
 * A module-level, React-free ring buffer that captures runtime errors the
 * moment they happen — anywhere, on any page, even outside React render or
 * before the Redux store has hydrated. It is the ONE sink for the systemwide
 * Error Inspector: Supabase/PostgREST errors, uncaught runtime exceptions,
 * unhandled promise rejections, console.error, Python-backend HTTP failures,
 * and React render errors all land here through their own capture adapters.
 *
 * Why a module store and not a Redux slice:
 *   - The Supabase capture proxy (supabaseErrorCapture.ts) is imported by
 *     `utils/supabase/client.ts`, which 1,000+ files depend on. Pulling the
 *     Redux store into that graph (and dispatching on a hot path) is the wrong
 *     coupling. A plain module store has zero deps and never misses an early
 *     error.
 *   - `useSyncExternalStore` gives React components a first-class subscription
 *     to it with correct tearing semantics — see `useCapturedErrors.ts`.
 *
 * Every entry is classified into a visibility TIER (red / orange / yellow) at
 * capture time via `classifyTier` (lib/diagnostics/errorTierRules.ts). The
 * default is `red`; admins quiet specific errors by adding downgrade rules.
 *
 * This is the single capture path for global runtime errors — the old
 * `adminDebugSlice` listeners were retired in favor of `globalErrorCapture.ts`
 * feeding this store, so there is no parallel system.
 */

import { extractErrorMessage } from "@/utils/errors";
import { classifyTier } from "@/lib/diagnostics/errorTierRules";
import type { ErrorTier } from "@/lib/diagnostics/errorTiers";

/** How a captured error reached us. */
export type CapturedErrorSource =
  /** A Supabase call resolved with a populated `error` ({ data, error }). */
  | "supabase-postgrest"
  /** A Supabase call threw / its promise rejected (network, abort, etc.). */
  | "supabase-exception"
  /** An uncaught error reached `window` 'error' (runtime exception). */
  | "runtime-exception"
  /** An unhandled promise rejection reached `window`. */
  | "unhandled-rejection"
  /** A `console.error(...)` call (noise-filtered). */
  | "console-error"
  /** A Python-backend call returned a non-2xx HTTP status. */
  | "api-http"
  /** A Python-backend call failed at the network layer (timeout, DNS, abort). */
  | "api-network"
  /** A React component threw during render and an error boundary caught it. */
  | "react-render"
  // ── Server-origin structured stream events (the agent execution stream) ───
  /** A typed `error` event from the stream (ErrorPayload — fatal). */
  | "agent-stream-error"
  /** A typed `warning` event from the stream (WarningPayload). */
  | "agent-stream-warning"
  /** A `tool_event` with `event: "tool_error"` (a tool failed). */
  | "agent-stream-tool-error"
  /** A `provider_retry` event that reached a terminal/paused state. */
  | "agent-stream-provider-retry"
  /**
   * A `record_update` with `status: "failed"` — an optimistically-reserved row
   * reached a terminal failed state. Usually the row IS written (provider
   * error in its structured `error` column); rarely a real rollback via
   * fail_all_pending. The wire payload can't distinguish the two yet.
   */
  | "agent-stream-record-failed"
  /** A typed `data` event carrying an error (search_error, memory_error, …). */
  | "agent-stream-data-error"
  /** Stream transport failure surfaced by the NDJSON parser (BackendApiError). */
  | "agent-stream-transport"
  /** Client-side stream death (heartbeat loss, total-timeout, fetch failure). */
  | "agent-stream-client-error"
  /**
   * The server declared the request terminal (user_request completion, fatal
   * error event, or `end`) but never closed the response socket within the
   * grace window — the client closed it locally so the awaited request could
   * settle (D130: the headless image pipeline hung >8 min on a run the server
   * had fully completed). Firing means a SERVER defect: the streaming
   * response was held open (e.g. its heartbeat task outliving send_end).
   */
  | "agent-stream-terminal-guard"
  // ── Domain ────────────────────────────────────────────────────────────────
  /** An expiring/private media URL reached a render/store path (durability defect). */
  | "media-durability"
  /**
   * The model's chain-of-thought (`<thinking>`/`<reasoning>`) leaked into the
   * ANSWER text — i.e. it survived the render-block type-split and reached the
   * canonical JSON-extraction / answer-text path. This firing means the stream
   * block accumulator failed to isolate reasoning (an unclosed tag, a novel
   * inline shape); the answer/reasoning boundary is the load-bearing invariant
   * of the single-path streaming model, so this is a real defect to find, not
   * something to silently strip. */
  | "reasoning-leak"
  /**
   * Stored data violated the generated wire/DB contract at a read ingress
   * (e.g. a JSONB column failed validation against the OpenAPI schema). The
   * offending value was excluded, not passed through — this firing means a
   * write path produced a non-conforming shape and must be found and fixed.
   */
  | "data-shape"
  /**
   * The active-org single-source-of-truth was MISSING from Redux when an
   * org-scoped write needed it, so `ensureOrgId` fell back to the personal-org
   * RPC. The `appContextPolicy` sync engine is supposed to keep the org present
   * before any write runs — this firing means a real defect got past it.
   */
  | "org-resolution"
  /**
   * A user-facing `toast.error(...)`. Showing a failure to the user describes
   * handling, not severity; these stay red unless a specific downgrade rule
   * proves that exact toast is expected noise.
   */
  | "user-toast"
  /**
   * The marketing crawler/scraper boundary (features/marketing/crawler):
   * a direct scraper command failed (HTTP error, stream error event, broken
   * stream), or a server-side "initialize site" step reported a failure in
   * `web.site.initialization.errors`. These are real cross-service failures —
   * the site UI shows a friendly message, but the underlying cause must land
   * in the inspector with its status/step intact.
   */
  | "marketing-crawler"
  /** An RTK rejected thunk (action type ending in /rejected) — a real failure. */
  | "redux-rejected"
  /**
   * The content-ir system (features/content-ir): kind-registry schema loads
   * failing, stream-vs-static parity mismatches (shadow telemetry), or
   * envelope assembly defects. A firing means the canonical structured-
   * content path degraded — streaming keeps working via fallbacks, but the
   * cause must be found.
   */
  | "content-ir"
  /**
   * The surface-writeback seam (features/surfaces/runtime/surface-writeback):
   * an agent result / kind-component action tried to write into the page and
   * the contract broke — unknown target, declared target with no registered
   * handler, or the page's apply handler threw. Every firing is a real defect
   * in either the caller or the surface's write wiring.
   */
  | "surface-writeback"
  /**
   * A runaway markdown delimiter reached a renderer: a stray/unpaired `$$`
   * that would have made remark-math swallow prose into a math node (KaTeX
   * then dumps it as red `.katex-error` text), or an unclosed `[` that would
   * have turned a whole section into one link label. The guard escaped it and
   * the message still renders — but the producer emitting broken delimiters is
   * a real defect to find. See `lib/markdown/delimiter-guard.ts`.
   */
  | "markdown-delimiters"
  /**
   * The Assists system (features/assists): an assist chip's action failed —
   * unregistered action kind, handler failure, or a decide/receipt write
   * failing after the action ran. Every firing is a real defect in the
   * producer's action binding or the registry wiring.
   */
  | "assists";

/** A Supabase DML verb, or "rpc" for a function call. */
export type CapturedOperation =
  | "select"
  | "insert"
  | "update"
  | "upsert"
  | "delete"
  | "rpc"
  | "unknown";

export interface CapturedError {
  /** Stable id for React keys + dedupe targeting. */
  id: string;
  source: CapturedErrorSource;
  /** Epoch ms of the FIRST occurrence in this dedupe group. */
  firstAt: number;
  /** Epoch ms of the MOST RECENT occurrence. */
  lastAt: number;
  /** How many times this exact signature has fired (deduped). */
  count: number;

  /** `window.location.pathname` at capture time. */
  route: string;
  /** `window.location.href` at capture time. */
  url: string;

  /** select / insert / rpc / … when known. */
  operation: CapturedOperation;
  /** Postgres schema if the call went through `.schema(name)`. */
  schema?: string;
  /** Table name, or RPC function name. */
  relation?: string;

  // ── Raw PostgREST fields (the high-value bit) ────────────────────────────
  /** PostgREST / Postgres error code, e.g. "42501", "PGRST116". */
  code?: string;
  /** Primary error message. */
  message: string;
  /** PostgREST `details`. */
  details?: string;
  /** PostgREST `hint`. */
  hint?: string;
  /** HTTP status when available. */
  status?: number;

  // ── Structured server-origin fields (stream / Python backend) ────────────
  /**
   * The human-friendly message the server intends for end users (stream
   * `user_message`, API `user_message`) — distinct from the technical
   * `message`. This is the field a future user-facing surface would show.
   */
  userMessage?: string;
  /** Backend request id (X-Request-ID / serverDetail.request_id) for log correlation. */
  requestId?: string;
  /** Conversation id when the error belongs to an agent run. */
  conversationId?: string;

  // ── Generic exception fields ─────────────────────────────────────────────
  /** Error.name for thrown exceptions. */
  name?: string;
  /** Stack trace for thrown exceptions (the error's own stack). */
  stack?: string;
  /**
   * Cleaned application call-site — where the failing query was issued from
   * (component / hook / service frames, node_modules stripped). This is the
   * "which component" answer for PostgREST errors that carry no JS stack.
   */
  callSite?: string;

  /** Full JSON-safe dump of the original error object — future-proof. */
  raw?: unknown;

  // ── Visibility tier (assigned by the store via classifyTier) ─────────────
  /** red (loud) · orange (dot) · yellow (silent). Default red. */
  tier: ErrorTier;
  /** The downgrade rule id that set this tier, if any. */
  tierRuleId?: string;
  /** The downgrade rule's reason, for display. */
  tierReason?: string;
}

/** The minimal input a capture site provides; the store fills the rest. */
export interface CaptureInput {
  source: CapturedErrorSource;
  operation?: CapturedOperation;
  schema?: string;
  relation?: string;
  code?: string;
  message: string;
  details?: string;
  hint?: string;
  status?: number;
  userMessage?: string;
  requestId?: string;
  conversationId?: string;
  name?: string;
  stack?: string;
  callSite?: string;
  raw?: unknown;
}

export interface CapturedErrorStats {
  /** Distinct entries currently held (after dedupe). */
  total: number;
  /** Sum of every occurrence (counts the deduped repeats). */
  occurrences: number;
  /** Occurrences since the inspector was last marked seen. */
  unseen: number;

  // ── Per-tier distinct counts (drive the tiered badge) ────────────────────
  /** Distinct red (Clear Error) entries. */
  red: number;
  /** Distinct orange (Minor) entries. */
  orange: number;
  /** Distinct yellow (Silent) entries. */
  yellow: number;
  /** Unseen occurrences at the red tier (pulses the red badge). */
  unseenRed: number;
  /** Unseen occurrences at the orange tier (pulses the orange dot). */
  unseenOrange: number;
}

/** Max distinct entries retained. Oldest are evicted first. */
const MAX_ENTRIES = 300;

// Newest-first. Reference is replaced (never mutated in place) on every change
// so `useSyncExternalStore` can compare snapshots by identity.
let entries: CapturedError[] = [];
let unseen = 0;
let occurrences = 0;
let unseenRed = 0;
let unseenOrange = 0;

const listeners = new Set<() => void>();

// Cached, identity-stable stats snapshot — recomputed only when a field
// actually changes, so `useSyncExternalStore` doesn't loop.
let statsSnapshot: CapturedErrorStats = {
  total: 0,
  occurrences: 0,
  unseen: 0,
  red: 0,
  orange: 0,
  yellow: 0,
  unseenRed: 0,
  unseenOrange: 0,
};

function refreshStats(): void {
  let red = 0;
  let orange = 0;
  let yellow = 0;
  for (const e of entries) {
    if (e.tier === "red") red += 1;
    else if (e.tier === "orange") orange += 1;
    else yellow += 1;
  }
  if (
    statsSnapshot.total !== entries.length ||
    statsSnapshot.occurrences !== occurrences ||
    statsSnapshot.unseen !== unseen ||
    statsSnapshot.red !== red ||
    statsSnapshot.orange !== orange ||
    statsSnapshot.yellow !== yellow ||
    statsSnapshot.unseenRed !== unseenRed ||
    statsSnapshot.unseenOrange !== unseenOrange
  ) {
    statsSnapshot = {
      total: entries.length,
      occurrences,
      unseen,
      red,
      orange,
      yellow,
      unseenRed,
      unseenOrange,
    };
  }
}

// Listener notification is DEFERRED to a microtask. `captureError` is called
// from render-path recovery code (content-ir compile/route/envelope screams,
// data-shape reads, org-resolution) — a synchronous notify there re-renders
// every `useSyncExternalStore` subscriber (the Error Inspector badge in the
// shared shell) INSIDE another component's render, which is React's
// "Cannot update a component while rendering a different component" /
// "hasn't mounted yet" warning on every route that mounts the shell
// (FOUND_DEFECTS D61/D76). Snapshots still update synchronously — only the
// notify waits for the stack to unwind, so capture stays render-safe by
// construction no matter which of the ~60 capture sites fires. Contract
// pinned by errorCaptureStore.renderSafety.test.tsx.
let notifyScheduled = false;

function emit(): void {
  refreshStats();
  if (notifyScheduled) return;
  notifyScheduled = true;
  queueMicrotask(() => {
    notifyScheduled = false;
    for (const listener of listeners) listener();
  });
}

function makeId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `err_${entries.length}_${performance?.now?.() ?? 0}`;
}

/**
 * Stable signature for dedupe — same broken query collapses to one row.
 * MATRX-EXCEPTION: `?? ""` here builds a joined dedupe KEY (not persisted
 * data) — an absent optional field becomes an empty join segment so two
 * captures differing only in an unset field still collapse correctly.
 */
function signatureOf(input: CaptureInput): string {
  return [
    input.source,
    input.operation ?? "",
    input.schema ?? "",
    input.relation ?? "",
    input.code ?? "",
    input.message,
  ].join("|");
}

function nowMs(): number {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function currentRoute(): { route: string; url: string } {
  if (typeof window === "undefined") return { route: "", url: "" };
  return { route: window.location.pathname, url: window.location.href };
}

/**
 * Capture an error into the store. Idempotent-friendly: identical consecutive
 * signatures are deduped (count++ / lastAt updated) and floated to the top
 * instead of flooding the buffer — essential during a cutover where one broken
 * query fires on a loop.
 */
/** Bump the unseen counters for a given tier (called once per occurrence). */
function bumpUnseen(tier: ErrorTier): void {
  unseen += 1;
  if (tier === "red") unseenRed += 1;
  else if (tier === "orange") unseenOrange += 1;
}

export function captureError(input: CaptureInput): void {
  const at = nowMs();
  occurrences += 1;

  const sig = signatureOf(input);
  const existingIdx = entries.findIndex((e) => signatureOf(e) === sig);

  if (existingIdx !== -1) {
    const existing = entries[existingIdx];
    const updated: CapturedError = {
      ...existing,
      lastAt: at,
      count: existing.count + 1,
      // Refresh route/status/raw to the latest occurrence — most useful.
      ...currentRoute(),
      status: input.status ?? existing.status,
      raw: input.raw ?? existing.raw,
    };
    bumpUnseen(existing.tier);
    const next = entries.slice();
    next.splice(existingIdx, 1);
    next.unshift(updated);
    entries = next;
    emit();
    return;
  }

  const { route, url } = currentRoute();
  const entry: CapturedError = {
    id: makeId(),
    source: input.source,
    firstAt: at,
    lastAt: at,
    count: 1,
    route,
    url,
    operation: input.operation ?? "unknown",
    schema: input.schema,
    relation: input.relation,
    code: input.code,
    message: input.message || extractErrorMessage(input.raw) || "Unknown error",
    details: input.details,
    hint: input.hint,
    status: input.status,
    userMessage: input.userMessage,
    requestId: input.requestId,
    conversationId: input.conversationId,
    name: input.name,
    stack: input.stack,
    callSite: input.callSite,
    raw: input.raw,
    // Classified below; seeded to the default so the object is well-typed.
    tier: "red",
  };

  // Classify into a visibility tier. Never let a bad rule break capture.
  try {
    const c = classifyTier(entry);
    entry.tier = c.tier;
    entry.tierRuleId = c.ruleId;
    entry.tierReason = c.reason;
  } catch {
    entry.tier = "red";
  }
  bumpUnseen(entry.tier);

  const next = [entry, ...entries];
  if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES;
  entries = next;
  emit();
}

/** Subscribe to any change. Returns an unsubscribe fn. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current newest-first snapshot. Identity changes only when contents change. */
export function getSnapshot(): CapturedError[] {
  return entries;
}

const EMPTY: CapturedError[] = [];
/** SSR snapshot — always the same empty reference. */
export function getServerSnapshot(): CapturedError[] {
  return EMPTY;
}

/** Current stats snapshot. Identity-stable until a value changes. */
export function getStatsSnapshot(): CapturedErrorStats {
  return statsSnapshot;
}

/** Wipe everything. */
export function clearCapturedErrors(): void {
  if (entries.length === 0 && unseen === 0 && occurrences === 0) return;
  entries = [];
  unseen = 0;
  occurrences = 0;
  unseenRed = 0;
  unseenOrange = 0;
  emit();
}

/** Remove a single entry by id. */
export function dismissCapturedError(id: string): void {
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return;
  entries = next;
  emit();
}

/** Reset the unseen counters — call when the inspector is opened/viewed. */
export function markAllSeen(): void {
  if (unseen === 0 && unseenRed === 0 && unseenOrange === 0) return;
  unseen = 0;
  unseenRed = 0;
  unseenOrange = 0;
  emit();
}
