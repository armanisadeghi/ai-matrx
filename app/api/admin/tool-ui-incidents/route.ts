import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { requireAdmin } from "@/utils/auth/adminUtils";

function authErrorResponse(error: unknown): NextResponse | null {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Unauthorized")) {
    return NextResponse.json({ error: message }, { status: 401 });
  }
  if (message.startsWith("Forbidden")) {
    return NextResponse.json({ error: message }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    // tool_ui_incident is RLS-protected; admin listing uses the admin client.
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const toolName = searchParams.get("tool_name");
    const unresolvedOnly = searchParams.get("unresolved_only");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    let query = supabase
      .from("tool_ui_incident")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (toolName) {
      query = query.eq("tool_name", toolName);
    }
    if (unresolvedOnly === "true") {
      query = query.eq("resolved", false);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch incidents", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      incidents: data || [],
      count: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
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
 * POST - Report a new incident.
 * This endpoint is called by the client-side incident reporter.
 * No auth required (incidents come from anonymous browsing sessions too).
 */
export async function POST(request: NextRequest) {
  try {
    // Intentionally ungated: incidents are reported from anonymous browsing
    // sessions. The admin client is required so anon inserts bypass RLS.
    const supabase = createAdminClient();
    const body = await request.json();

    const { tool_name, component_type, error_type, error_message } = body;
    if (!tool_name || !component_type || !error_type || !error_message) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: tool_name, component_type, error_type, error_message",
        },
        { status: 400 },
      );
    }

    const incidentData = {
      tool_name: body.tool_name,
      component_id: body.component_id || null,
      component_type: body.component_type,
      error_type: body.error_type,
      error_message: String(body.error_message).slice(0, 5000),
      error_stack: body.error_stack
        ? String(body.error_stack).slice(0, 10000)
        : null,
      tool_update_snapshot: body.tool_update_snapshot || null,
      component_version: body.component_version || null,
      browser_info: body.browser_info || null,
      session_id: body.session_id || null,
    };

    const { data, error } = await supabase
      .from("tool_ui_incident")
      .insert([incidentData])
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to create incident", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { message: "Incident reported", incident: data },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
