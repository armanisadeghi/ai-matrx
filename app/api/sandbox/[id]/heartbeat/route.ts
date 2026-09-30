import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  lookupSandboxAndOrchestrator,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";
import { extractErrorMessage } from "@/utils/errors";
import { tryWriteOne } from "@/utils/supabase/writeOne";

/**
 * POST /api/sandbox/[id]/heartbeat
 *
 * Marks a sandbox as alive. The orchestrator records `last_heartbeat_at` and
 * keeps the container in 'running' state. Frontend mirrors the same column in
 * Postgres so UI sees fresh activity timestamps without an extra round-trip.
 *
 * Use case: editor sends one of these every ~60s while a sandbox is the
 * active backend, so the orchestrator's idle-shutdown sweep doesn't reap it.
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

    let resp: Response;
    try {
      resp = await fetch(
        `${lookup.orchestrator.url}/sandboxes/${lookup.sandboxId}/heartbeat`,
        {
          method: "POST",
          headers: orchestratorJsonHeaders(lookup.orchestrator),
        },
      );
    } catch (fetchError) {
      console.error("Orchestrator heartbeat connection failed:", fetchError);
      return NextResponse.json(
        { error: "Sandbox orchestrator is not reachable" },
        { status: 502 },
      );
    }

    if (!resp.ok) {
      const errBody = await resp.text();
      return NextResponse.json(
        { error: "Heartbeat failed", details: errBody },
        { status: resp.status >= 500 ? 502 : resp.status },
      );
    }

    // Mirror the heartbeat in our DB so listing queries see fresh activity.
    const supabase = await createClient();
    const { error: landError } = await tryWriteOne(
      supabase
        .from("sandbox_instances")
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq("id", id)
        .select("id"),
      { action: "update", noun: "sandbox heartbeat" },
    );
    if (landError) {
      // Best-effort bookkeeping; a write that did not land is still said.
      console.error("[write-did-not-land] sandbox heartbeat:", landError.message);
    }

    const orchestratorPayload = await resp.json().catch(() => ({}));
    return NextResponse.json({
      acknowledged: true,
      orchestrator: orchestratorPayload,
    });
  } catch (error) {
    console.error("Sandbox heartbeat API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: extractErrorMessage(error, "Unknown error"),
      },
      { status: 500 },
    );
  }
}
