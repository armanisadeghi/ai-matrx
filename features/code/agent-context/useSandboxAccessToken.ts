"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useSandboxAccessToken
 *
 * Mints + caches a short-lived bearer token for direct browser → sandbox-proxy
 * AI calls. The token is the auth half of "sandbox-mode AI"; the URL half is
 * `serverOverrideUrl` on `instanceUIState`.
 *
 * Lifecycle:
 *   - Mints once via `POST /api/sandbox/<sandboxRowId>/access-tokens`.
 *   - Refreshes lazily ~30s before `exp` if the hook is still mounted.
 *   - Returns `null` while idle / disabled (no `sandboxRowId`) so callers can
 *     gate their writes on a non-null token.
 *
 * The route returns `{ token, exp, jti, scopes }` (orchestrator passthrough).
 * `exp` is a unix timestamp in seconds.
 */
export interface UseSandboxAccessTokenOptions {
  /**
   * The local sandbox row UUID (NOT the orchestrator's `sandbox_id`). The
   * Next.js mint route looks the row up to resolve tier + ownership before
   * forwarding to the orchestrator with the master `X-API-Key`.
   */
  sandboxRowId: string | null | undefined;
  /** Token capability bundle. Defaults to `["ai"]`. */
  scopes?: string[];
  /** Force a refresh even if the cached token is still valid. */
  reloadKey?: string | number;
}

export interface SandboxAccessToken {
  token: string;
  /** Unix seconds. */
  exp: number;
  jti?: string;
  scopes: string[];
}

export interface UseSandboxAccessTokenResult {
  token: string | null;
  expiresAt: number | null;
  isMinting: boolean;
  error: string | null;
  /** Force a re-mint outside of the auto-refresh window. */
  refresh: () => void;
}

const REFRESH_LEAD_SECONDS = 30;

export function useSandboxAccessToken({
  sandboxRowId,
  scopes,
  reloadKey,
}: UseSandboxAccessTokenOptions): UseSandboxAccessTokenResult {
  const [tokenState, setTokenState] = useState<SandboxAccessToken | null>(null);
  const [isMinting, setIsMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Track the last successful (sandboxRowId, scopesKey) so a sandbox swap
  // forces a re-mint instead of returning a token tied to the wrong row.
  const lastBoundRef = useRef<{
    sandboxRowId: string;
    scopesKey: string;
  } | null>(null);

  const scopesKey = (scopes ?? ["ai"]).join(",");

  useEffect(() => {
    if (!sandboxRowId) {
      // Disabled — drop any cached token so callers don't keep using it
      // against a stale binding.
      setTokenState(null);
      lastBoundRef.current = null;
      setError(null);
      return undefined;
    }

    const cached = tokenState;
    const now = Math.floor(Date.now() / 1000);
    const stillValid =
      cached &&
      lastBoundRef.current?.sandboxRowId === sandboxRowId &&
      lastBoundRef.current?.scopesKey === scopesKey &&
      cached.exp - now > REFRESH_LEAD_SECONDS;

    if (stillValid) return undefined;

    let cancelled = false;
    setIsMinting(true);
    setError(null);

    (async () => {
      try {
        const resp = await fetch(
          `/api/sandbox/${encodeURIComponent(sandboxRowId)}/access-tokens`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scopes: scopes ?? ["ai"] }),
          },
        );
        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          throw new Error(
            `Failed to mint sandbox access token (${resp.status}): ${body}`,
          );
        }
        // Orchestrator's actual response shape (per
        // SANDBOX_DIRECT_ENDPOINTS.md §2.2) is `{ token, expires_at,
        // direct_url, ws_base, tier, sandbox_id }`. The other doc page
        // (§7.8 in SANDBOX_PROXY_AND_FS_EVENTS_FE_INTEGRATION.md) sketched
        // `{ token, exp, jti, scopes }` — they disagree, the orchestrator
        // went with `expires_at`. Accept either: prefer `exp` (unix sec)
        // when present so this still works if the orchestrator ever
        // standardizes on it; fall back to parsing `expires_at` (ISO).
        const payload = (await resp.json()) as {
          token?: string;
          exp?: number;
          expires_at?: string;
          jti?: string;
          scopes?: string[];
        };

        const expSeconds = (() => {
          if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
            return payload.exp;
          }
          if (typeof payload.expires_at === "string") {
            const ms = Date.parse(payload.expires_at);
            if (Number.isFinite(ms)) return Math.floor(ms / 1000);
          }
          return null;
        })();

        if (!payload.token || expSeconds === null) {
          throw new Error(
            `Sandbox access-tokens endpoint returned an invalid payload (missing token or exp/expires_at). Got keys: ${Object.keys(payload).join(", ")}`,
          );
        }
        if (cancelled) return;
        const minted: SandboxAccessToken = {
          token: payload.token,
          exp: expSeconds,
          jti: payload.jti,
          scopes: payload.scopes ?? scopes ?? ["ai"],
        };
        setTokenState(minted);
        lastBoundRef.current = { sandboxRowId, scopesKey };
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown mint error");
        setTokenState(null);
      } finally {
        if (!cancelled) setIsMinting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // tokenState is intentionally excluded — it's set inside this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandboxRowId, scopesKey, refreshTick, reloadKey]);

  // Auto-refresh slightly before `exp`. Separate effect so it doesn't
  // re-run the whole mint flow on every render.
  useEffect(() => {
    if (!tokenState) return undefined;
    const now = Math.floor(Date.now() / 1000);
    const secondsToRefresh = Math.max(
      tokenState.exp - now - REFRESH_LEAD_SECONDS,
      1,
    );
    const timer = setTimeout(() => {
      setRefreshTick((n) => n + 1);
    }, secondsToRefresh * 1000);
    return () => clearTimeout(timer);
  }, [tokenState]);

  return {
    token: tokenState?.token ?? null,
    expiresAt: tokenState?.exp ?? null,
    isMinting,
    error,
    refresh: () => setRefreshTick((n) => n + 1),
  };
}
