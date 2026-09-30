/**
 * POST /api/sandbox/[id]/reset
 *
 * Auth: Supabase user, must own the sandbox row.
 *
 * Forwards to the orchestrator's POST /sandboxes/{sandbox_id}/reset?wipe_volume=...
 * which destroys + recreates the container with the same params (template,
 * tier, resources, ttl). Returns a NEW orchestrator sandbox_id; we mirror it
 * into the same Postgres row so the FE keeps its existing reference (the row's
 * UUID `id`) and just sees an updated `sandbox_id` / `status` / `expires_at`.
 *
 * Body:
 *   { wipe_volume?: boolean }   // default false — preserves /home/agent volume
 *
 * Returns: { instance, orchestrator }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  lookupSandboxAndOrchestrator,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";
import { writeOneRow } from "@/utils/supabase/writeOne";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const lookup = await lookupSandboxAndOrchestrator(id);
    if (lookup.ok === false) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }

    const body = await request.json().catch(() => ({}));
    const wipeVolume = body?.wipe_volume === true;

    const url = `${lookup.orchestrator.url}/sandboxes/${lookup.sandboxId}/reset?wipe_volume=${wipeVolume ? "true" : "false"}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: orchestratorJsonHeaders(lookup.orchestrator),
        signal: AbortSignal.timeout(60_000),
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

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: "Reset failed", upstream_status: resp.status, body: text },
        { status: resp.status >= 500 ? 502 : resp.status },
      );
    }

    const newSandbox = await resp.json();
    if (!newSandbox?.sandbox_id) {
      return NextResponse.json(
        { error: "Orchestrator returned no sandbox_id on reset", body: newSandbox },
        { status: 502 },
      );
    }

    // Mirror the new orchestrator state into the same Postgres row so the FE
    // doesn't have to swap row references — the row UUID `id` is stable.
    const supabase = await createClient();
    const { data: instance, error: updateError } = await writeOneRow(
      supabase
        .from("sandbox_instances")
        .update({
          sandbox_id: newSandbox.sandbox_id,
          container_id: newSandbox.container_id ?? null,
          status: newSandbox.status ?? "creating",
          expires_at: newSandbox.expires_at ?? null,
          stopped_at: null,
          stop_reason: null,
        })
        .eq("id", id)
        .select(),
      { action: "update", noun: "sandbox instance" },
    );

    if (updateError) {
      console.error("Failed to mirror reset into DB:", updateError);
      return NextResponse.json({
        instance: null,
        orchestrator: newSandbox,
        warning: "Reset succeeded at orchestrator but DB mirror failed — refresh the page",
      });
    }

    return NextResponse.json({ instance, orchestrator: newSandbox });
  } catch (err) {
    console.error("Sandbox reset route error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
