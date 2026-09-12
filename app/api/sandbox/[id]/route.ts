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
        { error: "Failed to fetch sandbox instance" },
        { status: 500 },
      );
    }

    return NextResponse.json({ instance: decorateSandboxRow(data) });
  } catch (error) {
    console.error("Sandbox detail API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/** Rename a sandbox without changing its immutable routing identity. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { name?: unknown };
    if (typeof body.name !== "string") {
      return NextResponse.json(
        { error: "name must be a string" },
        { status: 400 },
      );
    }

    const name = body.name.trim();
    if (name.length < 1 || name.length > 100) {
      return NextResponse.json(
        { error: "name must be between 1 and 100 characters" },
        { status: 400 },
      );
    }

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
      .update({ name })
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Sandbox instance not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: "Failed to rename sandbox" },
        { status: 500 },
      );
    }

    return NextResponse.json({ instance: decorateSandboxRow(data) });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
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
    const lookup = await lookupSandboxAndOrchestrator(id);
    if (lookup.ok === false) {
      const { error, status } = lookup;
      return NextResponse.json({ error }, { status });
    }

    if (body?.action === "stop") {
      let resp: Response;
      try {
        resp = await fetch(
          `${lookup.orchestrator.url}/sandboxes/${lookup.sandboxId}?graceful=true`,
          {
            method: "DELETE",
            headers: orchestratorJsonHeaders(lookup.orchestrator),
          },
        );
      } catch {
        return NextResponse.json(
          { error: "Sandbox orchestrator is not reachable" },
          { status: 502 },
        );
      }
      if (!resp.ok)
        return NextResponse.json(
          { error: "Sandbox orchestrator request failed" },
          { status: resp.status >= 500 ? 502 : resp.status },
        );
      const supabase = await createClient();
      const { data: fresh, error } = await supabase
        .from("sandbox_instances")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error || !fresh || fresh.status !== "stopped")
        return NextResponse.json(
          {
            error: "Sandbox stopped but persisted state could not be verified",
          },
          { status: 502 },
        );
      return NextResponse.json({ instance: decorateSandboxRow(fresh) });
    }

    if (body?.action === "extend") {
      return NextResponse.json(
        { error: "Use POST /api/sandbox/[id]/extend" },
        { status: 405 },
      );
    }

    return NextResponse.json(
      { error: "Invalid action. Supported: stop, extend" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Sandbox update API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
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

    let resp: Response;
    try {
      resp = await fetch(
        `${lookup.orchestrator.url}/sandboxes/${lookup.sandboxId}?graceful=true&purge=true`,
        {
          method: "DELETE",
          headers: orchestratorJsonHeaders(lookup.orchestrator),
        },
      );
    } catch {
      return NextResponse.json(
        { error: "Sandbox orchestrator is not reachable" },
        { status: 502 },
      );
    }
    if (!resp.ok)
      return NextResponse.json(
        { error: "Sandbox orchestrator request failed" },
        { status: resp.status >= 500 ? 502 : resp.status },
      );
    const supabase = await createClient();
    const { data: stillLive, error } = await supabase
      .from("sandbox_instances")
      .select("id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || stillLive)
      return NextResponse.json(
        {
          error: "Sandbox deleted but persisted deletion could not be verified",
        },
        { status: 502 },
      );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Sandbox delete API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
