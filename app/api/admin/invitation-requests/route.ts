import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { applyServerTableState } from "@/features/admin/shared/server-table/postgrest";
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";

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
    } = await getClaimsUser(supabase);

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
      .is("deleted_at", null)
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


/**
 * POST /api/admin/invitation-requests
 * Body: { state: MatrxDataTableQueryState } — the Invitations table's search, column filters,
 * sort and page, answered here over EVERY request (never over a page the browser already holds).
 * POST so a searched email never rides in a URL. Returns { success, data, total }.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await getClaimsUser(supabase);
    if (!authUser) {
      return NextResponse.json({ success: false, msg: "Unauthorized" }, { status: 401 });
    }
    const adminSupabase = createAdminClient();
    if (!(await checkIsSuperAdmin(adminSupabase, authUser.id))) {
      return NextResponse.json(
        { success: false, msg: "Forbidden - Super Admin access required" },
        { status: 403 },
      );
    }

    const body = (await request.json()) as { state?: MatrxDataTableQueryState };
    const state = body.state;
    if (!state) {
      return NextResponse.json({ success: false, msg: "Missing table state" }, { status: 400 });
    }
    state.pageSize = Math.min(200, Math.max(1, Number(state.pageSize) || 50));

    const base = adminSupabase
      .schema("users")
      .from("invitation_requests")
      .select("*", { count: "exact" })
      .is("deleted_at", null);
    const { data, error, count } = await applyServerTableState(base, state, {
      searchColumns: ["full_name", "email", "company", "use_case"],
      text: { full_name: "full_name", company: "company", email: "email" },
      select: { user_type: "user_type", status: "status" },
      date: { created_at: "created_at" },
      sort: {
        full_name: "full_name",
        company: "company",
        email: "email",
        user_type: "user_type",
        status: "status",
        created_at: "created_at",
      },
      defaultSort: { column: "created_at", ascending: false },
    });
    if (error) {
      console.error("Error searching invitation requests:", error);
      return NextResponse.json({ success: false, msg: "Failed to fetch requests" }, { status: 500 });
    }
    return NextResponse.json({ success: true, data, total: count ?? 0 });
  } catch (error) {
    console.error("Error in POST /api/admin/invitation-requests:", error);
    return NextResponse.json({ success: false, msg: "Failed to fetch requests" }, { status: 500 });
  }
}
