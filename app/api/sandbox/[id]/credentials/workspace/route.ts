import { NextRequest, NextResponse } from "next/server";
import {
  resolveProxyContext,
  forwardToOrchestrator,
} from "@/lib/sandbox/proxy-helpers";

/**
 * POST /api/sandbox/[id]/credentials/workspace
 *
 * One-click bootstrap that wires the sandbox's git credential helper using the
 * server-side `MATRX_SANDBOX_GH_TOKEN`. This token is the same PAT the deploy
 * route already trusts, so reusing it is a stated workspace-administrator
 * decision — never returned to the client, never logged.
 *
 * Body (optional): `{ scope?: "read" | "write" }`. Defaults to "write".
 *
 * Returns 412 (Precondition Failed) if the token isn't configured on the
 * server — the UI surfaces this so the user knows to set the env var.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const token =
    process.env.MATRX_SANDBOX_GH_TOKEN || process.env.GITHUB_TOKEN || "";
  if (!token) {
    return NextResponse.json(
      {
        error: "Workspace GitHub token not configured",
        details:
          "Set MATRX_SANDBOX_GH_TOKEN on the server to enable one-click git auth.",
      },
      { status: 412 },
    );
  }

  let scope: "read" | "write" = "write";
  try {
    const body = (await request.clone().json().catch(() => ({}))) as {
      scope?: "read" | "write";
    };
    if (body?.scope === "read" || body?.scope === "write") {
      scope = body.scope;
    }
  } catch {
    /* empty body is fine */
  }

  const ctx = await resolveProxyContext(id);
  if (!ctx.ok) return ctx.response;

  // Re-build the request with the server-injected token so the orchestrator
  // sees the same { kind, token, scope } shape it accepts from the manual
  // CredentialsModal flow. We pass the token through `forwardToOrchestrator`
  // exactly once and discard the inbound body.
  const upstreamUrl = `${ctx.orchestrator.url}/sandboxes/${ctx.sandboxId}/credentials`;
  const synthetic = new NextRequest(upstreamUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "github", token, scope }),
  });

  return forwardToOrchestrator(
    synthetic,
    upstreamUrl,
    ctx.orchestrator,
    { timeoutMs: 30_000 },
  );
}
