import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/agent-apps/[id]/duplicate
 *
 * Creates a copy of the source app under the current user.
 *
 * Two important details:
 *
 * 1. The slug-uniqueness check uses the admin client (bypasses RLS) so it
 *    actually sees collisions that belong to *other* users. The previous
 *    version used the user-scoped client; if a colliding slug existed but
 *    was hidden by RLS, the loop would exit "all clear" and the insert
 *    would die on the DB unique constraint with a swallowed error.
 *
 * 2. The error response forwards the Postgres message (in dev) and logs
 *    full detail server-side. The previous version returned a flat
 *    "Failed to duplicate agent app" with no breadcrumbs, making
 *    debugging duplicate-collision races impossible.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = (await createClient()) as unknown as any;
    const admin = createAdminClient() as unknown as any;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // RLS scoping is fine here — the user must already be able to read the
    // source row to duplicate it.
    const { data: original, error: fetchError } = await supabase
      .from("aga_apps")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !original) {
      return NextResponse.json(
        { error: "Agent app not found or access denied" },
        { status: 404 },
      );
    }

    // ── Resolve a unique slug. Admin client so the SELECT sees ALL rows. ──
    const baseSlug = `${original.slug}-copy`;
    let slug = baseSlug;
    let attempt = 0;
    const MAX_ATTEMPTS = 25;
    while (attempt < MAX_ATTEMPTS) {
      const { data: existing, error: slugCheckError } = await admin
        .from("aga_apps")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (slugCheckError) {
        console.error(
          "[agent-apps duplicate] slug-check error:",
          slugCheckError,
        );
        break; // fall through to the insert; DB unique constraint will catch a real collision
      }
      if (!existing) break;
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    // Always reset scope to the duplicating user — we never want to copy
    // org / project / task ownership, and `aga_apps_insert` policy
    // requires user_id = auth.uid() with the other scope keys NULL.
    const { data: newApp, error: insertError } = await supabase
      .from("aga_apps")
      .insert({
        user_id: user.id,
        organization_id: null,
        project_id: null,
        task_id: null,
        agent_id: original.agent_id,
        agent_version_id: original.agent_version_id,
        use_latest: original.use_latest,
        slug,
        name: `${original.name} (Copy)`,
        tagline: original.tagline,
        description: original.description,
        category: original.category,
        tags: original.tags,
        component_code: original.component_code,
        component_language: original.component_language,
        variable_schema: original.variable_schema,
        allowed_imports: original.allowed_imports,
        layout_config: original.layout_config,
        styling_config: original.styling_config,
        // Shell / slots — added by the shell_kind migration. Without these
        // a duplicate of a non-`chat` shell app would silently fall back
        // to the chat shell and lose the original UI contract.
        app_kind: original.app_kind,
        shell_kind: original.shell_kind,
        shell_config: original.shell_config,
        slot_overrides: original.slot_overrides,
        slot_code: original.slot_code,
        shared_context_slots: original.shared_context_slots,
        metadata: original.metadata,
        preview_image_url: original.preview_image_url,
        favicon_url: original.favicon_url,
        status: "draft",
        is_public: false,
        rate_limit_per_ip: original.rate_limit_per_ip,
        rate_limit_window_hours: original.rate_limit_window_hours,
        rate_limit_authenticated: original.rate_limit_authenticated,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[agent-apps duplicate] insert error:", insertError);
      const dev = process.env.NODE_ENV !== "production";
      return NextResponse.json(
        {
          error: "Failed to duplicate agent app",
          details: dev
            ? {
                message: insertError.message,
                code: insertError.code,
                hint: insertError.hint,
              }
            : undefined,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, app: newApp });
  } catch (error) {
    console.error("POST /api/agent-apps/[id]/duplicate error:", error);
    const dev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      {
        error: "Internal server error",
        details:
          dev && error instanceof Error
            ? { message: error.message }
            : undefined,
      },
      { status: 500 },
    );
  }
}
