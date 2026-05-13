/**
 * GET /api/admin/feedback/assignable-admins
 *
 * Returns the list of admins that a feedback item can be assigned to.
 *
 * Gating is enforced at the database layer by the SECURITY DEFINER RPC
 * `public.admin_list_for_assignment()`, which raises `Forbidden: Admin required`
 * for non-admin callers. We surface that as a 403 here.
 *
 * Shape: { admins: Array<{ user_id, email, display_name, level }> }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { FeedbackAssignableAdmin } from "@/types/feedback.types";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("admin_list_for_assignment");

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("Forbidden") || msg.toLowerCase().includes("admin")) {
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 },
        );
      }
      console.error("[assignable-admins] RPC error:", error);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const admins: FeedbackAssignableAdmin[] = (data ?? []).map((row) => ({
      user_id: row.user_id,
      email: row.email,
      display_name: row.display_name,
      level: row.level,
    }));

    return NextResponse.json({ admins });
  } catch (err) {
    console.error("[assignable-admins] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
