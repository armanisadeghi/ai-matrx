/**
 * CMS Versions API Route — v2 (ownership-secured)
 *
 * Verifies page→site→owner chain before returning version data.
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

async function verifyPageOwnership(
  db: SupabaseClient,
  pageId: string,
  userId: string,
): Promise<boolean> {
  const { data: page } = await db
    .from("client_pages")
    .select("client_id")
    .eq("id", pageId)
    .single();
  if (!page) return false;

  const { data: site } = await db
    .from("client_sites")
    .select("id")
    .eq("id", page.client_id)
    .eq("owner_user_id", userId)
    .single();
  return !!site;
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
        const { pageId } = params;
        if (!pageId) {
          return NextResponse.json(
            { error: "pageId is required" },
            { status: 400 },
          );
        }

        if (!(await verifyPageOwnership(db, pageId, user.id))) {
          return NextResponse.json(
            { error: "Page not found or access denied" },
            { status: 403 },
          );
        }

        const { data, error } = await db
          .from("client_page_versions")
          .select("*")
          .eq("page_id", pageId)
          .order("version_number", { ascending: false });

        if (error) {
          console.error("[cms/versions] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ versions: data ?? [] });
      }

      case "get": {
        const { versionId } = params;
        if (!versionId) {
          return NextResponse.json(
            { error: "versionId is required" },
            { status: 400 },
          );
        }

        // Get the version first to find its page
        const { data: version, error } = await db
          .from("client_page_versions")
          .select("*")
          .eq("id", versionId)
          .single();

        if (error || !version) {
          return NextResponse.json(
            { error: "Version not found" },
            { status: 404 },
          );
        }

        // Verify ownership chain
        if (!(await verifyPageOwnership(db, version.page_id, user.id))) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        return NextResponse.json({ version });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err: any) {
    console.error("[cms/versions] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
