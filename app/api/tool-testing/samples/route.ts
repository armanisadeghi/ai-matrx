/**
 * Tool Testing — Save Sample API
 *
 * POST /api/tool-testing/samples
 *   Saves a completed tool test execution as a sample record in `tool_test_samples`.
 *   The authenticated user is recorded as `tested_by`.
 *
 *   Auth: Reads Bearer token from Authorization header (public route pattern).
 *
 *   Body: {
 *     tool_name: string
 *     tool_id?: string | null
 *     arguments: Record<string, unknown>
 *     raw_stream_events: unknown[]
 *     final_payload?: unknown
 *     admin_comments?: string | null
 *     is_success?: boolean | null
 *     use_for_component?: boolean
 *   }
 *
 *   Returns: { id: string, tool_name: string, created_at: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/adminClient";

// API keys: ONLY sb_publishable_* / sb_secret_*. Legacy JWT keys are DEPRECATED
// and BANNED — see https://supabase.com/docs/guides/getting-started/api-keys
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim();

interface SaveSampleBody {
  tool_name: string;
  tool_id?: string | null;
  arguments: Record<string, unknown>;
  raw_stream_events: unknown[];
  final_payload?: unknown;
  admin_comments?: string | null;
  is_success?: boolean | null;
  use_for_component?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "auth_required", message: "Not authenticated" },
        { status: 401 },
      );
    }

    const token = authHeader.slice(7);

    const authClient = createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "auth_required", message: "Invalid or expired token" },
        { status: 401 },
      );
    }

    const body: SaveSampleBody = await request.json();

    if (!body.tool_name || typeof body.tool_name !== "string") {
      return NextResponse.json(
        { error: "validation_error", message: "tool_name is required" },
        { status: 400 },
      );
    }

    if (!body.arguments || typeof body.arguments !== "object") {
      return NextResponse.json(
        { error: "validation_error", message: "arguments must be an object" },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.raw_stream_events)) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: "raw_stream_events must be an array",
        },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from("tl_test_sample")
      .insert({
        tool_name: body.tool_name,
        tool_id: body.tool_id ?? null,
        tested_by: user.id,
        arguments: body.arguments,
        raw_stream_events: body.raw_stream_events,
        final_payload: body.final_payload ?? null,
        admin_comments: body.admin_comments ?? null,
        is_success: body.is_success ?? null,
        use_for_component: body.use_for_component ?? false,
      })
      .select("id, tool_name, created_at")
      .single();

    if (error || !data) {
      console.error("[ToolTest/Samples] Insert failed:", error);
      return NextResponse.json(
        {
          error: "db_error",
          message: error?.message ?? "Failed to save sample",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("[ToolTest/Samples] Unexpected error:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Internal server error" },
      { status: 500 },
    );
  }
}
