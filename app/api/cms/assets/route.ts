/**
 * CMS Assets API Route (W2-B asset library over `client_assets`)
 *
 * Same single-POST `{action, ...}` dispatch as the sibling routes. The FILE
 * BYTES never pass through here — uploads go through the canonical
 * `fileHandler.upload(source, { preset, visibility: "public" })` path to
 * aidream `POST /assets`, which returns the durable public CDN URL; this route
 * only manages the `client_assets` metadata rows that make those URLs a
 * site-scoped library.
 *
 * Durability guard (second layer of the media doctrine): `create` refuses a
 * `file_path` that is not an absolute https URL or that carries a
 * signed/expiring-link signature — a signed URL in the library would end up in
 * page HTML and break when it expires (aidream's validator is the first layer).
 *
 * `delete` runs a LIVE usage scan (pages + components, live + draft columns)
 * and refuses with 409 while the asset is referenced, unless `force: true`.
 */

import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { getCmsClient, verifySiteOwnership, verifyAssetOwnership } from "../_lib/cmsDb";
import { logCmsActivity } from "../_lib/activityLog";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";

// Durable public hosts a library asset URL may live on. Anything else — an
// arbitrary external https URL — is refused so
// an owner can't register a tracking/phishing pixel as a site asset
// (adversarial finding W2-B #3).
const DURABLE_PUBLIC_URL_MARKERS = ["cdn.matrxserver.com"] as const;

function isDurablePublicUrl(url: string): boolean {
  return DURABLE_PUBLIC_URL_MARKERS.some((m) => url.includes(m));
}

// Metadata-only columns `update` may touch. file_path/file_id are immutable —
// a new image is a new upload.
const UPDATABLE_FIELDS = new Set(["file_name", "alt_text", "folder", "tags", "is_active"]);

const PAGE_SCAN_FIELDS = [
  "html_content",
  "html_content_draft",
  "css_content",
  "css_content_draft",
  "js_content",
  "js_content_draft",
  "featured_image",
  "og_image",
  "og_image_draft",
] as const;
const COMPONENT_SCAN_FIELDS = [
  "html_content",
  "html_content_draft",
  "css_content",
  "css_content_draft",
] as const;

/** Signed/expiring-link signatures (mirrors matrx-content-guard `is_signed_expiring_url`). */
function isSignedExpiringUrl(url: string): boolean {
  const u = url.toLowerCase();
  if (/[?&]x-amz-signature=/.test(u)) return true;
  if (/[?&]x-goog-signature=/.test(u)) return true;
  const query = u.includes("?") ? u.split("?")[1] : "";
  const keys = new Set(query.split("&").map((p) => p.split("=")[0]));
  if (keys.has("awsaccesskeyid") && keys.has("signature") && keys.has("expires")) return true;
  if (keys.has("key-pair-id") && keys.has("signature")) return true;
  if (keys.has("sig") && keys.has("se")) return true;
  return false;
}

interface PageUsage {
  page_id: string;
  slug: string;
  title: string | null;
  fields: string[];
}
interface ComponentUsage {
  component_id: string;
  component_type: string;
  name: string | null;
  fields: string[];
}

/**
 * LIVE usage scan — which pages/components of the site reference `url` right
 * now. Also re-syncs `used_in_pages` on the asset row so the stored array
 * converges to the truth every time anyone asks (same behavior as aidream's
 * `CmsAssetService._scan_and_sync_usage`).
 */
async function scanUsage(
  db: SupabaseClient,
  asset: { id: string; client_id: string; file_path: string; used_in_pages: string[] | null },
): Promise<{ usedInPages: PageUsage[]; usedInComponents: ComponentUsage[]; inUse: boolean }> {
  const url = asset.file_path ?? "";
  const usedInPages: PageUsage[] = [];
  const usedInComponents: ComponentUsage[] = [];
  if (url) {
    const { data: pages } = await db
      .from("client_pages")
      .select(
        "id, slug, title, html_content, html_content_draft, css_content, css_content_draft, js_content, js_content_draft, featured_image, og_image, og_image_draft",
      )
      .eq("client_id", asset.client_id);
    for (const p of (pages ?? []) as Array<Record<string, unknown>>) {
      const fields = PAGE_SCAN_FIELDS.filter((f) => typeof p[f] === "string" && (p[f] as string).includes(url));
      if (fields.length > 0) {
        usedInPages.push({
          page_id: String(p.id),
          slug: String(p.slug ?? ""),
          title: (p.title as string | null) ?? null,
          fields: [...fields],
        });
      }
    }
    const { data: components } = await db
      .from("client_components")
      .select("id, component_type, name, html_content, html_content_draft, css_content, css_content_draft")
      .eq("client_id", asset.client_id);
    for (const c of (components ?? []) as Array<Record<string, unknown>>) {
      const fields = COMPONENT_SCAN_FIELDS.filter((f) => typeof c[f] === "string" && (c[f] as string).includes(url));
      if (fields.length > 0) {
        usedInComponents.push({
          component_id: String(c.id),
          component_type: String(c.component_type ?? ""),
          name: (c.name as string | null) ?? null,
          fields: [...fields],
        });
      }
    }
  }
  const currentIds = usedInPages.map((u) => u.page_id).sort();
  const storedIds = [...(asset.used_in_pages ?? [])].map(String).sort();
  if (JSON.stringify(currentIds) !== JSON.stringify(storedIds)) {
    await db.from("client_assets").update({ used_in_pages: currentIds }).eq("id", asset.id);
  }
  return { usedInPages, usedInComponents, inUse: usedInPages.length > 0 || usedInComponents.length > 0 };
}

/** Strip path components / control chars from a display name (traversal guard). */
function safeFileName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const base = name
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "");
  return base.slice(0, 160) || null;
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
        const { siteId, folder, fileType, includeInactive } = params;
        if (!siteId) {
          return NextResponse.json({ error: "siteId is required" }, { status: 400 });
        }
        if (!(await verifySiteOwnership(db, siteId, user.id))) {
          return NextResponse.json({ error: "Site not found or access denied" }, { status: 403 });
        }
        let query = db
          .from("client_assets")
          .select("*")
          .eq("client_id", siteId)
          .order("created_at", { ascending: false });
        if (folder) query = query.eq("folder", folder);
        if (fileType) query = query.eq("file_type", fileType);
        if (!includeInactive) query = query.neq("is_active", false);
        const { data, error } = await query;
        if (error) {
          console.error("[cms/assets] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ assets: data ?? [] });
      }

      case "admin_list": {
        // Fleet-wide visibility for /administration/knowledge/cms-agents — same gate as
        // the sibling admin_* actions on /api/cms/sites.
        await requireSuperAdmin(); // throws → caught below as 500 with message
        const { siteId } = params;
        let query = db.from("client_assets").select("*").order("created_at", { ascending: false });
        if (siteId) query = query.eq("client_id", siteId);
        const { data, error } = await query;
        if (error) {
          console.error("[cms/assets] admin_list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ assets: data ?? [] });
      }

      case "get": {
        const { assetId } = params;
        if (!assetId) {
          return NextResponse.json({ error: "assetId is required" }, { status: 400 });
        }
        if (!(await verifyAssetOwnership(db, assetId, user.id))) {
          return NextResponse.json({ error: "Asset not found or access denied" }, { status: 403 });
        }
        const { data, error } = await db.from("client_assets").select("*").eq("id", assetId).single();
        if (error || !data) {
          return NextResponse.json({ error: "Asset not found" }, { status: 404 });
        }
        return NextResponse.json({ asset: data });
      }

      case "create": {
        // Registers an already-uploaded PUBLIC file (via fileHandler.upload →
        // aidream POST /assets) as a site asset. Bytes never pass through here.
        const { siteId, fileId, filePath, fileName, fileType, mimeType, fileSize, width, height, altText, folder, tags } =
          params;
        if (!siteId || !filePath || !fileName || !fileType) {
          return NextResponse.json(
            { error: "siteId, filePath, fileName and fileType are required" },
            { status: 400 },
          );
        }
        if (!(await verifySiteOwnership(db, siteId, user.id))) {
          return NextResponse.json({ error: "Site not found or access denied" }, { status: 403 });
        }
        if (
          !/^https:\/\//i.test(filePath) ||
          isSignedExpiringUrl(filePath) ||
          !isDurablePublicUrl(filePath)
        ) {
          // Media-durability doctrine, second layer: the library only holds
          // durable public URLs on OUR CDN — a signed link would rot inside
          // page HTML, and an arbitrary external URL would let an owner smuggle
          // a tracking/phishing pixel into their own public pages.
          return NextResponse.json(
            {
              error:
                "filePath must be a durable public URL on the Matrx CDN (never a signed/expiring " +
                "or external link). Upload through the assets pipeline with visibility=public and " +
                "pass the returned cdn_url.",
            },
            { status: 400 },
          );
        }
        const insert = {
          client_id: siteId,
          file_id: fileId ?? null,
          file_name: safeFileName(fileName) ?? "asset",
          file_path: filePath,
          file_type: fileType,
          mime_type: mimeType ?? null,
          file_size: fileSize ?? null,
          width: width ?? null,
          height: height ?? null,
          alt_text: altText ?? null,
          folder: folder || "root",
          tags: Array.isArray(tags) ? tags : null,
          used_in_pages: [] as string[],
          is_active: true,
          uploaded_by: user.id,
        };
        const { data, error } = await db.from("client_assets").insert(insert).select().single();
        if (error) {
          console.error("[cms/assets] create error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        await logCmsActivity(db, {
          siteId,
          activityType: "asset.upload",
          entityType: "asset",
          entityId: data.id,
          description: `Uploaded asset '${insert.file_name}' (${insert.mime_type ?? insert.file_type})`,
          userId: user.id,
          userEmail: user.email,
          changes: { file_name: insert.file_name, file_type: insert.file_type },
          metadata: fileId ? { capture_media_refs: [fileId], cdn_url: filePath } : { cdn_url: filePath },
        });
        return NextResponse.json({ asset: data });
      }

      case "update": {
        const { assetId, updates } = params;
        if (!assetId || !updates || typeof updates !== "object") {
          return NextResponse.json({ error: "assetId and updates are required" }, { status: 400 });
        }
        if (!(await verifyAssetOwnership(db, assetId, user.id))) {
          return NextResponse.json({ error: "Asset not found or access denied" }, { status: 403 });
        }
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(updates as Record<string, unknown>)) {
          if (UPDATABLE_FIELDS.has(k) && v !== undefined) clean[k] = k === "file_name" ? safeFileName(v) : v;
        }
        if (Object.keys(clean).length === 0) {
          return NextResponse.json(
            { error: `No updatable fields. Metadata-only: ${[...UPDATABLE_FIELDS].sort().join(", ")}` },
            { status: 400 },
          );
        }
        const { data, error } = await db.from("client_assets").update(clean).eq("id", assetId).select().single();
        if (error) {
          console.error("[cms/assets] update error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        await logCmsActivity(db, {
          siteId: data.client_id,
          activityType: "asset.update",
          entityType: "asset",
          entityId: assetId,
          description: `Updated asset fields: ${Object.keys(clean).sort().join(", ")}`,
          userId: user.id,
          userEmail: user.email,
          changes: { fields: Object.keys(clean).sort() },
        });
        return NextResponse.json({ asset: data });
      }

      case "usage": {
        const { assetId } = params;
        if (!assetId) {
          return NextResponse.json({ error: "assetId is required" }, { status: 400 });
        }
        if (!(await verifyAssetOwnership(db, assetId, user.id))) {
          return NextResponse.json({ error: "Asset not found or access denied" }, { status: 403 });
        }
        const { data: asset } = await db.from("client_assets").select("*").eq("id", assetId).single();
        if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
        const usage = await scanUsage(db, asset);
        return NextResponse.json({
          usage: {
            asset_id: assetId,
            url: asset.file_path,
            used_in_pages: usage.usedInPages,
            used_in_components: usage.usedInComponents,
            in_use: usage.inUse,
          },
        });
      }

      case "delete": {
        const { assetId, force } = params;
        if (!assetId) {
          return NextResponse.json({ error: "assetId is required" }, { status: 400 });
        }
        if (!(await verifyAssetOwnership(db, assetId, user.id))) {
          return NextResponse.json({ error: "Asset not found or access denied" }, { status: 403 });
        }
        const { data: asset } = await db.from("client_assets").select("*").eq("id", assetId).single();
        if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

        // ALWAYS re-scan before deciding — never trust the stored array.
        const usage = await scanUsage(db, asset);
        if (usage.inUse && !force) {
          return NextResponse.json(
            {
              error: "Asset is still referenced by site content — delete refused. Pass force to delete anyway.",
              code: "asset_in_use",
              used_in_pages: usage.usedInPages,
              used_in_components: usage.usedInComponents,
            },
            { status: 409 },
          );
        }
        const { error } = await db.from("client_assets").delete().eq("id", assetId);
        if (error) {
          console.error("[cms/assets] delete error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        await logCmsActivity(db, {
          siteId: asset.client_id,
          activityType: "asset.delete",
          entityType: "asset",
          entityId: assetId,
          description: `Deleted asset '${asset.file_name}'${usage.inUse ? " (forced while in use)" : ""}`,
          userId: user.id,
          userEmail: user.email,
          changes: { forced: Boolean(force && usage.inUse), was_used_in_pages: usage.usedInPages.map((u) => u.page_id) },
        });
        return NextResponse.json({ success: true, deleted_id: assetId, was_in_use: usage.inUse });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[cms/assets] fatal:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
