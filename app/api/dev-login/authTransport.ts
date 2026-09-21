// app/api/dev-login/authTransport.ts
//
// ONE DROPPED SOCKET MUST NOT LOOK LIKE A PRODUCT DEFECT (2026-09-21, lane DEV-LOGIN).
//
// THE DEFECT THIS EXISTS FOR. Lanes driving headless walks against the shared
// dev server were answered by `/api/dev-login` with
// `{"error":"OTP fallback failed: fetch failed"}`. Three separate things were
// wrong with that sentence, and all three are this module's job:
//
//   1. IT NAMED THE WRONG FAILURE. `fetch failed` is what
//      `@supabase/auth-js` hands back when the HTTP call to the auth host did
//      not complete: `lib/fetch.js` catches the thrown transport error and
//      rethrows it as `AuthRetryableFetchError(e.message, 0)` — message
//      "fetch failed", status 0, and THE `cause` IS DISCARDED. So the route
//      could never see whether it was a reset socket, a connect timeout or a
//      DNS blip. `tracingFetch` below captures the whole `cause` chain BEFORE
//      auth-js flattens it, so the reason a lane reads is the real one.
//
//   2. IT BLAMED THE PASSWORD. The route only reaches the OTP fallback after
//      `signInWithPassword` fails, and its log line says
//      "AI_ADMIN_PASSWORD is stale". A transport failure took that same
//      branch, so a network hiccup was reported to every reader as a drifted
//      credential — and then the fallback, which goes to the SAME host over
//      the SAME pool, failed the same way and got the last word.
//
//   3. NOTHING RETRIED. The library's own name for this class is
//      *Retryable*FetchError. A long-lived dev-server process keeps a warm
//      undici connection pool to a Cloudflare edge; a shell `curl` opens a
//      fresh socket every time, which is exactly why the host answered a
//      normal 401 in 110 ms from a terminal while the same call failed inside
//      the server. Any pooled-socket transport has this class of transient,
//      and a single unretried attempt turns it into a hard 401.
//
// THE RULE THIS MODULE ENFORCES: a transport failure is retried and, if it
// still will not go through, is reported AS a transport failure with its
// cause chain and every attempt — never as a bad credential, and never with
// the second call's message standing in for the first call's.
//
// It is deliberately dependency-free and pure so `authTransport.test.ts` can
// drive every branch without a network or a Supabase project.

/** One attempt at one named call, in the order they happened. */
export interface TransportAttempt {
    /** Which call — e.g. `signInWithPassword`. */
    label: string;
    /** 1-based. */
    attempt: number;
    ms: number;
    /** The honest reason, cause chain included when we could see it. */
    reason: string;
}

/**
 * Error codes that mean "the bytes did not make it", not "the server said no".
 * The `UND_ERR_*` family is undici's (Node's fetch); the bare errno family is
 * the socket underneath it.
 */
const TRANSPORT_CODES = new Set([
    "UND_ERR_SOCKET",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "UND_ERR_ABORTED",
    "UND_ERR_DESTROYED",
    "UND_ERR_CLOSED",
    "ECONNRESET",
    "ECONNREFUSED",
    "ECONNABORTED",
    "EPIPE",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "ENOTFOUND",
    "EAI_AGAIN",
]);

/** Phrases Node and undici use for the same thing when no code is attached. */
const TRANSPORT_PHRASES = [
    "fetch failed",
    "socket hang up",
    "other side closed",
    "terminated",
    "network error",
    "connect timeout",
    "headers timeout",
    "premature close",
];

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : null;
}

/**
 * Flatten an error and everything it was caused by into one readable line.
 *
 * `fetch failed` on its own is useless; `fetch failed <- SocketError: other
 * side closed [UND_ERR_SOCKET]` names the defect. Nothing here prints a
 * header, a body or a URL query, so a credential can never ride out in a
 * reason string.
 */
export function describeFailure(error: unknown): string {
    const seen = new Set<unknown>();
    const parts: string[] = [];
    let current: unknown = error;
    while (current && !seen.has(current) && parts.length < 6) {
        seen.add(current);
        const record = asRecord(current);
        if (!record) {
            parts.push(String(current));
            break;
        }
        const name = typeof record.name === "string" ? record.name : "Error";
        const message =
            typeof record.message === "string" ? record.message : String(current);
        const code = typeof record.code === "string" ? ` [${record.code}]` : "";
        const status =
            typeof record.status === "number" && record.status > 0
                ? ` (HTTP ${record.status})`
                : "";
        parts.push(`${name}: ${message}${code}${status}`);
        current = record.cause;
    }
    return parts.join(" <- ") || "unknown failure";
}

/**
 * Is this "the call did not get through", as opposed to "the server answered
 * and the answer was no"?
 *
 * A wrong password is `AuthApiError` / HTTP 400 and must NEVER be retried or
 * excused as a blip — that is the drifted-credential case the OTP fallback
 * was built for. A transport failure is `AuthRetryableFetchError` with status
 * 0 (auth-js's own flattening of a thrown fetch), a 5xx from the edge, or a
 * raw undici/socket error when we are looking at the throw ourselves.
 */
export function isTransportFailure(error: unknown): boolean {
    const record = asRecord(error);
    if (!record) return false;

    const name = typeof record.name === "string" ? record.name : "";
    if (name === "AuthRetryableFetchError") return true;

    const code = typeof record.code === "string" ? record.code : "";
    if (TRANSPORT_CODES.has(code)) return true;

    const status = typeof record.status === "number" ? record.status : null;
    // 0 is auth-js for "no response at all"; 5xx is the edge, not the account.
    if (status === 0 || (status !== null && status >= 500)) return true;

    const message =
        typeof record.message === "string" ? record.message.toLowerCase() : "";
    if (TRANSPORT_PHRASES.some((phrase) => message.includes(phrase))) return true;

    return record.cause ? isTransportFailure(record.cause) : false;
}

/**
 * A `fetch` that records why a request died before anything downstream can
 * flatten it, then rethrows unchanged.
 *
 * This is the ONLY way the route can ever learn the cause of a
 * Supabase-reported "fetch failed": `@supabase/auth-js` keeps `e.message` and
 * drops `e.cause`. Handing this to the client's `global.fetch` puts us inside
 * the call, one frame before that loss.
 */
export function tracingFetch(
    label: string,
    log: TransportAttempt[],
    impl: typeof fetch = fetch,
): typeof fetch {
    return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const startedAt = Date.now();
        try {
            return await impl(input, init);
        } catch (error) {
            log.push({
                label: `${label}:transport`,
                attempt: log.filter((a) => a.label === `${label}:transport`).length + 1,
                ms: Date.now() - startedAt,
                reason: describeFailure(error),
            });
            throw error;
        }
    };
}

/**
 * What a Supabase auth call hands back: an answer, or an error, never a throw.
 *
 * Deliberately only `{ error }` — every auth method returns a UNION of a
 * success shape and a failure shape, and pinning `data` to one of them makes
 * the union unassignable. The caller keeps its own precise type.
 */
export interface AuthOutcome {
    error: unknown;
}

export interface RetryOptions {
    /** Total attempts, including the first. */
    attempts?: number;
    /** Backoff before attempt N+1, in ms. */
    backoffMs?: (attempt: number) => number;
    sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run a Supabase auth call, retrying ONLY a transport failure.
 *
 * Every attempt — including the ones that succeed after a failure — lands in
 * `log`, so a recovered blip is still visible to the lane and to the server
 * log instead of vanishing. A non-transport error (a real "no" from the auth
 * server) returns immediately: retrying a wrong password is how a test
 * account gets rate-limited, and hiding it is how a drifted credential goes
 * unnoticed for a day.
 */
export async function retryTransport<R extends AuthOutcome>(
    label: string,
    call: () => Promise<R>,
    log: TransportAttempt[],
    options: RetryOptions = {},
): Promise<R> {
    const attempts = options.attempts ?? 3;
    const backoffMs = options.backoffMs ?? ((attempt) => 200 * 2 ** (attempt - 1));
    const sleep = options.sleep ?? defaultSleep;

    let last!: R;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const startedAt = Date.now();
        try {
            last = await call();
        } catch (thrown) {
            // A throw is the same event as an `{ error }` for our purposes;
            // some code paths (a client constructed against a bad URL) throw.
            last = { error: thrown } as R;
        }
        const ms = Date.now() - startedAt;

        if (!last.error) {
            if (log.length) {
                log.push({ label, attempt, ms, reason: "recovered" });
            }
            return last;
        }

        log.push({ label, attempt, ms, reason: describeFailure(last.error) });
        if (!isTransportFailure(last.error)) return last;
        if (attempt < attempts) await sleep(backoffMs(attempt));
    }
    return last;
}

/** One line per attempt, for a log or an error body. Never carries a secret. */
export function formatAttempts(log: TransportAttempt[]): string {
    return log
        .map((a) => `${a.label} #${a.attempt} (${a.ms}ms): ${a.reason}`)
        .join(" | ");
}
