import { createClient } from "@/utils/supabase/server";
import { catWriteArgs, categoryRow } from "@/lib/db/category-door";
import { NextRequest, NextResponse } from "next/server";
import { applyScopeToInsertPayload } from "../_lib/apply-scope-to-insert";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { toGlobalOwnershipWire } from "@/lib/organizations/globalOwnership";
import {
  coerceLegacyCategoryIsActive,
  platformCategoryToLegacyRow,
  PLATFORM_CATEGORY_SELECT,
  type PlatformCategorySelectRow,
} from "./_lib/categoryRow";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    const scopeId = searchParams.get("scopeId");
    const placementType = searchParams.get("placement_type");
    const isActive = searchParams.get("is_active");

    let query = supabase
      .schema("platform")
      .from("categories")
      .select(PLATFORM_CATEGORY_SELECT)
      .is("deleted_at", null)
      .eq("dimension", "shortcut");

    if (scope === "global") {
      // Global/platform content now lives in the system org (was NULL org).
      query = query
        .eq("organization_id", await resolveSystemOrgId(supabase))
        .is("metadata->>user_id" as never, null)
        .is("metadata->>project_id" as never, null)
        .is("metadata->>task_id" as never, null);
    } else if (scope === "user") {
      query = query.eq("metadata->>user_id" as never, user.id);
    } else if (scope === "organization") {
      if (!scopeId) {
        return NextResponse.json(
          { error: "scopeId is required when scope=organization" },
          { status: 400 },
        );
      }
      query = query.eq("organization_id", scopeId);
    } else if (scope === "project") {
      if (!scopeId) {
        return NextResponse.json(
          { error: "scopeId is required when scope=project" },
          { status: 400 },
        );
      }
      query = query.eq("metadata->>project_id" as never, scopeId);
    } else if (scope === "task") {
      if (!scopeId) {
        return NextResponse.json(
          { error: "scopeId is required when scope=task" },
          { status: 400 },
        );
      }
      query = query.eq("metadata->>task_id" as never, scopeId);
    } else if (scope) {
      return NextResponse.json(
        { error: `Unknown scope: ${scope}` },
        { status: 400 },
      );
    }

    if (placementType) query = query.eq("placement_type", placementType);
    if (isActive !== null)
      query = query.eq("metadata->>is_active" as never, isActive);

    query = query.order("position", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching shortcut categories:", error);
      return NextResponse.json(
        {
          error: "Failed to fetch shortcut categories",
          details: error.message,
        },
        { status: 500 },
      );
    }

    // A system-org row IS global — say so in the shape the client's scope
    // model reads (lib/organizations/globalOwnership.ts).
    const systemOrgId = await resolveSystemOrgId(supabase);

    return NextResponse.json({
      data: (data ?? []).map((row) =>
        toGlobalOwnershipWire(
          coerceLegacyCategoryIsActive(platformCategoryToLegacyRow(row)),
          systemOrgId,
        ),
      ),
    });
  } catch (error) {
    console.error("Error in GET /api/agent-shortcut-categories:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await getClaimsUser(supabase);

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

    if (!body.label || !body.placement_type) {
      return NextResponse.json(
        { error: "Missing required fields: label, placement_type" },
        { status: 400 },
      );
    }

    // Resolve scope FKs via the shared helper (sets created_by/org/project/task_id on payload).
    const scopePayload: Record<string, unknown> = {};
    const scoped = await applyScopeToInsertPayload({
      request,
      body,
      payload: scopePayload,
      userId: user.id,
      client: supabase,
    });
    if (scoped instanceof NextResponse) return scoped;

    // Build new platform.categories row shape.
    const insertPayload = {
      dimension: "shortcut" as const,
      name: body.label,
      icon: body.icon_name ?? null,
      color: body.color ?? null,
      placement_type: body.placement_type,
      position: body.sort_order ?? null,
      parent_id: body.parent_category_id ?? null,
      // Never `?? null`: `public._stamp_org_default` would file a NULL into
      // the writer's PERSONAL organization. The kernel above has already
      // refused the request when it could not name one, so this is a string.
      organization_id: scoped.organization_id as string,
      metadata: {
        description: body.description ?? null,
        is_active: body.is_active !== undefined ? body.is_active : true,
        enabled_features: body.enabled_features ?? null,
        user_id: scoped.created_by ?? null,
        project_id: scoped.project_id ?? null,
        task_id: scoped.task_id ?? null,
        legacy_table: "shortcut_categories",
      },
    };

    // THE DOOR. `platform` is not a client-writable schema (chair ruling, VERIFIER-8
    // HIGH-3) and this route writes as the PERSON, not as service_role, so it goes
    // through `cat_write` like every other client. The door stamps `created_by` from
    // auth.uid() and takes the dimension as a wall rather than a column.
    const { data, error } = await supabase.rpc(
      "cat_write",
      catWriteArgs(
        "shortcut",
        {
          name: insertPayload.name,
          icon: insertPayload.icon,
          color: insertPayload.color,
          placementType: insertPayload.placement_type,
          position: insertPayload.position,
          parentId: insertPayload.parent_id,
          metadata: insertPayload.metadata,
        },
        { organizationId: insertPayload.organization_id },
      ),
    );

    if (error) {
      console.error("Error creating shortcut category:", error);
      const status =
        error.code === "42501" || error.code === "PGRST301" ? 403 : 500;
      return NextResponse.json(
        {
          error: "Failed to create shortcut category",
          details: error.message,
        },
        { status },
      );
    }

    return NextResponse.json(
      {
        data: toGlobalOwnershipWire(
          coerceLegacyCategoryIsActive(platformCategoryToLegacyRow(categoryRow<PlatformCategorySelectRow>(data)!)),
          await resolveSystemOrgId(supabase),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error in POST /api/agent-shortcut-categories:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
