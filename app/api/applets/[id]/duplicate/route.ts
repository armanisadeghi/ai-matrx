import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { NextRequest, NextResponse } from "next/server";
import { appletPublicationPatch } from "@/features/applets/lib/publication";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

/**
 * POST /api/applets/[id]/duplicate
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
 *    "Failed to duplicate Applet" with no breadcrumbs, making
 *    debugging duplicate-collision races impossible.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const admin = createAdminClient();

    const {
      data: { user },
      error: authError,
    } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 🚨 THE COPY IS FILED IN THE ORGANIZATION THE CALLER IS ACTING IN.
    // This used to resolve the acting user's PERSONAL organization, which is
    // why all 96 live `app.definition` rows sit in their creator's private
    // workspace instead of the organization the app was built for. The caller
    // states the organization on `X-Organization-Id` — the header every Matrx
    // client carries — and with none the request is refused with the remedy.
    // Membership is not taken on trust: the insert below runs on the caller's
    // own RLS-scoped client, so a header naming an organization they are not
    // in fails the policy.
    // common-docs/policies/context-is-carried-never-rebuilt.md rule 4.
    const organizationId = request.headers.get("X-Organization-Id")?.trim() ?? "";
    if (organizationId.length === 0) {
      return NextResponse.json(
        {
          error:
            "No organization was named for this app, so nothing was created. Choose the organization you are working in and try again.",
          code: "organization_context_required",
        },
        { status: 400 },
      );
    }

    // RLS scoping is fine here — the user must already be able to read the
    // source row to duplicate it.
    const { data: original, error: fetchError } = await supabase
      .schema("app")
      .from("definition")
      .select("*")
      .is("deleted_at", null)
      .eq("id", id)
      .single();

    if (fetchError || !original) {
      return NextResponse.json(
        { error: "Applet not found or access denied" },
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
        .schema("app")
        .from("definition")
        .select("id")
        .eq("slug", slug)
        // Only a live app holds its slug (partial unique index, DD-121).
        .is("deleted_at", null)
        .maybeSingle();
      if (slugCheckError) {
        console.error(
          "[applets duplicate] slug-check error:",
          slugCheckError,
        );
        break; // fall through to the insert; DB unique constraint will catch a real collision
      }
      if (!existing) break;
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    // Always reset scope to the duplicating user — we never want to copy
    // org / project / task ownership. Canonical RLS std_insert on app.definition
    // requires created_by = auth.uid() (with_check).
    const { data: newApp, error: insertError } = await supabase
      .schema("app")
      .from("definition")
      .insert({
        created_by: user.id,
        organization_id: organizationId,
        project_id: null,
        task_id: null,
        slug,
        name: `${original.name} (Copy)`,
        tagline: original.tagline,
        description: original.description,
        category: original.category,
        tags: original.tags,
        // The Applet record (CONTRACTS §8): code, pages, jobs and sources travel together.
        files: original.files,
        entry: original.entry,
        pages: original.pages,
        mandates: original.mandates,
        sources: original.sources,
        parent_applet_id: original.parent_applet_id,
        scope: original.scope,
        metadata: original.metadata,
        preview_image_url: original.preview_image_url,
        favicon_url: original.favicon_url,
        ...appletPublicationPatch(true),
        rate_limit_per_ip: original.rate_limit_per_ip,
        rate_limit_window_hours: original.rate_limit_window_hours,
        rate_limit_authenticated: original.rate_limit_authenticated,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[applets duplicate] insert error:", insertError);
      const dev = process.env.NODE_ENV !== "production";
      return NextResponse.json(
        {
          error: "Failed to duplicate Applet",
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
    console.error("POST /api/applets/[id]/duplicate error:", error);
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
