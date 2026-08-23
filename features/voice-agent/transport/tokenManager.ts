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

import { mintCredential } from "@/lib/api/broker/client";
import { BackendApiError } from "@/lib/api/errors";
import { TOKEN_REFRESH_SKEW_SECONDS, TOKEN_TTL_SECONDS } from "../constants";
import type { VoiceAgentTokenResponse } from "../types";

/**
 * The realtime credential comes from the aidream TOKEN BROKER, audience
 * `xai_realtime` — never from a Next.js route holding its own `XAI_API_KEY`.
 * The broker is the one place that owns provider keys, the child-safety gate
 * on direct model access, and the signed grant record; a second minting path
 * would be a second policy surface that silently drifts.
 *
 * `tier_policy: "none"` because xAI does not bake a model into the credential
 * — the session model is chosen client-side at `session.update`, so there is
 * nothing for mint-time tier resolution to swap.
 */
const BROKER_AUDIENCE = "xai_realtime" as const;
const BROKER_TIER_POLICY = "none" as const;
const MAX_REFRESH_ATTEMPTS = 5;
const REFRESH_BACKOFF_MAX_MS = 10_000;

export interface TokenError {
  // access-errors: ok — error-code union mirroring the broker's own HTTP statuses, never rendered as copy
  code:
    | "fetch-failed"
    | "unauthorized"
    /** The broker REFUSED this account (403) — e.g. the child-safety gate on
     *  direct model access. `message` is the server's user-safe text and is
     *  shown verbatim; this is a real answer, not a transport failure. */
    | "refused"
    | "service-unavailable"
    | "malformed";
  message: string;
  status?: number;
}

export interface TokenManager {
  prime: () => Promise<void>;
  getCurrent: () => Promise<string>;
  /** Currently cached token value, or null. Cheap, non-async. */
  peek: () => string | null;
  /** Unix-seconds expiry of the cached token, or null. For diagnostics. */
  expiresAt: () => number | null;
  /**
   * Drop the cached token and cancel the pending refresh timer.
   *
   * xAI's ephemeral `client_secret` is consumed by the WebSocket handshake —
   * presenting the same secret to a second `wss://api.x.ai/v1/realtime`
   * connection within its TTL produces an opaque `connect-failed` error. So
   * after every WebSocket disconnect we invalidate the cache; the next
   * `getCurrent()` (or background `prime()`) mints a fresh secret.
   */
  invalidate: () => void;
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
      if (
        code === "unauthorized" ||
        code === "refused" ||
        code === "service-unavailable"
      ) {
        // Non-retryable: a refusal is a decision, not a transient failure —
        // retrying it five times just repeats the same answer.
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
      const backoff = Math.min(REFRESH_BACKOFF_MAX_MS, 1000 * 2 ** attempt);
      refreshTimer = setTimeout(() => {
        void refreshWithBackoff(attempt + 1);
      }, backoff);
    }
  }

  /** Map a broker failure onto the manager's error vocabulary. */
  function toTokenError(caught: unknown): TokenError {
    if (caught instanceof BackendApiError) {
      const status = caught.status;
      const code: TokenError["code"] =
        status === 401
          ? "unauthorized"
          : status === 403
            ? "refused"
            : status === 503
              ? "service-unavailable"
              : "fetch-failed";
      return {
        code,
        // `userMessage` is the server's user-safe text (a 403 refusal carries
        // the reason a person can act on); `detail` is the diagnostic.
        message:
          caught.userMessage || caught.detail || `Broker returned ${status}`,
        status: status ?? undefined,
      };
    }
    return {
      code: "fetch-failed",
      message:
        caught instanceof Error ? caught.message : "Credential mint failed.",
    };
  }

  async function fetchToken(): Promise<VoiceAgentTokenResponse> {
    if (inFlight) return inFlight;
    // Dev-only shorter TTL for exercising the refresh path. The broker clamps
    // to the audience's own bounds regardless of what we ask for.
    const ttlSeconds =
      opts.devTtlSeconds &&
      opts.devTtlSeconds > 0 &&
      opts.devTtlSeconds <= TOKEN_TTL_SECONDS
        ? opts.devTtlSeconds
        : TOKEN_TTL_SECONDS;

    inFlight = (async () => {
      let credential;
      try {
        credential = await mintCredential(BROKER_AUDIENCE, BROKER_TIER_POLICY, {
          ttlSeconds,
        });
      } catch (caught) {
        const err = toTokenError(caught);
        // Log once so the operator inspecting the network tab sees the full
        // diagnostic beside the request.
        if (typeof console !== "undefined") {
          console.error("[voice-agent/tokenManager] credential mint failed:", {
            status: err.status,
            code: err.code,
            message: err.message,
          });
        }
        throw err;
      }

      if (!credential?.token || typeof credential.expires_at !== "number") {
        throw {
          code: "malformed",
          message: "The token broker returned an unexpected credential shape.",
        } satisfies TokenError;
      }
      current = { value: credential.token, expires_at: credential.expires_at };
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

  function expiresAt(): number | null {
    return current?.expires_at ?? null;
  }

  function onError(cb: (err: TokenError) => void): () => void {
    errorCallbacks.add(cb);
    return () => errorCallbacks.delete(cb);
  }

  function invalidate(): void {
    current = null;
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
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

  return { prime, getCurrent, peek, expiresAt, invalidate, onError, dispose };
}

function isExpired(token: VoiceAgentTokenResponse): boolean {
  // Treat as expired if within the skew window — forces a refresh before use.
  const nowSec = Math.floor(Date.now() / 1000);
  return token.expires_at - TOKEN_REFRESH_SKEW_SECONDS <= nowSec;
}
