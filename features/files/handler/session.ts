/**
 * features/files/handler/session.ts
 *
 * The browser file-session cookie — the auth lane behind durable private
 * render URLs.
 *
 * Durable file URLs (`{base}/files/{id}/download?inline=1`,
 * `{base}/media/{id}/v/{class}`) never expire and carry only the file id.
 * A plain `<img src>` / `<video src>` can't attach an Authorization header,
 * so private files authenticate through an HttpOnly `mx_files_session`
 * cookie instead: `POST /files/session` with normal auth headers AND
 * `credentials: 'include'` sets it (SameSite=None; Secure; 7-day TTL;
 * HMAC-signed), and the backend accepts it ONLY on GET byte routes.
 *
 * The durable URLs the backend emits point at the MAIN backend base, while
 * browser-side route rules can also target the standalone files host
 * (`lib/api/service-routing.ts`). Cookies are per-host, so when the two
 * bases differ we establish the session on BOTH — deduped, independent,
 * non-fatal on failure (the render path retries via `force` on error).
 *
 * State is in-memory only (expiry per base + in-flight dedupe). No
 * localStorage — a fresh page load just POSTs again.
 */

import {
  buildHeaders,
  resolveBaseUrl,
  resolveFilesBaseUrl,
} from "@/lib/python-client";

interface FileSessionResponse {
  ok: boolean;
  expires_in: number;
}

/** Refresh when less than this much of the cookie's TTL remains. */
const REFRESH_SAFETY_MARGIN_MS = 60 * 60 * 1000; // 1h of the 7-day TTL

interface BaseState {
  /** ms epoch when the cookie for this base should be considered stale. */
  freshUntil: number;
  inflight: Promise<void> | null;
  /** Log each base's failure once per page session, not once per render. */
  loggedFailure: boolean;
}

const stateByBase = new Map<string, BaseState>();

function baseState(base: string): BaseState {
  let s = stateByBase.get(base);
  if (!s) {
    s = { freshUntil: 0, inflight: null, loggedFailure: false };
    stateByBase.set(base, s);
  }
  return s;
}

async function establishOnBase(base: string): Promise<void> {
  const s = baseState(base);
  try {
    const { headers } = await buildHeaders({}, false);
    const response = await fetch(`${base}/files/session`, {
      method: "POST",
      headers,
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`POST ${base}/files/session → HTTP ${response.status}`);
    }
    const body = (await response.json()) as FileSessionResponse;
    const ttlMs = (body.expires_in ?? 0) * 1000;
    s.freshUntil = Date.now() + Math.max(0, ttlMs - REFRESH_SAFETY_MARGIN_MS);
    s.loggedFailure = false;
  } catch (err) {
    // Non-fatal by design: public files render without the cookie, and the
    // media error-retry path calls ensureFilesSession({ force: true }).
    if (!s.loggedFailure) {
      s.loggedFailure = true;
      console.warn(`[files-session] failed to establish session on ${base}`, err);
    }
    throw err;
  }
}

function ensureOnBase(base: string, force: boolean): Promise<void> {
  const s = baseState(base);
  if (s.inflight) return s.inflight;
  if (!force && s.freshUntil > Date.now()) return Promise.resolve();
  const promise = establishOnBase(base).finally(() => {
    s.inflight = null;
  });
  s.inflight = promise;
  return promise;
}

/**
 * Ensure the `mx_files_session` cookie is set on every backend base that
 * serves durable file bytes to this browser. Idempotent and deduped; a
 * fresh session is a no-op unless `force` is passed (use `force` from a
 * media element's error-retry path, where the cookie may have been
 * revoked/expired server-side despite looking fresh here).
 *
 * Never throws — per-base failures are independent and logged once.
 */
export async function ensureFilesSession(opts?: {
  force?: boolean;
}): Promise<void> {
  const force = opts?.force ?? false;
  const bases = new Set<string>();
  try {
    bases.add(resolveBaseUrl());
  } catch {
    // No backend configured (SSR/early boot) — nothing to establish.
  }
  try {
    bases.add(resolveFilesBaseUrl());
  } catch {
    // Standalone files host unresolved — main base still covers it.
  }
  await Promise.all(
    [...bases].map((base) => ensureOnBase(base, force).catch(() => undefined)),
  );
}

/** Test-only: reset all per-base session state. */
export function _resetFilesSessionForTests(): void {
  stateByBase.clear();
}
