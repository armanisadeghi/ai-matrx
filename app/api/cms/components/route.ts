/**
 * CMS Components API Route — v2 (ownership-secured)
 *
 * All actions verify the component's site is owned by the authenticated user.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// API keys: ONLY sb_secret_* on the HTML CMS Supabase project.
// Legacy JWT keys (SUPABASE_HTML_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_HTML_ANON_KEY)
// are DEPRECATED and BANNED. Generate the secret key at:
// https://supabase.com/dashboard/project/viyklljfdhtidwecakwx/settings/api-keys
// Docs: https://supabase.com/docs/guides/getting-started/api-keys
const HTML_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_HTML_URL!;
const HTML_SUPABASE_SECRET_KEY = process.env.SUPABASE_HTML_SECRET_KEY ?? "";

function getCmsClient() {
  if (!HTML_SUPABASE_URL || !HTML_SUPABASE_SECRET_KEY) {
    throw new Error(
      "Missing CMS Supabase env vars (NEXT_PUBLIC_SUPABASE_HTML_URL, SUPABASE_HTML_SECRET_KEY). " +
        "See https://supabase.com/docs/guides/getting-started/api-keys",
    );
  }
  return createClient(HTML_SUPABASE_URL, HTML_SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
}

async function verifySiteOwnership(
  db: SupabaseClient,
  siteId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await db
    .from("client_sites")
    .select("id")
    .eq("id", siteId)
    .eq("owner_user_id", userId)
    .single();
  return !!data;
}

export async function POST(request: NextRequest) {
  try {
    const mainSupabase = await createMainSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await mainSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, ...params } = body;
    const db = getCmsClient();

    switch (action) {
      case "list": {
        const { siteId } = params;
        if (!siteId) {
          return NextResponse.json(
            { error: "siteId is required" },
            { status: 400 },
          );
        }

        if (!(await verifySiteOwnership(db, siteId, user.id))) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: 403 },
          );
        }

        const { data, error } = await db
          .from("client_components")
          .select("*")
          .eq("client_id", siteId)
          .order("component_type")
          .order("name");

        if (error) {
          console.error("[cms/components] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ components: data ?? [] });
      }

      case "get": {
        const { componentId } = params;
        if (!componentId) {
          return NextResponse.json(
            { error: "componentId is required" },
            { status: 400 },
          );
        }

        const { data: comp, error } = await db
          .from("client_components")
          .select("*")
          .eq("id", componentId)
          .single();

        if (error || !comp) {
          return NextResponse.json(
            { error: "Component not found" },
            { status: 404 },
          );
        }

        if (!(await verifySiteOwnership(db, comp.client_id, user.id))) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        return NextResponse.json({ component: comp });
      }

      case "create": {
        const { siteId, componentType, name, htmlContent, cssContent } = params;
        if (!siteId || !componentType || !name) {
          return NextResponse.json(
            { error: "siteId, componentType, and name are required" },
            { status: 400 },
          );
        }

        if (!(await verifySiteOwnership(db, siteId, user.id))) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: 403 },
          );
        }

        const { data, error } = await db
          .from("client_components")
          .insert({
            client_id: siteId,
            component_type: componentType,
            name,
            html_content: htmlContent || "",
            css_content: cssContent || null,
          })
          .select()
          .single();

        if (error) {
          console.error("[cms/components] create error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, component: data });
      }

      case "update": {
        const { componentId, ...updateFields } = params;
        if (!componentId) {
          return NextResponse.json(
            { error: "componentId is required" },
            { status: 400 },
          );
        }

        const { data: comp } = await db
          .from("client_components")
          .select("client_id")
          .eq("id", componentId)
          .single();

        if (!comp) {
          return NextResponse.json(
            { error: "Component not found" },
            { status: 404 },
          );
        }

        if (!(await verifySiteOwnership(db, comp.client_id, user.id))) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const fieldMap: Record<string, string> = {
          name: "name",
          componentType: "component_type",
          htmlContent: "html_content",
          htmlContentDraft: "html_content_draft",
          cssContent: "css_content",
          cssContentDraft: "css_content_draft",
          isActive: "is_active",
          hasDraft: "has_draft",
        };

        const updateData: Record<string, unknown> = {};
        for (const [camel, snake] of Object.entries(fieldMap)) {
          if (updateFields[camel] !== undefined) {
            updateData[snake] = updateFields[camel];
          }
        }

        const { data, error } = await db
          .from("client_components")
          .update(updateData)
          .eq("id", componentId)
          .select()
          .single();

        if (error) {
          console.error("[cms/components] update error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, component: data });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err: any) {
    console.error("[cms/components] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
