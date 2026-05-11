/**
 * Tool Testing — Conversation API
 *
 * POST /api/tool-testing/conversation
 *   Creates a real placeholder conversation in the `conversations` table
 *   for use in tool testing. The authenticated user is set as both `created_by`
 *   and the sole participant.
 *
 *   Auth: Reads Bearer token from Authorization header (public route pattern).
 *
 *   Returns: { conversation_id: string, user_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/adminClient";

// API keys: ONLY sb_publishable_* / sb_secret_*. Legacy JWT keys are DEPRECATED
// and BANNED — see https://supabase.com/docs/guides/getting-started/api-keys
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim();

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

    const userId = user.id;

    const adminClient = createAdminClient();

    const { data: conversation, error: convError } = await adminClient
      .from("conversations")
      .insert({
        type: "direct",
        name: `Tool Test — ${new Date().toISOString()}`,
        created_by: userId,
      })
      .select("id")
      .single();

    if (convError || !conversation) {
      console.error("[ToolTest] Failed to create conversation:", convError);
      return NextResponse.json(
        {
          error: "db_error",
          message: convError?.message ?? "Failed to create conversation",
        },
        { status: 500 },
      );
    }

    const { error: participantError } = await adminClient
      .from("conversation_participants")
      .insert({
        conversation_id: conversation.id,
        user_id: userId,
        role: "owner",
      });

    if (participantError) {
      await adminClient
        .from("conversations")
        .delete()
        .eq("id", conversation.id);
      console.error("[ToolTest] Failed to add participant:", participantError);
      return NextResponse.json(
        { error: "db_error", message: participantError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      conversation_id: conversation.id,
      user_id: userId,
    });
  } catch (error) {
    console.error("[ToolTest] Unexpected error:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Internal server error" },
      { status: 500 },
    );
  }
}
