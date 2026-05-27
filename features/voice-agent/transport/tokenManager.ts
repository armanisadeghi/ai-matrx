// features/voice-agent/transport/tokenManager.ts
//
// Ephemeral xAI client_secret lifecycle.
//
// Behaviors:
//   - `prime()` — fetch a token immediately. Used on page mount so the first
//     click→connect is instant (no token round-trip in the critical path).
//   - `getCurrent()` — returns the cached token if non-expired, otherwise
//     waits on the in-flight fetch (deduped).
//   - Background refresh: scheduled at `expires_at - skew`. On failure,
//     exponential backoff up to `MAX_REFRESH_ATTEMPTS`. After the cap, we
//     surface an error via `onError` and stop scheduling new refreshes — the
//     orchestrator hook is responsible for showing the user a banner.

import {
  TOKEN_REFRESH_SKEW_SECONDS,
  TOKEN_TTL_SECONDS,
} from "../constants";
import type { VoiceAgentTokenResponse } from "../types";

const TOKEN_ENDPOINT = "/api/voice-agent/token";
const MAX_REFRESH_ATTEMPTS = 5;
const REFRESH_BACKOFF_MAX_MS = 10_000;

export interface TokenError {
  code: "fetch-failed" | "unauthorized" | "service-unavailable" | "malformed";
  message: string;
  status?: number;
}

export interface TokenManager {
  prime: () => Promise<void>;
  getCurrent: () => Promise<string>;
  /** Currently cached token value, or null. Cheap, non-async. */
  peek: () => string | null;
  onError: (cb: (err: TokenError) => void) => () => void;
  dispose: () => void;
}

interface CreateTokenManagerOptions {
  /** Override TTL on the wire (dev only — for refresh testing). */
  devTtlSeconds?: number;
}

export function createTokenManager(
  opts: CreateTokenManagerOptions = {},
): TokenManager {
  let current: VoiceAgentTokenResponse | null = null;
  let inFlight: Promise<VoiceAgentTokenResponse> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const errorCallbacks = new Set<(err: TokenError) => void>();

  function emitError(err: TokenError): void {
    for (const cb of errorCallbacks) {
      try {
        cb(err);
      } catch {
        // ignore
      }
    }
  }

  function scheduleRefresh(): void {
    if (disposed || !current) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    const nowSec = Math.floor(Date.now() / 1000);
    const refreshAtSec = Math.max(
      nowSec + 1, // never < 1s from now
      current.expires_at - TOKEN_REFRESH_SKEW_SECONDS,
    );
    const delayMs = Math.max(1000, (refreshAtSec - nowSec) * 1000);
    refreshTimer = setTimeout(() => {
      void refreshWithBackoff(0);
    }, delayMs);
  }

  async function refreshWithBackoff(attempt: number): Promise<void> {
    if (disposed) return;
    try {
      await fetchToken();
      scheduleRefresh();
    } catch (err) {
      const code = (err as TokenError)?.code ?? "fetch-failed";
      if (code === "unauthorized" || code === "service-unavailable") {
        // Non-retryable.
        emitError(err as TokenError);
        return;
      }
      if (attempt + 1 >= MAX_REFRESH_ATTEMPTS) {
        emitError({
          code: "fetch-failed",
          message:
            "Voice token refresh failed repeatedly. The session may drop when the current token expires.",
        });
        return;
      }
      const backoff = Math.min(
        REFRESH_BACKOFF_MAX_MS,
        1000 * 2 ** attempt,
      );
      refreshTimer = setTimeout(() => {
        void refreshWithBackoff(attempt + 1);
      }, backoff);
    }
  }

  async function fetchToken(): Promise<VoiceAgentTokenResponse> {
    if (inFlight) return inFlight;
    const body: Record<string, unknown> = {};
    if (
      opts.devTtlSeconds &&
      opts.devTtlSeconds > 0 &&
      opts.devTtlSeconds <= TOKEN_TTL_SECONDS
    ) {
      body.ttl_seconds = opts.devTtlSeconds;
    }

    inFlight = (async () => {
      const resp = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });

      if (!resp.ok) {
        const code: TokenError["code"] =
          resp.status === 401
            ? "unauthorized"
            : resp.status === 503
              ? "service-unavailable"
              : "fetch-failed";
        const text = await resp.text().catch(() => "");
        // The token route returns JSON like `{ error, xai_status, xai_body }`.
        // Parse it so the surfaced message is human-readable (the actual
        // xAI error if xAI rejected) instead of raw JSON in the banner.
        let message = `Token endpoint returned ${resp.status}`;
        if (text) {
          try {
            const parsed = JSON.parse(text) as {
              error?: string;
              xai_status?: number;
              xai_body?: string;
            };
            const primary =
              typeof parsed.error === "string" ? parsed.error : "";
            const xaiDetail =
              typeof parsed.xai_body === "string" && parsed.xai_body.length > 0
                ? ` — xAI said: ${parsed.xai_body.slice(0, 400)}`
                : "";
            if (primary) {
              message = `${primary}${xaiDetail}`;
            } else {
              message = text.slice(0, 500);
            }
          } catch {
            message = text.slice(0, 500);
          }
        }
        const err: TokenError = {
          code,
          message,
          status: resp.status,
        };
        // Log once on the browser console so the operator inspecting the
        // network tab sees the full diagnostic alongside the request.
        if (typeof console !== "undefined") {
          console.error("[voice-agent/tokenManager] token mint failed:", {
            status: resp.status,
            message,
          });
        }
        throw err;
      }
      const data = (await resp.json()) as Partial<VoiceAgentTokenResponse>;
      if (!data?.value || typeof data.expires_at !== "number") {
        throw {
          code: "malformed",
          message: "Token endpoint returned an unexpected payload.",
        } satisfies TokenError;
      }
      current = { value: data.value, expires_at: data.expires_at };
      return current;
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  async function prime(): Promise<void> {
    if (current && !isExpired(current)) return;
    await fetchToken();
    scheduleRefresh();
  }

  async function getCurrent(): Promise<string> {
    if (!current || isExpired(current)) {
      await fetchToken();
      scheduleRefresh();
    }
    if (!current) throw new Error("Token manager has no token after fetch.");
    return current.value;
  }

  function peek(): string | null {
    if (current && !isExpired(current)) return current.value;
    return null;
  }

  function onError(cb: (err: TokenError) => void): () => void {
    errorCallbacks.add(cb);
    return () => errorCallbacks.delete(cb);
  }

  function dispose(): void {
    disposed = true;
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    errorCallbacks.clear();
    current = null;
  }

  return { prime, getCurrent, peek, onError, dispose };
}

function isExpired(token: VoiceAgentTokenResponse): boolean {
  // Treat as expired if within the skew window — forces a refresh before use.
  const nowSec = Math.floor(Date.now() / 1000);
  return token.expires_at - TOKEN_REFRESH_SKEW_SECONDS <= nowSec;
}
