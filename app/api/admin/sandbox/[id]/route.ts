import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";

const ORCHESTRATOR_URL =
  process.env.MATRX_ORCHESTRATOR_URL || "http://54.144.86.132:8000";
const ORCHESTRATOR_API_KEY = process.env.MATRX_ORCHESTRATOR_API_KEY || "";

function orchestratorHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (ORCHESTRATOR_API_KEY) {
    headers["X-API-Key"] = ORCHESTRATOR_API_KEY;
  }
  return headers;
}

async function verifyAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 },
      ),
    };
  }

  const isAdmin = await checkIsSuperAdmin(supabase, user.id);
  if (!isAdmin) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      ),
    };
  }

  return { user, error: null };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { error: authError } = await verifyAdmin(supabase);
    if (authError) return authError;

    // sandbox_instances is RLS-protected; super-admin verified above, use admin client.
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("sandbox_instances")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Sandbox instance not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: "Failed to fetch sandbox instance", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ instance: data });
  } catch (error) {
    console.error("Admin sandbox detail API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { error: authError } = await verifyAdmin(supabase);
    if (authError) return authError;

    const admin = createAdminClient();
    const body = await request.json();
    const { action } = body;

    const { data: instance, error: fetchError } = await admin
      .from("sandbox_instances")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !instance) {
      return NextResponse.json(
        { error: "Sandbox instance not found" },
        { status: 404 },
      );
    }

    if (action === "stop") {
      try {
        const resp = await fetch(
          `${ORCHESTRATOR_URL}/sandboxes/${instance.sandbox_id}?graceful=true`,
          { method: "DELETE", headers: orchestratorHeaders() },
        );
        if (!resp.ok && resp.status !== 404) {
          console.error("Orchestrator stop failed:", resp.status);
        }
      } catch (fetchErr) {
        console.warn(
          "Orchestrator not reachable during stop:",
          fetchErr instanceof Error ? fetchErr.message : fetchErr,
        );
      }

      const { data: updated, error: updateError } = await admin
        .from("sandbox_instances")
        .update({
          status: "stopped",
          stopped_at: new Date().toISOString(),
          stop_reason: "admin",
        })
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          {
            error: "Failed to update sandbox status",
            details: updateError.message,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({ instance: updated });
    }

    if (action === "extend") {
      const additionalSeconds = body.ttl_seconds || 3600;
      const currentExpiry = instance.expires_at
        ? new Date(instance.expires_at)
        : new Date();
      const newExpiry = new Date(
        currentExpiry.getTime() + additionalSeconds * 1000,
      );

      const { data: updated, error: updateError } = await admin
        .from("sandbox_instances")
        .update({
          expires_at: newExpiry.toISOString(),
          ttl_seconds: instance.ttl_seconds + additionalSeconds,
        })
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          {
            error: "Failed to extend sandbox TTL",
            details: updateError.message,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({ instance: updated });
    }

    return NextResponse.json(
      { error: "Invalid action. Supported: stop, extend" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Admin sandbox update API error:", error);
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { error: authError } = await verifyAdmin(supabase);
    if (authError) return authError;

    const admin = createAdminClient();
    const { data: instance, error: fetchError } = await admin
      .from("sandbox_instances")
      .select("sandbox_id, status")
      .eq("id", id)
      .single();

    if (fetchError || !instance) {
      return NextResponse.json(
        { error: "Sandbox instance not found" },
        { status: 404 },
      );
    }

    if (
      ["creating", "starting", "ready", "running"].includes(instance.status)
    ) {
      try {
        const resp = await fetch(
          `${ORCHESTRATOR_URL}/sandboxes/${instance.sandbox_id}?graceful=false`,
          { method: "DELETE", headers: orchestratorHeaders() },
        );
        if (!resp.ok && resp.status !== 404) {
          console.error("Orchestrator destroy failed:", resp.status);
        }
      } catch (fetchErr) {
        console.warn(
          "Orchestrator not reachable during delete:",
          fetchErr instanceof Error ? fetchErr.message : fetchErr,
        );
      }
    }

    const { error: deleteError } = await admin
      .from("sandbox_instances")
      .delete()
      .eq("id", id);

    if (deleteError) {
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
    console.error("Admin sandbox delete API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { error: authError } = await verifyAdmin(supabase);
    if (authError) return authError;

    const admin = createAdminClient();
    const { data: instance, error: fetchError } = await admin
      .from("sandbox_instances")
      .select("sandbox_id, status")
      .eq("id", id)
      .single();

    if (fetchError || !instance) {
      return NextResponse.json(
        { error: "Sandbox instance not found" },
        { status: 404 },
      );
    }

    if (!["ready", "running"].includes(instance.status)) {
      return NextResponse.json(
        { error: `Sandbox is not running (status: ${instance.status})` },
        { status: 409 },
      );
    }

    try {
      const resp = await fetch(
        `${ORCHESTRATOR_URL}/sandboxes/${instance.sandbox_id}/access`,
        { method: "POST", headers: orchestratorHeaders() },
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
      return NextResponse.json(result);
    } catch (fetchError) {
      console.error("Orchestrator connection failed:", fetchError);
      return NextResponse.json(
        { error: "Sandbox orchestrator is not reachable." },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("Admin sandbox access API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
