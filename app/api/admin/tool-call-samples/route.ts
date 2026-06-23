/**
 * Admin: tool-call sample loader (super-admin only).
 *
 * Lets the tool-renderer gallery / "in action" page pull REAL persisted tool
 * calls (`cx_tool_call`) for ANY tool, across ALL users — so a renderer can be
 * previewed against genuine data even when we have no hand-written fixture.
 *
 * `cx_tool_call` RLS is per-user (`user_id = auth.uid()` or a shared-conversation
 * viewer), so the browser client only ever sees the signed-in user's own calls.
 * This route bypasses that with the admin client AFTER a hard super-admin gate —
 * read-only, never mutating, gated by `requireSuperAdmin()`.
 *
 * GET ?mode=tools            → recently-used tool names + counts + last_used
 * GET ?tool=<name>&limit=N   → most recent N calls for that tool (default 10, max 25)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { createAdminClient } from "@/utils/supabase/adminClient";

// Columns the renderer needs to rebuild a ToolLifecycleEntry, plus owner context.
const ROW_COLUMNS =
  "id, call_id, tool_name, tool_name_as_called, arguments, output, is_error, error_type, error_message, started_at, completed_at, execution_events, created_at, user_id, conversation_id";

// How many recent rows to scan when aggregating the tool list (bounded).
const TOOL_SCAN_LIMIT = 3000;
const MAX_SAMPLES = 25;

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Access denied";
    const status = message.toLowerCase().includes("unauthorized") ? 401 : 403;
    return NextResponse.json({ error: message }, { status });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const admin = createAdminClient();

  try {
    // ── Discovery: which tools have recent real usage ──────────────────────
    if (mode === "tools") {
      const { data, error } = await admin
        .from("cx_tool_call")
        .select("tool_name, is_error, created_at")
        .not("output", "is", null)
        .order("created_at", { ascending: false })
        .limit(TOOL_SCAN_LIMIT);

      if (error) throw error;

      const byTool = new Map<
        string,
        { tool_name: string; count: number; errors: number; last_used: string }
      >();
      for (const r of data ?? []) {
        const name = (r as { tool_name: string }).tool_name;
        if (!name) continue;
        const existing = byTool.get(name);
        if (existing) {
          existing.count += 1;
          if ((r as { is_error?: boolean }).is_error) existing.errors += 1;
        } else {
          byTool.set(name, {
            tool_name: name,
            count: 1,
            errors: (r as { is_error?: boolean }).is_error ? 1 : 0,
            last_used: (r as { created_at: string }).created_at,
          });
        }
      }
      const tools = Array.from(byTool.values()).sort((a, b) =>
        b.last_used.localeCompare(a.last_used),
      );
      return NextResponse.json({ tools, scanned: data?.length ?? 0 });
    }

    // ── Samples: recent calls for one tool ─────────────────────────────────
    const tool = (searchParams.get("tool") ?? "").trim();
    if (!tool) {
      return NextResponse.json(
        { error: "Provide ?tool=<name> or ?mode=tools" },
        { status: 400 },
      );
    }
    const limit = Math.min(
      MAX_SAMPLES,
      Math.max(1, Number(searchParams.get("limit")) || 10),
    );

    const { data, error } = await admin
      .from("cx_tool_call")
      .select(ROW_COLUMNS)
      .eq("tool_name", tool)
      .not("output", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return NextResponse.json({ tool, rows: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load tool-call samples", details: message },
      { status: 500 },
    );
  }
}
