/**
 * POST /api/sandbox/[id]/migrate
 *
 * Owner-gated proxy for the orchestrator's zero-drift migration. It keeps the
 * sandbox identity and persistent workspace; reset is intentionally a separate
 * recovery action and is never used to claim an image update.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  lookupSandboxAndOrchestrator,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const lookup = await lookupSandboxAndOrchestrator(id);
  if (lookup.ok === false) {
    return NextResponse.json({ error: lookup.error }, { status: lookup.status });
  }

  let response: Response;
  try {
    response = await fetch(`${lookup.orchestrator.url}/sandboxes/${lookup.sandboxId}/migrate`, {
      method: "POST",
      headers: orchestratorJsonHeaders(lookup.orchestrator),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Sandbox update could not reach the orchestrator", details: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }

  const payloadText = await response.text();
  let payload: unknown = { body: payloadText };
  try {
    payload = JSON.parse(payloadText) as unknown;
  } catch {
    // Preserve the upstream non-JSON body for the caller's error detail.
  }
  if (response.status === 404 || response.status === 405) {
    return NextResponse.json(
      { error: "This sandbox manager does not support in-place image updates yet." },
      { status: 501 },
    );
  }
  if (!response.ok) {
    return NextResponse.json(
      { error: "Sandbox image update failed", upstream_status: response.status, details: payload },
      { status: response.status >= 500 ? 502 : response.status },
    );
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !(
      "sandbox_id" in payload &&
      typeof payload.sandbox_id === "string" &&
      payload.sandbox_id === lookup.sandboxId
    )
  ) {
    return NextResponse.json(
      { error: "Sandbox manager returned an update result for a different sandbox." },
      { status: 502 },
    );
  }
  return NextResponse.json(payload);
}
