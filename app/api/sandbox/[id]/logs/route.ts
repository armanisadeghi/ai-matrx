/**
 * GET /api/sandbox/[id]/logs?source=all|docker|aidream|matrx_agent|entrypoint|autostart&tail=N
 *
 * Auth: Supabase user, must own the sandbox row.
 *
 * Forwards to the orchestrator's GET /sandboxes/{sandbox_id}/logs and pipes
 * the plain-text response straight back. The orchestrator reads:
 *   - docker logs <sbx>           → container stdout/stderr
 *   - /var/log/sandbox/api.log    → matrx_agent (FS/git/exec daemon)
 *   - /var/log/sandbox/aidream-server.log    → aidream FastAPI
 *   - /var/log/sandbox/entrypoint.log        → boot trace
 *   - /var/log/sandbox/aidream-autostart.log → aidream auto-start status
 *
 * The FE's SandboxDiagnosticsPanel polls this every few seconds and shows
 * the contents in a code block (or pipes to xterm) so the operator has
 * full live insight into what the sandbox is doing — no black-box.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  lookupSandboxAndOrchestrator,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";

const VALID_SOURCES = new Set([
  "all",
  "docker",
  "aidream",
  "matrx_agent",
  "entrypoint",
  "autostart",
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const lookup = await lookupSandboxAndOrchestrator(id);
    if (lookup.ok === false) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }

    const incomingUrl = new URL(request.url);
    const source = incomingUrl.searchParams.get("source") ?? "all";
    const tailRaw = incomingUrl.searchParams.get("tail") ?? "200";
    if (!VALID_SOURCES.has(source)) {
      return NextResponse.json(
        { error: `Invalid source. Use one of: ${Array.from(VALID_SOURCES).join(", ")}` },
        { status: 400 },
      );
    }
    const tail = Math.max(1, Math.min(5000, Number.parseInt(tailRaw, 10) || 200));

    const url = `${lookup.orchestrator.url}/sandboxes/${lookup.sandboxId}/logs?source=${encodeURIComponent(source)}&tail=${tail}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "GET",
        headers: orchestratorJsonHeaders(lookup.orchestrator),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      return NextResponse.json(
        {
          error: "Orchestrator not reachable",
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 502 },
      );
    }

    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        // No cache — logs change every poll.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    console.error("Sandbox logs route error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
