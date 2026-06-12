import { NextRequest, NextResponse } from "next/server";
import {
  lookupSandboxAndOrchestrator,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";

/**
 * POST /api/sandbox/[id]/access
 *
 * Generates a one-time Ed25519 keypair, injects the public half into the
 * container, and returns the private half for direct human SSH. The orchestrator
 * never stores the private key.
 *
 * Tier-aware: routes to the correct orchestrator based on the sandbox row's
 * config.tier.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const lookup = await lookupSandboxAndOrchestrator(id);
    if (lookup.ok === false) {
      const { error, status } = lookup;
      return NextResponse.json({ error }, { status });
    }

    if (!["ready", "running"].includes(lookup.status)) {
      return NextResponse.json(
        { error: `Sandbox is not running (status: ${lookup.status})` },
        { status: 409 },
      );
    }

    try {
      const resp = await fetch(
        `${lookup.orchestrator.url}/sandboxes/${lookup.sandboxId}/access`,
        {
          method: "POST",
          headers: orchestratorJsonHeaders(lookup.orchestrator),
          // Bounded: an orchestrator hang must surface as our structured 502
          // below — NOT as Vercel's plain-text runtime-timeout page, which
          // breaks every JSON-parsing client (observed 2026-06-10, 504 on
          // this route → "Unexpected token 'A'… is not valid JSON" in the UI).
          signal: AbortSignal.timeout(25_000),
        },
      );

      if (!resp.ok) {
        const errBody = await resp.text();
        console.error(
          "Orchestrator access request failed:",
          resp.status,
          errBody,
        );
        return NextResponse.json(
          { error: "Failed to generate SSH access", details: errBody },
          { status: resp.status >= 500 ? 502 : resp.status },
        );
      }

      const result = await resp.json();
      // Augment the orchestrator response with the orchestrator-level sandbox_id
      // so the frontend can build a correct key filename and SSH command.
      return NextResponse.json({ ...result, sandbox_id: lookup.sandboxId });
    } catch (fetchError) {
      console.error("Orchestrator connection failed:", fetchError);
      const timedOut =
        fetchError instanceof Error &&
        (fetchError.name === "TimeoutError" ||
          fetchError.name === "AbortError");
      return NextResponse.json(
        {
          error: timedOut
            ? "The sandbox orchestrator timed out generating SSH credentials — try again."
            : "Sandbox orchestrator is not reachable",
        },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("Sandbox access API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
