/**
 * POST /api/sandbox/[id]/probe
 *
 * Pre-flight check for a single sandbox row. Asks the orchestrator whether
 * the underlying container actually still exists, and — if it doesn't —
 * marks the Supabase row destroyed in place so the next list refresh hides
 * the orphan.
 *
 * The Sandboxes panel calls this on every "connect to sandbox" click so the
 * user gets an immediate, accurate failure mode instead of the chat path's
 * surrogate "Conversation not found" 404.
 *
 * Three-state response (matches `SandboxProbeResult.aliveness`):
 *
 *   - `alive`        → orchestrator confirmed the sandbox is still there.
 *                      Connect normally.
 *   - `gone`         → orchestrator returned 404 (or a terminal status).
 *                      Row was just marked destroyed; do NOT connect; tell
 *                      the user the sandbox no longer exists.
 *   - `unreachable`  → network blip / orchestrator down. Don't touch the
 *                      row, let the user retry; we still allow connect
 *                      since the row may genuinely be alive.
 *
 * Server-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { probeAndReconcileSandboxRow } from "@/lib/sandbox/reconcile";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    const { data: row, error } = await supabase
      .from("sandbox_instances")
      .select("id, sandbox_id, status, config, tier")
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .single();

    if (error || !row) {
      return NextResponse.json(
        { error: "Sandbox instance not found" },
        { status: 404 },
      );
    }

    const result = await probeAndReconcileSandboxRow(supabase, row, user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Sandbox probe API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
