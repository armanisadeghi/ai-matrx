/**
 * CMS Versions API Route — v4 (canonical history, ownership-secured)
 *
 * Reads the canonical append-only log `history.row_versions` on the CMS project
 * through its public façade RPCs (`version_list` / `version_get`, migration
 * `db/migrations/cms/0003_public_version_api.sql` in aidream). EVERY change to a
 * page is a version here — create, edit, draft save, publish, rollback — not
 * just first publishes as the retired `client_page_versions` table held.
 *
 * The RPCs are SECURITY DEFINER with EXECUTE locked to `service_role` and carry
 * NO in-DB access gate (the CMS project has no `iam`), so the page→site→owner
 * chain MUST be verified here before any version data is returned — the same
 * contract aidream's `services/cms/access.py` enforces on its side.
 *
 * Read-only: versions are written only by the `_history` trigger, and restored
 * only by `pages` `rollback`.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { getCmsClient, verifyPageOwnership } from "../_lib/cmsDb";
import type {
  ClientPageVersion,
  ClientPageVersionDetail,
} from "@/features/cms/types";

/** platform.entity_types token for `public.client_pages` on the CMS project. */
const PAGE_TOKEN = "client_page";

/** The `version_get` RPC returns the summary fields plus the raw row snapshot. */
type VersionGetRow = ClientPageVersion & { row_data: Record<string, unknown> };

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Flatten a `row_data` snapshot into the content fields the version UI reads. */
function toVersionDetail(row: VersionGetRow): ClientPageVersionDetail {
  const d = row.row_data ?? {};
  return {
    id: row.id,
    page_id: row.page_id,
    version_number: row.version_number,
    operation: row.operation,
    published_by: row.published_by,
    occurred_at: row.occurred_at,
    is_current: row.is_current,
    title: str(d.title),
    slug: str(d.slug),
    is_published: typeof d.is_published === "boolean" ? d.is_published : null,
    html_content: str(d.html_content),
    css_content: str(d.css_content),
    js_content: str(d.js_content),
    meta_title: str(d.meta_title),
    meta_description: str(d.meta_description),
    meta_keywords: str(d.meta_keywords),
    og_image: str(d.og_image),
    canonical_url: str(d.canonical_url),
  };
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

        const { data, error } = await db.rpc("version_list", {
          p_token: PAGE_TOKEN,
          p_id: pageId,
        });

        if (error) {
          console.error("[cms/versions] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
          versions: (data ?? []) as ClientPageVersion[],
        });
      }

      case "get": {
        const { versionId } = params;
        if (!versionId) {
          return NextResponse.json(
            { error: "versionId is required" },
            { status: 400 },
          );
        }

        const { data, error } = await db.rpc("version_get", {
          p_token: PAGE_TOKEN,
          p_version_id: Number(versionId),
        });

        if (error || !data) {
          return NextResponse.json(
            { error: "Version not found" },
            { status: 404 },
          );
        }

        const row = data as VersionGetRow;

        // Ownership is checked on the page the version belongs to — the RPC
        // itself has no access gate.
        if (!(await verifyPageOwnership(db, row.page_id, user.id))) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        return NextResponse.json({ version: toVersionDetail(row) });
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
