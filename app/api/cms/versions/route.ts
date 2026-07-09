/**
 * CMS Versions API Route — v3 (ownership-secured)
 *
 * Verifies page→site→owner chain before returning version data. Read-only —
 * no activity-log writes (versions are created as a side effect of `pages`
 * `publish`, which already logs).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { getCmsClient, verifyPageOwnership } from "../_lib/cmsDb";

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
  } catch (err: unknown) {
    console.error("[cms/versions] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
