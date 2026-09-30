import { createClient } from "@/utils/supabase/server";
import { hasAdminPower } from "@/utils/auth/adminLaneServer";
import { NextRequest, NextResponse } from "next/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { tryWriteOne, writeFailureStatus, writeOneRow } from "@/utils/supabase/writeOne";

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
    } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .schema("app")
      .from("definition")
      .select("*")
      .is("deleted_at", null)
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
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const { data, error } = await writeOneRow(
      supabase
        .schema("app")
        .from("definition")
        .update(body)
        .eq("id", id)
        .select(),
      { action: "update", noun: "definition" },
    );

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
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Look up the row to decide which deletion path applies. created_by is
    // the canonical owner column; a null there marks a global (system) app.
    const { data: existing, error: fetchError } = await supabase
      .schema("app")
      .from("definition")
      .select("id, created_by")
      .is("deleted_at", null)
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

    // Global apps were created with created_by = null (system scope marker).
    const isGlobal = existing.created_by === null;
    if (isGlobal) {
      // Global (system-scope) apps can only be moved to Trash by admins. Use
      // the admin client so RLS doesn't block the write.
      const isAdmin = await hasAdminPower(supabase, user.id);
      if (!isAdmin) {
        return NextResponse.json(
          {
            error: "Forbidden: only admins can move system agent apps to Trash",
          },
          { status: 403 },
        );
      }
      const { createAdminClient } = await import(
        "@/utils/supabase/adminClient"
      );
      const admin = createAdminClient();
      // Delete means archive (Arman, 2026-09-27): the app moves to Trash and
      // stays restorable; its parts follow via the soft-delete cascade.
      const { error } = await tryWriteOne(
        admin
          .schema("app")
          .from("definition")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id)
          .is("deleted_at", null)
          .select("id, deleted_at"),
        {
          action: "delete",
          noun: "app",
          alreadyDone: {
            reread: () =>
              admin.schema("app").from("definition")
                .select("id, deleted_at")
                .eq("id", id)
                .maybeSingle(),
            isDone: (row) => row.deleted_at != null,
          },
        },
      );
      if (error) {
        return NextResponse.json(
          { error: "Failed to move system agent app to Trash", details: error.message },
          { status: writeFailureStatus(error) },
        );
      }
      return NextResponse.json({ success: true });
    }

    // Delete means archive: the owner moves the app to Trash (restorable).
    // The created_by filter is the ownership guard; the returned rows prove
    // the move landed — RLS answers a refused update with zero rows.
    const { data: moved, error } = await supabase
      .schema("app")
      .from("definition")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("created_by", user.id)
      .is("deleted_at", null)
      .select("id");

    if (error) {
      return NextResponse.json(
        { error: "Failed to move agent app to Trash" },
        { status: 500 },
      );
    }
    if (!moved || moved.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nothing was moved to Trash: only the app's owner can do that. Ask the owner, or reload if it is already in Trash.",
        },
        { status: 403 },
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
