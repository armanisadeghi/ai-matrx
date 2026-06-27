/**
 * errorCaptureStore.ts
 *
 * A module-level, React-free ring buffer that captures runtime errors the
 * moment they happen — anywhere, on any page, even outside React render or
 * before the Redux store has hydrated. Built for the 2026 DB transition, where
 * the same broken query can fire from a hundred call sites and we need exact,
 * raw Supabase/PostgREST detail in one place an admin can read and hand to an
 * AI agent.
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
 * This is NOT a parallel to `adminDebugSlice` (which nets generic
 * console.error / window 'error' / unhandledrejection). This store owns the
 * Supabase-error concern, which previously had NO dedicated capture at all.
 */

import { extractErrorMessage } from "@/utils/errors";

/** How a captured error reached us. */
export type CapturedErrorSource =
  /** A Supabase call resolved with a populated `error` ({ data, error }). */
  | "supabase-postgrest"
  /** A Supabase call threw / its promise rejected (network, abort, etc.). */
  | "supabase-exception";

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
}

/** Max distinct entries retained. Oldest are evicted first. */
const MAX_ENTRIES = 300;

// Newest-first. Reference is replaced (never mutated in place) on every change
// so `useSyncExternalStore` can compare snapshots by identity.
let entries: CapturedError[] = [];
let unseen = 0;
let occurrences = 0;

const listeners = new Set<() => void>();

// Cached, identity-stable stats snapshot — recomputed only when a field
// actually changes, so `useSyncExternalStore` doesn't loop.
let statsSnapshot: CapturedErrorStats = { total: 0, occurrences: 0, unseen: 0 };

function refreshStats(): void {
  if (
    statsSnapshot.total !== entries.length ||
    statsSnapshot.occurrences !== occurrences ||
    statsSnapshot.unseen !== unseen
  ) {
    statsSnapshot = { total: entries.length, occurrences, unseen };
  }
}

function emit(): void {
  refreshStats();
  for (const listener of listeners) listener();
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

/** Stable signature for dedupe — same broken query collapses to one row. */
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
export function captureError(input: CaptureInput): void {
  const at = nowMs();
  occurrences += 1;
  unseen += 1;

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
    name: input.name,
    stack: input.stack,
    callSite: input.callSite,
    raw: input.raw,
  };

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
  emit();
}

/** Remove a single entry by id. */
export function dismissCapturedError(id: string): void {
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return;
  entries = next;
  emit();
}

/** Reset the unseen counter — call when the inspector is opened/viewed. */
export function markAllSeen(): void {
  if (unseen === 0) return;
  unseen = 0;
  emit();
}
