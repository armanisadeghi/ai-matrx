import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  lookupSandboxAndOrchestrator,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";

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
    let resp: Response;
    try {
      resp = await fetch(
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

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error(
        "Orchestrator access-tokens mint failed:",
        resp.status,
        errBody,
      );
      return NextResponse.json(
        { error: "Failed to mint sandbox access token", details: errBody },
        { status: resp.status >= 500 ? 502 : resp.status },
      );
    }

    const tokenPayload = await resp.json();
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
