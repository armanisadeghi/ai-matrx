/**
 * THE single Cartesia access-token primitive for the entire app.
 *
 * Every browser-side Cartesia call MUST go through this module — either
 * `withCartesiaAccessToken` (arbitrary calls) or `connectCartesiaTts` in
 * ./connection.ts (TTS websockets). Never fetch `/api/cartesia` directly,
 * never hold a Cartesia API key client-side (D113), never build a second
 * token cache.
 *
 * Behavior contract (Arman ruling, 2026-07-28):
 *  - LAZY: no token is fetched until the first Cartesia use.
 *  - CACHED: one module-scoped token shared by every surface; concurrent
 *    callers share one in-flight request (no stampede).
 *  - VERIFIED: every use goes through getCartesiaAccessToken(), which
 *    refreshes ahead of expiry.
 *  - SELF-HEALING: withCartesiaAccessToken retries EXACTLY ONCE on an
 *    auth-shaped failure with a force-refreshed token. The user never
 *    notices an expired token.
 */

interface CachedToken {
    token: string;
    /** Epoch ms after which the token must not be used. */
    expiresAt: number;
}

interface TokenEndpointResponse {
    token?: string;
    expiresAt?: number;
    error?: string;
}

/** Refresh when less than this remains — covers clock skew + request time. */
const REFRESH_MARGIN_MS = 60_000;
/** If the server doesn't report expiry, assume a conservative 50 minutes. */
const FALLBACK_TTL_MS = 50 * 60_000;

let cached: CachedToken | null = null;
let inFlight: Promise<CachedToken> | null = null;

async function fetchFreshToken(): Promise<CachedToken> {
    const res = await fetch("/api/cartesia");
    const body = (await res.json().catch(() => ({}))) as TokenEndpointResponse;
    if (!res.ok || !body.token) {
        throw new Error(
            body.error || `Cartesia token fetch failed (HTTP ${res.status})`,
        );
    }
    return {
        token: body.token,
        expiresAt:
            typeof body.expiresAt === "number"
                ? body.expiresAt
                : Date.now() + FALLBACK_TTL_MS,
    };
}

/**
 * Returns a valid Cartesia access token, fetching or refreshing as needed.
 * Concurrent callers share one request.
 */
export async function getCartesiaAccessToken(opts?: {
    forceRefresh?: boolean;
}): Promise<string> {
    if (
        !opts?.forceRefresh &&
        cached &&
        Date.now() < cached.expiresAt - REFRESH_MARGIN_MS
    ) {
        return cached.token;
    }
    if (opts?.forceRefresh) cached = null;
    if (!inFlight) {
        inFlight = fetchFreshToken()
            .then((t) => {
                cached = t;
                return t;
            })
            .finally(() => {
                inFlight = null;
            });
    }
    const t = await inFlight;
    return t.token;
}

/**
 * Drop the cached token. Pass the token that failed so a refresh that already
 * happened (another caller healed first) isn't thrown away.
 */
export function invalidateCartesiaAccessToken(staleToken?: string): void {
    if (staleToken && cached && cached.token !== staleToken) return;
    cached = null;
}

/** Heuristic: does this failure look like a rejected/expired credential? */
export function isCartesiaAuthError(err: unknown): boolean {
    const msg =
        err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : JSON.stringify(err ?? "");
    const m = msg.toLowerCase();
    if (/\b(401|403)\b/.test(m)) return true;
    return (
        m.includes("unauthorized") ||
        m.includes("forbidden") ||
        m.includes("invalid token") ||
        m.includes("invalid access token") ||
        m.includes("token expired") ||
        m.includes("expired token") ||
        m.includes("invalid api key") ||
        m.includes("invalid_api_key") ||
        m.includes("authentication")
    );
}

/**
 * Run a Cartesia call with a guaranteed token; on an auth-shaped failure,
 * silently refresh and retry exactly once. Non-auth failures throw untouched.
 */
export async function withCartesiaAccessToken<T>(
    run: (token: string) => Promise<T>,
): Promise<T> {
    const token = await getCartesiaAccessToken();
    try {
        return await run(token);
    } catch (err) {
        if (!isCartesiaAuthError(err)) throw err;
        invalidateCartesiaAccessToken(token);
        const fresh = await getCartesiaAccessToken({ forceRefresh: true });
        return await run(fresh);
    }
}
