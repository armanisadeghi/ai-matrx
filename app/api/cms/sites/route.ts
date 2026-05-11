/**
 * CMS Sites API Route — v2 (ownership-secured)
 *
 * All queries filter by owner_user_id = authenticated user.
 * "First-claim": if a site has null owner_user_id, the first authenticated
 * user who lists/gets it claims ownership automatically.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { createClient } from "@supabase/supabase-js";

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
        // First-claim: auto-assign any unclaimed sites to this user
        await db
          .from("client_sites")
          .update({ owner_user_id: user.id })
          .is("owner_user_id", null);

        // Only return sites owned by this user
        const { data, error } = await db
          .from("client_sites")
          .select(
            "id, slug, name, domain, is_active, owner_user_id, favicon, created_at, updated_at",
          )
          .eq("owner_user_id", user.id)
          .order("name");

        if (error) {
          console.error("[cms/sites] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ sites: data ?? [] });
      }

      case "get": {
        const { siteId } = params;
        if (!siteId) {
          return NextResponse.json(
            { error: "siteId is required" },
            { status: 400 },
          );
        }

        const { data, error } = await db
          .from("client_sites")
          .select("*")
          .eq("id", siteId)
          .eq("owner_user_id", user.id)
          .single();

        if (error) {
          console.error("[cms/sites] get error:", error);
          const status = error.code === "PGRST116" ? 404 : 500;
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status },
          );
        }

        return NextResponse.json({ site: data });
      }

      case "create": {
        const {
          name,
          slug,
          domain,
          themeConfig,
          navigation,
          footerConfig,
          metaDefaults,
          contactInfo,
          socialLinks,
          settings,
          globalCss,
          favicon,
        } = params;

        if (!name || !slug) {
          return NextResponse.json(
            { error: "name and slug are required" },
            { status: 400 },
          );
        }

        const { data, error } = await db
          .from("client_sites")
          .insert({
            name,
            slug,
            domain: domain || null,
            owner_user_id: user.id, // Always set to authenticated user
            theme_config: themeConfig || {},
            navigation: navigation || [],
            footer_config: footerConfig || {},
            meta_defaults: metaDefaults || {},
            contact_info: contactInfo || {},
            social_links: socialLinks || {},
            settings: settings || {},
            global_css: globalCss || null,
            favicon: favicon || null,
          })
          .select()
          .single();

        if (error) {
          console.error("[cms/sites] create error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, site: data });
      }

      case "update": {
        const { siteId, ...updateFields } = params;
        if (!siteId) {
          return NextResponse.json(
            { error: "siteId is required" },
            { status: 400 },
          );
        }

        // Verify ownership before updating
        const { data: existing } = await db
          .from("client_sites")
          .select("id")
          .eq("id", siteId)
          .eq("owner_user_id", user.id)
          .single();

        if (!existing) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: 403 },
          );
        }

        const fieldMap: Record<string, string> = {
          name: "name",
          slug: "slug",
          domain: "domain",
          themeConfig: "theme_config",
          navigation: "navigation",
          footerConfig: "footer_config",
          metaDefaults: "meta_defaults",
          contactInfo: "contact_info",
          socialLinks: "social_links",
          settings: "settings",
          isActive: "is_active",
          globalCss: "global_css",
          favicon: "favicon",
        };

        const updateData: Record<string, unknown> = {};
        for (const [camel, snake] of Object.entries(fieldMap)) {
          if (updateFields[camel] !== undefined) {
            updateData[snake] = updateFields[camel];
          }
        }

        const { data, error } = await db
          .from("client_sites")
          .update(updateData)
          .eq("id", siteId)
          .eq("owner_user_id", user.id)
          .select()
          .single();

        if (error) {
          console.error("[cms/sites] update error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, site: data });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err: any) {
    console.error("[cms/sites] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
