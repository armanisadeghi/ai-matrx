import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  lookupSandboxAndOrchestrator,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";
import { decorateSandboxRow } from "@/lib/sandbox/decorate-sandbox-row";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    const { data, error } = await supabase
      .from("sandbox_instances")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Sandbox instance not found" },
          { status: 404 },
        );
      }
      console.error("Error fetching sandbox instance:", error);
      return NextResponse.json(
        { error: "Failed to fetch sandbox instance", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ instance: decorateSandboxRow(data) });
  } catch (error) {
    console.error("Sandbox detail API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/sandbox/[id]
 *
 * Body:
 *   { action: "stop" | "extend", ttl_seconds?: number }
 *
 * 'stop'   → calls orchestrator DELETE ?graceful=true, marks DB stopped.
 * 'extend' → DEPRECATED, use POST /api/sandbox/[id]/extend instead.
 *            For backward compatibility this still works but now correctly
 *            forwards to the orchestrator (the prior version only updated
 *            the DB, which silently drifted from the container's TTL).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    const lookup = await lookupSandboxAndOrchestrator(id);
    if (lookup.ok === false) {
      const { error, status } = lookup;
      return NextResponse.json({ error }, { status });
    }

    const supabase = await createClient();

    if (action === "stop") {
      try {
        const resp = await fetch(
          `${lookup.orchestrator.url}/sandboxes/${lookup.sandboxId}?graceful=true`,
          {
            method: "DELETE",
            headers: orchestratorJsonHeaders(lookup.orchestrator),
          },
        );
        if (!resp.ok && resp.status !== 404) {
          console.error("Orchestrator stop failed:", resp.status);
        }
      } catch (fetchErr) {
        console.warn(
          "Orchestrator not reachable during stop — updating DB only:",
          fetchErr instanceof Error ? fetchErr.message : fetchErr,
        );
      }

      const { data: updated, error: updateError } = await supabase
        .from("sandbox_instances")
        .update({
          status: "stopped",
          stopped_at: new Date().toISOString(),
          stop_reason: "user_requested",
        })
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating sandbox instance:", updateError);
        return NextResponse.json(
          {
            error: "Failed to update sandbox status",
            details: updateError.message,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({ instance: decorateSandboxRow(updated) });
    }

    if (action === "extend") {
      // Forward to the orchestrator first, then mirror its authoritative
      // expires_at into our DB. The previous DB-only path silently drifted
      // because the orchestrator runs its own clock for idle/expiry sweeps.
      const ttlSeconds = Number(body?.ttl_seconds ?? 3600);
      if (
        !Number.isFinite(ttlSeconds) ||
        ttlSeconds < 60 ||
        ttlSeconds > 86400
      ) {
        return NextResponse.json(
          { error: "ttl_seconds must be between 60 and 86400" },
          { status: 400 },
        );
      }

      let resp: Response;
      try {
        resp = await fetch(
          `${lookup.orchestrator.url}/sandboxes/${lookup.sandboxId}/extend`,
          {
            method: "POST",
            headers: orchestratorJsonHeaders(lookup.orchestrator),
            body: JSON.stringify({ ttl_seconds: ttlSeconds }),
          },
        );
      } catch (fetchErr) {
        console.error("Orchestrator extend connection failed:", fetchErr);
        return NextResponse.json(
          { error: "Sandbox orchestrator is not reachable" },
          { status: 502 },
        );
      }

      if (!resp.ok) {
        const errBody = await resp.text();
        return NextResponse.json(
          { error: "Failed to extend sandbox", details: errBody },
          { status: resp.status >= 500 ? 502 : resp.status },
        );
      }

      const orchPayload = await resp.json();
      const newExpiresAt =
        orchPayload?.new_expires_at || orchPayload?.expires_at;
      if (!newExpiresAt) {
        return NextResponse.json(
          {
            error:
              "Orchestrator extend returned no expires_at — likely a pre-v0.2.0 stub. " +
              "Update the orchestrator and try again.",
          },
          { status: 502 },
        );
      }

      const { data: updated, error: updateError } = await supabase
        .from("sandbox_instances")
        .update({
          expires_at: newExpiresAt,
          ttl_seconds: ttlSeconds,
        })
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          {
            error: "Failed to mirror extend in DB",
            details: updateError.message,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        instance: decorateSandboxRow(updated),
        orchestrator: orchPayload,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Supported: stop, extend" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Sandbox update API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    if (["creating", "starting", "ready", "running"].includes(lookup.status)) {
      try {
        // purge=true: the orchestrator also soft-deletes the row (sets
        // deleted_at) atomically with the destroy, so the box disappears
        // from every default list even if our own DB update below fails.
        const resp = await fetch(
          `${lookup.orchestrator.url}/sandboxes/${lookup.sandboxId}?graceful=false&purge=true`,
          {
            method: "DELETE",
            headers: orchestratorJsonHeaders(lookup.orchestrator),
          },
        );
        if (!resp.ok && resp.status !== 404) {
          console.error("Orchestrator destroy failed:", resp.status);
        }
      } catch (fetchErr) {
        console.warn(
          "Orchestrator not reachable during delete — removing DB record only:",
          fetchErr instanceof Error ? fetchErr.message : fetchErr,
        );
      }
    }

    const supabase = await createClient();
    const { error: deleteError } = await supabase
      .from("sandbox_instances")
      .update({
        deleted_at: new Date().toISOString(),
        status: "stopped",
        stopped_at:
          lookup.status !== "stopped" ? new Date().toISOString() : undefined,
        stop_reason: "user_requested",
      })
      .eq("id", id);

    if (deleteError) {
      console.error("Error soft-deleting sandbox instance:", deleteError);
      return NextResponse.json(
        {
          error: "Failed to delete sandbox instance",
          details: deleteError.message,
        },
        { status: 500 },
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Sandbox delete API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
