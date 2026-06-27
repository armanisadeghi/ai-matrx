import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { NextRequest, NextResponse } from "next/server";
import type { CreateAgentAppInput } from "@/features/agent-apps/types";

/**
 * POST /api/agent-apps
 *
 * Creates a new agent app for the authenticated user. Mirrors the legacy
 * `prompt_apps` creation flow but against the `agent_apps` table.
 *
 * When `scope: "global"` is passed, the caller must be an admin; the app is
 * created with all scope columns null so it's globally visible.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = (await createClient()) as unknown as any;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Partial<CreateAgentAppInput>;

    const {
      agent_id,
      agent_version_id,
      use_latest,
      slug,
      name,
      tagline,
      description,
      category,
      tags,
      component_code,
      component_language,
      variable_schema,
      allowed_imports,
      layout_config,
      styling_config,
      shell_kind,
      shell_config,
      slot_overrides,
      slot_code,
      scope,
    } = body;

    const isGlobal = scope === "global";
    if (isGlobal) {
      const isAdmin = await checkIsSuperAdmin(supabase, user.id);
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Forbidden: admin privileges required for global apps" },
          { status: 403 },
        );
      }
    }

    // `component_code` is required only for the fully_custom path. Built-in
    // shell apps (chat / form_to_result / widget / etc) render entirely from
    // the agent definition + shell_config and don't need any user code.
    const isShellBased = shell_kind && shell_kind !== "fully_custom";
    if (!agent_id || !slug || !name) {
      return NextResponse.json(
        { error: "Missing required fields: agent_id, slug, name" },
        { status: 400 },
      );
    }
    if (!isShellBased && !component_code) {
      return NextResponse.json(
        {
          error:
            "Missing required field: component_code (required when shell_kind is omitted or 'fully_custom')",
        },
        { status: 400 },
      );
    }

    // Basic safety check — slugs are also validated client-side via the
    // `validate_slugs` RPC and enforced at the DB level via unique + format
    // constraints. This regex just rejects obvious garbage before we round-
    // trip to Postgres.
    const normalizedSlug = slug.trim().toLowerCase();
    if (
      normalizedSlug.length < 1 ||
      normalizedSlug.length > 50 ||
      !/^[a-z0-9][a-z0-9-]*$/.test(normalizedSlug) ||
      normalizedSlug.endsWith("-")
    ) {
      return NextResponse.json(
        { error: "Invalid slug format" },
        { status: 400 },
      );
    }

    // Surface the common "slug already taken" error with a clear message
    // instead of a raw Postgres unique-violation payload.
    const { data: existing, error: existingError } = await supabase
      .schema("app")
      .from("definition")
      .select("id")
      .eq("slug", normalizedSlug)
      .maybeSingle();

    if (existingError && existingError.code !== "PGRST116") {
      return NextResponse.json(
        {
          error: "Failed to validate slug",
          details: existingError.message,
        },
        { status: 500 },
      );
    }

    if (existing) {
      return NextResponse.json(
        { error: "That slug is already taken" },
        { status: 409 },
      );
    }

    const insertPayload: Record<string, unknown> = {
      agent_id,
      agent_version_id: agent_version_id ?? null,
      use_latest: use_latest ?? true,
      user_id: isGlobal ? null : user.id,
      // Canonical RLS std_insert on app.definition requires created_by = auth.uid().
      // Global apps use the admin client (bypasses RLS), so created_by stays null there.
      created_by: isGlobal ? null : user.id,
      organization_id: null,
      project_id: null,
      task_id: null,
      slug: normalizedSlug,
      name: name.trim(),
      tagline: tagline ?? null,
      description: description ?? null,
      category: category ?? null,
      tags: tags ?? [],
      // Shell-based apps default `component_code` to empty string — the
      // column is NOT NULL on legacy rows. The renderer ignores it when
      // shell_kind is set to a built-in.
      component_code: component_code ?? "",
      component_language: component_language ?? "tsx",
      variable_schema: (variable_schema ?? []) as unknown,
      allowed_imports: (allowed_imports ?? []) as unknown,
      layout_config: (layout_config ?? {}) as unknown,
      styling_config: (styling_config ?? {}) as unknown,
      // Shell columns are optional — when omitted the DB default applies
      // (currently 'chat'). When `component_code` is set without a
      // shell_kind, mark the row 'fully_custom' so the renderer dispatches
      // to AgentAppFullyCustomShell.
      shell_kind:
        shell_kind ?? (component_code ? "fully_custom" : undefined),
      ...(shell_config !== undefined ? { shell_config } : {}),
      ...(slot_overrides !== undefined ? { slot_overrides } : {}),
      ...(slot_code !== undefined ? { slot_code } : {}),
      status: "draft",
    };
    // Strip undefined keys so the DB default applies.
    Object.keys(insertPayload).forEach((k) => {
      if (insertPayload[k] === undefined) delete insertPayload[k];
    });

    // Global apps bypass RLS via the admin client because user_id = null
    // would fail a typical owner-check INSERT policy.
    const writer = isGlobal ? createAdminClient() : supabase;
    const { data, error } = await (writer as any)
      .schema("app")
      .from("definition")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("POST /api/agent-apps insert error:", error);
      return NextResponse.json(
        {
          error: "Failed to create agent app",
          details: error.message,
          code: error.code,
        },
        { status: 500 },
      );
    }

    // Fire-and-forget favicon generation — matches the legacy prompt-apps
    // behavior. We deliberately don't await it or propagate failures.
    try {
      const origin = request.nextUrl.origin;
      void fetch(`${origin}/api/agent-apps/generate-favicon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Forward the session cookies so the favicon endpoint (if it auth-
          // checks) sees the same user.
          cookie: request.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({ appId: data.id, name: data.name }),
      }).catch(() => undefined);
    } catch {
      // non-fatal
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("POST /api/agent-apps unexpected:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal server error", details: message },
      { status: 500 },
    );
  }
}
