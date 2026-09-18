import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  lookupSandboxAndOrchestrator,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";
import { isJsonObject } from "@/types/json";

const TRANSIENT_UPSTREAM_STATUSES = new Set([502, 503, 504]);
const TOKEN_MINT_MAX_ATTEMPTS = 3;
const TOKEN_MINT_RETRY_MS = 250;
// Keep all three attempts comfortably inside the serverless handler budget.
// Without an abortable per-attempt deadline, a black-holed orchestrator socket
// makes Vercel terminate this route with FUNCTION_INVOCATION_TIMEOUT, which
// prevents the caller's existing retry/recovery path from running.
const TOKEN_MINT_ATTEMPT_TIMEOUT_MS = 2_000;

/**
 * What this module actually needs from `fetch`: a string URL and an init.
 * Declared to the real call site rather than aliasing `typeof fetch`, whose
 * `URL | RequestInfo` input no caller here ever passes — and which made every
 * honest string-url test double unassignable. Global `fetch` still satisfies
 * it (a wider parameter is assignable to a narrower one).
 */
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
type ResponseConsumer<T> = (response: Response) => Promise<T>;

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * A token mint is safe to retry: the endpoint issues a fresh, scoped bearer
 * without changing the sandbox lifecycle. This protects a chat turn from the
 * short interval while an upstream proxy is republishing a healthy
 * orchestrator after a restart. Do not retry 4xx responses: those describe a
 * caller, access, or sandbox-state problem that another request cannot fix.
 */
export async function mintAccessTokenWithRetry<T = Response>(
  url: string,
  init: RequestInit,
  {
    request = fetch,
    wait = sleep,
    attemptTimeoutMs = TOKEN_MINT_ATTEMPT_TIMEOUT_MS,
    consume = async (response: Response) => response as T,
  }: {
    request?: FetchLike;
    wait?: (milliseconds: number) => Promise<void>;
    attemptTimeoutMs?: number;
    consume?: ResponseConsumer<T>;
  } = {},
): Promise<{ response: Response; body: T }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= TOKEN_MINT_MAX_ATTEMPTS; attempt += 1) {
    // Response and body are one atomic attempt result. Do not let a later
    // timeout pair fresh headers with a previous transient response body.
    let response: Response | undefined;
    let body: T | undefined;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      attemptTimeoutMs,
    );
    try {
      response = await request(url, { ...init, signal: controller.signal });
      // Keep the deadline alive through body consumption. fetch() resolves at
      // headers, so clearing it earlier still lets a stalled text/json body
      // consume the serverless function until Vercel kills the route.
      body = await consume(response);
      if (!TRANSIENT_UPSTREAM_STATUSES.has(response.status)) {
        return { response, body };
      }
    } catch (error) {
      lastError = error;
      // A 4xx is authoritative. If its body cannot be consumed in time, do
      // not turn it into a retry storm; surface the route's recoverable 502.
      if (response && response.status >= 400 && response.status < 500) break;
    } finally {
      clearTimeout(timeout);
    }

    if (attempt === TOKEN_MINT_MAX_ATTEMPTS && response && body !== undefined) {
      return { response, body };
    }

    if (attempt < TOKEN_MINT_MAX_ATTEMPTS) {
      await wait(TOKEN_MINT_RETRY_MS * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Sandbox orchestrator is not reachable");
}

/**
 * POST /api/sandbox/[id]/access-tokens
 *
 * Mint a short-lived **bearer token** scoped to a single sandbox so the
 * browser can talk directly to the orchestrator's per-sandbox proxy
 * (`SandboxResponse.proxy_url`). This is the auth half of "sandbox-mode AI"
 * — the URL half lives on `serverOverrideUrl` in `instanceUIState`.
 *
 * What this route does (and ONLY this):
 *   1. Authenticate the caller against Supabase + verify ownership of
 *      the sandbox row (`sandbox_instances.user_id`).
 *   2. Forward to `POST {orchestrator}/sandboxes/{sandbox_id}/access-tokens`
 *      with the master `X-API-Key`. Body:
 *         { scopes: ["ai"], actor: { user_id, email } }
 *   3. Return the orchestrator's response verbatim — typically:
 *         { token, exp, jti, scopes }
 *
 * The caller (e.g. `useSandboxAccessToken`) caches the token in memory
 * for `(exp - 30s)` and refreshes lazily on next use. The browser then
 * sends `Authorization: Bearer <token>` directly to `${proxy_url}/...`.
 *
 * Why this is opt-in (not generic):
 *   - These tokens are deliberately scoped (one sandbox, one capability
 *     bundle, ≤ 15 min). Master `X-API-Key` never leaves the server.
 *   - Tier-aware: routes to the EC2 or hosted orchestrator based on the
 *     sandbox row's `config.tier`.
 *
 * Body (optional):
 *   { scopes?: string[], single_use?: boolean, ttl_seconds?: number }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // 1) Auth + ownership + tier resolution in one shot.
    const lookup = await lookupSandboxAndOrchestrator(id);
    if (lookup.ok === false) {
      const { error, status } = lookup;
      return NextResponse.json({ error }, { status });
    }

    if (!["ready", "running", "starting"].includes(lookup.status)) {
      return NextResponse.json(
        { error: `Sandbox is not running (status: ${lookup.status})` },
        { status: 409 },
      );
    }

    // Fail fast (and loudly) when the per-tier orchestrator API key isn't
    // configured. Without it the orchestrator rejects the mint with a
    // 401/403 and the FE just sees `Bearer token: (none)` with no clue
    // which env var to check. Surface the exact var name so admins can
    // fix it in one shot.
    if (!lookup.orchestrator.apiKey) {
      const expectedEnvVar =
        lookup.orchestrator.tier === "hosted"
          ? "MATRX_HOSTED_ORCHESTRATOR_API_KEY"
          : "MATRX_ORCHESTRATOR_API_KEY";
      console.error(
        `[access-tokens] Missing orchestrator API key — set ${expectedEnvVar} on Vercel + locally. Tier: ${lookup.orchestrator.tier}, sandbox: ${lookup.sandboxId}`,
      );
      return NextResponse.json(
        {
          error: "Sandbox orchestrator API key is not configured",
          details: `Set ${expectedEnvVar} in your environment (Vercel + local .env). This is the master X-API-Key used to mint sandbox bearer tokens. Note: MATRX_ACCESS_TOKEN_SECRET is the orchestrator's HMAC signing secret (Python side) — it does not authenticate Next.js → orchestrator calls.`,
          tier: lookup.orchestrator.tier,
          expectedEnvVar,
        },
        { status: 500 },
      );
    }

    // We need the user record for the actor block — the orchestrator's
    // audit log keys on it. lookupSandboxAndOrchestrator already
    // verified ownership; we just re-read for email + id.
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 },
      );
    }

    // 2) Parse + clamp scopes. Default to ["ai"] which is the only
    //    scope we currently use; broader sets are reserved for future
    //    direct-from-browser routes.
    const body = await request.json().catch(() => ({}));
    const requestedScopes = Array.isArray(body?.scopes)
      ? (body.scopes as unknown[]).filter(
          (s): s is string => typeof s === "string" && s.length > 0,
        )
      : ["ai"];
    const scopes = requestedScopes.length > 0 ? requestedScopes : ["ai"];
    const singleUse = body?.single_use === true;
    const ttlSeconds =
      typeof body?.ttl_seconds === "number" ? body.ttl_seconds : undefined;

    // 3) Forward to the orchestrator hosting this sandbox's tier.
    let mint: { response: Response; body: unknown };
    try {
      mint = await mintAccessTokenWithRetry(
        `${lookup.orchestrator.url}/sandboxes/${lookup.sandboxId}/access-tokens`,
        {
          method: "POST",
          headers: orchestratorJsonHeaders(lookup.orchestrator),
          body: JSON.stringify({
            scopes,
            single_use: singleUse,
            ...(ttlSeconds !== undefined ? { ttl_seconds: ttlSeconds } : {}),
            actor: {
              user_id: user.id,
              email: user.email ?? null,
            },
          }),
        },
        {
          consume: async (response) =>
            response.ok ? response.json() : response.text(),
        },
      );
    } catch (fetchError) {
      console.error(
        "Orchestrator access-tokens connection failed:",
        fetchError,
      );
      return NextResponse.json(
        { error: "Sandbox orchestrator is not reachable" },
        { status: 502 },
      );
    }

    if (!mint.response.ok) {
      const errBody = mint.body;
      console.error(
        "Orchestrator access-tokens mint failed:",
        mint.response.status,
        errBody,
      );
      return NextResponse.json(
        { error: "Failed to mint sandbox access token", details: errBody },
        { status: mint.response.status >= 500 ? 502 : mint.response.status },
      );
    }

    const tokenPayload = mint.body;
    if (!isJsonObject(tokenPayload)) {
      // A 200 that is not a JSON object is a broken orchestrator contract, not
      // a token. Say so instead of spreading a non-object into the response.
      console.error(
        "Orchestrator access-tokens returned a non-object success body:",
        tokenPayload,
      );
      return NextResponse.json(
        { error: "Sandbox orchestrator returned a malformed access token" },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ...tokenPayload,
      sandbox_id: lookup.sandboxId,
      tier: lookup.orchestrator.tier,
    });
  } catch (error) {
    console.error("Sandbox access-tokens API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
