import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { shortcutTable } from "@/lib/supabase/shortcutStorage";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { toGlobalOwnershipWire } from "@/lib/organizations/globalOwnership";
import {
  pickWritableShortcutFields,
  rejectedFieldsMessage,
} from "../writable-fields";

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

    const { data, error } = await shortcutTable(supabase)
      .select("*")
      .is("deleted_at", null)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching agent shortcut:", error);
      return NextResponse.json(
        { error: "Failed to fetch agent shortcut", details: error.message },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Agent shortcut not found" },
        { status: 404 },
      );
    }

    // A system-org row IS global — lib/organizations/globalOwnership.ts.
    return NextResponse.json({
      data: toGlobalOwnershipWire(
        data as { organization_id?: string | null },
        await resolveSystemOrgId(supabase),
      ),
    });
  } catch (error) {
    console.error("Error in GET /api/agent-shortcuts/[id]:", error);
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

    // 🚨 W11-1 — REFUSE, NEVER DROP. This route used to filter the body through
    // a hand-kept allow-list and discard the rest in silence; `value_mappings`,
    // `write_policies`, `surface_name` and `json_extraction` were never on it,
    // so editing a shortcut's bindings answered 200 with the row unchanged and
    // the person's work reverted on reload.
    const { payload: updatePayload, rejected } = pickWritableShortcutFields(
      body as Record<string, unknown>,
    );

    if (rejected.length > 0) {
      console.error(
        "[agent-shortcuts] PATCH refused — unwritable fields in body",
        { id, rejected },
      );
      return NextResponse.json(
        { error: rejectedFieldsMessage(rejected), fields: rejected },
        { status: 400 },
      );
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 },
      );
    }

    const { data, error } = await shortcutTable(supabase)
      .update(updatePayload as never)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("Error updating agent shortcut:", error);
      const status = error.code === "42501" || error.code === "PGRST301" ? 403 : 500;
      return NextResponse.json(
        { error: "Failed to update agent shortcut", details: error.message },
        { status },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Agent shortcut not found or access denied" },
        { status: 404 },
      );
    }

    // A system-org row IS global — lib/organizations/globalOwnership.ts.
    return NextResponse.json({
      data: toGlobalOwnershipWire(
        data as { organization_id?: string | null },
        await resolveSystemOrgId(supabase),
      ),
    });
  } catch (error) {
    console.error("Error in PATCH /api/agent-shortcuts/[id]:", error);
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

    const { error, count } = await shortcutTable(supabase)
      .delete({ count: "exact" })
      .eq("id", id);

    if (error) {
      console.error("Error deleting agent shortcut:", error);
      const status = error.code === "42501" || error.code === "PGRST301" ? 403 : 500;
      return NextResponse.json(
        { error: "Failed to delete agent shortcut", details: error.message },
        { status },
      );
    }

    if (!count) {
      return NextResponse.json(
        { error: "Agent shortcut not found or access denied" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("Error in DELETE /api/agent-shortcuts/[id]:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
