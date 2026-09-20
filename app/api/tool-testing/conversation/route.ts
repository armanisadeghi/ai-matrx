/**
 * Tool Testing — Conversation API
 *
 * POST /api/tool-testing/conversation
 *   Creates a real placeholder conversation in `chat.conversation` for use in
 *   tool testing, owned by the authenticated user.
 *
 *   Auth: Reads Bearer token from Authorization header (public route pattern).
 *   The insert runs on the CALLER's token, so RLS applies — no admin client.
 *
 *   Returns: { conversation_id: string, user_id: string }
 *
 * 2026-07-25: was writing the retired `conversations` + `conversation_participants`
 * tables through the deprecated-table shim, which throws — every "create
 * conversation" in the tool-testing harness failed with "Deprecated table
 * access", blocking tool execution entirely. Now on the canonical
 * `chat.conversation` (participants table no longer exists; ownership is
 * `created_by` + the org).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/utils/supabase/env";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

// API keys: ONLY sb_publishable_* / sb_secret_*. Legacy JWT keys are DEPRECATED
// and BANNED — see https://supabase.com/docs/guides/getting-started/api-keys
const supabaseUrl = requireEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const supabasePublishableKey = requireEnv(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

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
    } = await getClaimsUser(authClient, token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "auth_required", message: "Invalid or expired token" },
        { status: 401 },
      );
    }

    const userId = user.id;

    // 🚨 THE TEST CONVERSATION IS FILED IN THE ORGANIZATION THE CALLER IS
    // ACTING IN. It used to resolve the session's PERSONAL organization, so a
    // tool test run inside a team's workspace left its conversation in a
    // private one. The caller states the organization on `X-Organization-Id`;
    // the insert runs on their own RLS-scoped client, so a header naming an
    // organization they are not in fails the policy.
    // common-docs/policies/context-is-carried-never-rebuilt.md rule 4.
    const organizationId = request.headers.get("X-Organization-Id")?.trim() ?? "";
    if (organizationId.length === 0) {
      return NextResponse.json(
        {
          message:
            "No organization was named for this test conversation, so nothing was created. Choose the organization you are working in and try again.",
          code: "organization_context_required",
        },
        { status: 400 },
      );
    }

    const { data: conversation, error: convError } = await authClient
      .schema("chat")
      .from("conversation")
      .insert({
        title: `Tool Test — ${new Date().toISOString()}`,
        created_by: userId,
        organization_id: organizationId,
        source_app: "matrx-frontend",
        source_feature: "tool-testing",
        is_ephemeral: true,
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
