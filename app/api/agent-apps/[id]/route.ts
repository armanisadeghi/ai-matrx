import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = (await createClient()) as unknown as any;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .schema("app")
      .from("definition")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Agent app not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: "Failed to fetch agent app" },
        { status: 500 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/agent-apps/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
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
    const supabase = (await createClient()) as unknown as any;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const { data, error } = await supabase
      .schema("app")
      .from("definition")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to update agent app" },
        { status: 500 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("PATCH /api/agent-apps/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
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
    const supabase = (await createClient()) as unknown as any;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up the row to decide which deletion path applies.
    // Select both created_by (canonical) and user_id (bridge) — global rows
    // have user_id = null (the original global marker); created_by may be set.
    const { data: existing, error: fetchError } = await supabase
      .schema("app")
      .from("definition")
      .select("id, user_id, created_by")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json(
        { error: "Failed to look up agent app", details: fetchError.message },
        { status: 500 },
      );
    }
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Global apps were created with user_id = null (system scope marker).
    const isGlobal = existing.user_id === null;
    if (isGlobal) {
      // Global (system-scope) apps can only be deleted by admins. Use the
      // admin client so RLS doesn't block the destructive write.
      const { checkIsSuperAdmin } = await import(
        "@/utils/supabase/userSessionData"
      );
      const isAdmin = await checkIsSuperAdmin(supabase, user.id);
      if (!isAdmin) {
        return NextResponse.json(
          {
            error: "Forbidden: only admins can delete system agent apps",
          },
          { status: 403 },
        );
      }
      const { createAdminClient } = await import(
        "@/utils/supabase/adminClient"
      );
      const admin = createAdminClient() as unknown as any;
      const { error } = await admin.schema("app").from("definition").delete().eq("id", id);
      if (error) {
        return NextResponse.json(
          { error: "Failed to delete system agent app", details: error.message },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: true });
    }

    // Canonical RLS std_delete checks created_by = auth.uid() — that IS the
    // ownership guard. Add created_by filter explicitly so an accidental
    // mismatch (e.g., shared-edit row) silently deletes 0 rows rather than
    // succeeding. user_id equality is no longer the canonical owner signal.
    const { error } = await supabase
      .schema("app")
      .from("definition")
      .delete()
      .eq("id", id)
      .eq("created_by", user.id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to delete agent app" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/agent-apps/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
