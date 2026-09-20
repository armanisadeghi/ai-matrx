/**
 * POST /api/sandbox/reconcile
 *
 * Authenticated. For the calling user, sweeps every Supabase
 * `sandbox_instances` row in {creating, starting, ready, running} and asks
 * the matching orchestrator whether the sandbox actually still exists. Rows
 * the orchestrator no longer knows about are marked status='destroyed' so
 * they stop counting toward the 5-active-sandbox limit.
 *
 * Returns a summary suitable for surfacing in the UI ("freed N slots") and
 * for debugging via curl.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { reconcileUserSandboxes } from "@/lib/sandbox/reconcile";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await getClaimsUser(supabase);

    if (userError || !user) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 },
      );
    }

    const result = await reconcileUserSandboxes(user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Sandbox reconcile API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
