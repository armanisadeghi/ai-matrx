import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const BLOCK_UPDATE_FIELDS = [
  "block_id",
  "category_id",
  "label",
  "description",
  "icon_name",
  "template",
  "sort_order",
  "is_active",
  "user_id",
  "organization_id",
  "project_id",
  "task_id",
] as const;

function pickUpdateFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of BLOCK_UPDATE_FIELDS) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("content_blocks")
      .select("*")
      .is("deleted_at", null)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching content block:", error);
      return NextResponse.json(
        { error: "Failed to fetch content block", details: error.message },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Content block not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in GET /api/agent-content-blocks/[id]:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 },
      );
    }

    const updatePayload = pickUpdateFields(body);

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("content_blocks")
      .update(updatePayload as never)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("Error updating content block:", error);
      const status = error.code === "42501" || error.code === "PGRST301" ? 403 : 500;
      return NextResponse.json(
        { error: "Failed to update content block", details: error.message },
        { status },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Content block not found or access denied" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in PATCH /api/agent-content-blocks/[id]:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error, count } = await supabase
      .from("content_blocks")
      .delete({ count: "exact" })
      .eq("id", id);

    if (error) {
      console.error("Error deleting content block:", error);
      const status = error.code === "42501" || error.code === "PGRST301" ? 403 : 500;
      return NextResponse.json(
        { error: "Failed to delete content block", details: error.message },
        { status },
      );
    }

    if (!count) {
      return NextResponse.json(
        { error: "Content block not found or access denied" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("Error in DELETE /api/agent-content-blocks/[id]:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
