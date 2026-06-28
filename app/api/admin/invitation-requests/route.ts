import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";

/**
 * GET /api/admin/invitation-requests
 * Get all invitation requests with filtering
 */
export async function GET(request: Request) {
  try {
    // Verify admin access
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 }
      );
    }

    // Highest-bar gate: Super Admin only.
    const adminSupabase = createAdminClient();
    const isSuperAdmin = await checkIsSuperAdmin(adminSupabase, authUser.id);

    if (!isSuperAdmin) {
      return NextResponse.json(
        { success: false, msg: "Forbidden - Super Admin access required" },
        { status: 403 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build query
    let query = adminSupabase
      .schema("users").from("invitation_requests")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data: requests, error, count } = await query;

    if (error) {
      console.error("Error fetching invitation requests:", error);
      return NextResponse.json(
        { success: false, msg: "Failed to fetch requests" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: requests,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/admin/invitation-requests:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to fetch requests" },
      { status: 500 }
    );
  }
}
