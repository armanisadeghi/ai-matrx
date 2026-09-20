// app/api/admin/tools/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { requireAdmin } from "@/utils/auth/adminUtils";
import { buildSearchOr } from "@/utils/supabase-search";
import { parseSemver } from "@/features/admin/applications/version";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const active_only = searchParams.get("active_only");

    let query = supabase
      .schema("tool").from("definition")
      .select("*")
      .is("deleted_at", null)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    // Apply filters
    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    if (active_only === "true") {
      query = query.eq("is_active", true);
    }

    if (search) {
      query = query.or(buildSearchOr(search, ["name", "description"]));
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching tools:", error);
      return NextResponse.json(
        { error: "Failed to fetch tools", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      tools: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error("API error:", error);
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
    await requireAdmin();
    // Keep the verified user's cookie-backed JWT on the write. The canonical
    // RLS/provenance lane derives a human actor from auth.uid().
    const supabase = await createClient();
    const body = await request.json();

    // Validate required fields
    const { name, description, parameters } = body;
    if (!name || !description || !parameters) {
      return NextResponse.json(
        { error: "Missing required fields: name, description, parameters" },
        { status: 400 },
      );
    }

    // Validate JSON fields
    if (typeof parameters !== "object") {
      return NextResponse.json(
        { error: "Parameters must be a valid JSON object" },
        { status: 400 },
      );
    }

    // source_kind: 'native' | 'mcp_discovered' | 'admin_authored' | 'agent_authored'.
    // Default to 'admin_authored' since these come in via the admin UI.
    // If 'mcp_discovered', managed_by_server_id must be set.
    const sourceKind = body.source_kind || "admin_authored";
    if (sourceKind === "mcp_discovered" && !body.managed_by_server_id) {
      return NextResponse.json(
        { error: "source_kind 'mcp_discovered' requires managed_by_server_id" },
        { status: 400 },
      );
    }

    const version = body.version ?? 1;
    if (!Number.isInteger(version) || version < 1) {
      return NextResponse.json(
        { error: "Version must be a positive integer" },
        { status: 400 },
      );
    }
    const semver = body.semver ?? "1.0.0";
    if (typeof semver !== "string" || !parseSemver(semver)) {
      return NextResponse.json(
        { error: "Semantic version must use major.minor.patch format" },
        { status: 400 },
      );
    }
    if (body.gating !== undefined && !Array.isArray(body.gating)) {
      return NextResponse.json(
        { error: "Gating must be a JSON array" },
        { status: 400 },
      );
    }
    for (const field of [
      "admin_only",
      "dedupe_exempt",
      "validation_exempt",
    ] as const) {
      if (body[field] !== undefined && typeof body[field] !== "boolean") {
        return NextResponse.json(
          { error: `${field} must be a boolean` },
          { status: 400 },
        );
      }
    }
    if (
      body.tool_group !== undefined &&
      (typeof body.tool_group !== "string" || !body.tool_group.trim())
    ) {
      return NextResponse.json(
        { error: "Tool group must be a non-empty string" },
        { status: 400 },
      );
    }
    if (
      body.side_effect_class !== undefined &&
      body.side_effect_class !== null &&
      (typeof body.side_effect_class !== "string" ||
        !body.side_effect_class.trim())
    ) {
      return NextResponse.json(
        { error: "Side effect class must be a non-empty string or null" },
        { status: 400 },
      );
    }
    const visibilityValues = ["personal", "internal", "link", "public"];
    if (
      body.visibility !== undefined &&
      !visibilityValues.includes(body.visibility)
    ) {
      return NextResponse.json(
        { error: "Visibility must be personal, internal, link, or public" },
        { status: 400 },
      );
    }

    const toolData = {
      name: body.name,
      description: body.description,
      parameters: body.parameters,
      output_schema: body.output_schema || null,
      annotations: body.annotations || [],
      source_kind: sourceKind,
      managed_by_server_id: body.managed_by_server_id || null,
      category: body.category === "" ? null : body.category || null,
      tags: body.tags || [],
      icon: body.icon === "" ? null : body.icon || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      semver: semver.trim(),
      version,
      tool_group:
        typeof body.tool_group === "string" ? body.tool_group.trim() : "core",
      side_effect_class:
        typeof body.side_effect_class === "string"
          ? body.side_effect_class.trim()
          : null,
      admin_only: body.admin_only ?? false,
      gating: body.gating ?? [],
      dedupe_exempt: body.dedupe_exempt ?? false,
      validation_exempt: body.validation_exempt ?? false,
      visibility: body.visibility ?? "public",
      // Admin-authored platform tools are builtin/shipped content with no
      // individual owner — home them in the global system org (tool.definition
      // org is NOT NULL with no inherit trigger).
      // org-fallback-deliberate: an admin-authored platform tool is shipped
      //   content with no individual owner; the route is behind requireAdmin
      organization_id: await resolveSystemOrgId(supabase),
    };

    const { data, error } = await supabase
      .schema("tool").from("definition")
      .insert([toolData])
      .select()
      .single();

    if (error) {
      console.error("Error creating tool:", error);
      return NextResponse.json(
        { error: "Failed to create tool", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        message: "Tool created successfully",
        tool: data,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("Unauthorized")) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message.startsWith("Forbidden")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    console.error("API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
