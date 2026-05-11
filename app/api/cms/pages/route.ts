/**
 * CMS Pages API Route — v2 (ownership-secured)
 *
 * All actions verify the page's site is owned by the authenticated user
 * via a site ownership check before proceeding.
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

/** Verify the user owns the given site. Returns true if authorized. */
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

/** Verify the user owns the site that a page belongs to. Returns true if authorized. */
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
  return verifySiteOwnership(db, page.client_id, userId);
}

/** Summary columns for list view (no HTML content blobs) */
const LIST_COLUMNS = `
    id, client_id, slug, title, category, page_type,
    is_published, has_draft, is_home_page, show_in_nav,
    sort_order, excerpt, featured_image, author, tags,
    meta_title, meta_description,
    publish_date, last_published_at, created_at, updated_at
`
  .replace(/\s+/g, " ")
  .trim();

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
      // ── List pages (compact) ──────────────────────────────────────
      case "list": {
        const { siteId, category } = params;

        if (!siteId) {
          return NextResponse.json(
            { error: "siteId is required" },
            { status: 400 },
          );
        }

        // Verify site ownership
        if (!(await verifySiteOwnership(db, siteId, user.id))) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: 403 },
          );
        }

        let query = db
          .from("client_pages")
          .select(LIST_COLUMNS)
          .eq("client_id", siteId);
        if (category) {
          query = query.eq("category", category);
        }
        query = query
          .order("sort_order")
          .order("created_at", { ascending: false });

        const { data, error } = await query;

        if (error) {
          console.error("[cms/pages] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ pages: data ?? [] });
      }

      // ── Get single page (full content) ───────────────────────────
      case "get": {
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
          .from("client_pages")
          .select("*")
          .eq("id", pageId)
          .single();

        if (error) {
          console.error("[cms/pages] get error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ page: data });
      }

      // ── Create new page ──────────────────────────────────────────
      case "create": {
        const {
          siteId,
          slug,
          title,
          htmlContent,
          cssContent,
          jsContent,
          layoutType,
          useClientHeader,
          useClientFooter,
          metaTitle,
          metaDescription,
          metaKeywords,
          ogImage,
          canonicalUrl,
          category,
          parentId,
          pageType,
          excerpt,
          featuredImage,
          author,
          tags,
          isPublished,
          showInNav,
          sortOrder,
          isHomePage,
        } = params;

        if (!siteId || !slug || !title) {
          return NextResponse.json(
            { error: "siteId, slug, and title are required" },
            { status: 400 },
          );
        }

        // Verify site ownership
        if (!(await verifySiteOwnership(db, siteId, user.id))) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: 403 },
          );
        }

        const row: Record<string, unknown> = {
          client_id: siteId,
          slug,
          title,
          html_content: htmlContent || null,
          css_content: cssContent || null,
          js_content: jsContent || null,
          layout_type: layoutType || "default",
          use_client_header: useClientHeader ?? true,
          use_client_footer: useClientFooter ?? true,
          meta_title: metaTitle || null,
          meta_description: metaDescription || null,
          meta_keywords: metaKeywords || null,
          og_image: ogImage || null,
          canonical_url: canonicalUrl || null,
          is_published: isPublished ?? false,
          show_in_nav: showInNav ?? false,
          sort_order: sortOrder ?? 0,
          is_home_page: isHomePage ?? false,
          category: category || "general",
          parent_id: parentId || null,
          page_type: pageType || "standard",
          excerpt: excerpt || null,
          featured_image: featuredImage || null,
          author: author || null,
          tags: tags || null,
        };

        const { data, error } = await db
          .from("client_pages")
          .insert(row)
          .select()
          .single();

        if (error) {
          console.error("[cms/pages] create error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, page: data });
      }

      // ── Update page ──────────────────────────────────────────────
      case "update": {
        const { pageId, ...updateFields } = params;
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

        const fieldMap: Record<string, string> = {
          slug: "slug",
          title: "title",
          htmlContent: "html_content",
          cssContent: "css_content",
          jsContent: "js_content",
          layoutType: "layout_type",
          useClientHeader: "use_client_header",
          useClientFooter: "use_client_footer",
          metaTitle: "meta_title",
          metaDescription: "meta_description",
          metaKeywords: "meta_keywords",
          ogImage: "og_image",
          canonicalUrl: "canonical_url",
          isPublished: "is_published",
          showInNav: "show_in_nav",
          sortOrder: "sort_order",
          isHomePage: "is_home_page",
          category: "category",
          parentId: "parent_id",
          pageType: "page_type",
          excerpt: "excerpt",
          featuredImage: "featured_image",
          author: "author",
          tags: "tags",
        };

        const updateData: Record<string, unknown> = {};
        for (const [camel, snake] of Object.entries(fieldMap)) {
          if (updateFields[camel] !== undefined) {
            updateData[snake] = updateFields[camel];
          }
        }

        if (Object.keys(updateData).length === 0) {
          return NextResponse.json(
            { error: "No fields to update" },
            { status: 400 },
          );
        }

        const { data, error } = await db
          .from("client_pages")
          .update(updateData)
          .eq("id", pageId)
          .select()
          .single();

        if (error) {
          console.error("[cms/pages] update error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, page: data });
      }

      // ── Save draft ───────────────────────────────────────────────
      case "save-draft": {
        const {
          pageId,
          htmlContent,
          cssContent,
          jsContent,
          metaTitle,
          metaDescription,
          metaKeywords,
          ogImage,
          canonicalUrl,
        } = params;
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

        const draftData: Record<string, unknown> = { has_draft: true };
        if (htmlContent !== undefined)
          draftData.html_content_draft = htmlContent;
        if (cssContent !== undefined) draftData.css_content_draft = cssContent;
        if (jsContent !== undefined) draftData.js_content_draft = jsContent;
        if (metaTitle !== undefined) draftData.meta_title_draft = metaTitle;
        if (metaDescription !== undefined)
          draftData.meta_description_draft = metaDescription;
        if (metaKeywords !== undefined)
          draftData.meta_keywords_draft = metaKeywords;
        if (ogImage !== undefined) draftData.og_image_draft = ogImage;
        if (canonicalUrl !== undefined)
          draftData.canonical_url_draft = canonicalUrl;

        const { data, error } = await db
          .from("client_pages")
          .update(draftData)
          .eq("id", pageId)
          .select()
          .single();

        if (error) {
          console.error("[cms/pages] save-draft error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, page: data });
      }

      // ── Publish draft (RPC) ──────────────────────────────────────
      case "publish": {
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

        const { data, error } = await db.rpc("publish_page_draft", {
          page_uuid: pageId,
          publisher_id: user.id,
        });

        if (error) {
          console.error("[cms/pages] publish error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const { data: page } = await db
          .from("client_pages")
          .select("*")
          .eq("id", pageId)
          .single();

        return NextResponse.json({ success: true, published: data, page });
      }

      // ── Discard draft (RPC) ──────────────────────────────────────
      case "discard-draft": {
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

        const { data, error } = await db.rpc("discard_page_draft", {
          page_uuid: pageId,
        });

        if (error) {
          console.error("[cms/pages] discard-draft error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, discarded: data });
      }

      // ── Rollback to version (RPC) ────────────────────────────────
      case "rollback": {
        const { pageId, versionNumber } = params;
        if (!pageId || versionNumber === undefined) {
          return NextResponse.json(
            { error: "pageId and versionNumber are required" },
            { status: 400 },
          );
        }

        if (!(await verifyPageOwnership(db, pageId, user.id))) {
          return NextResponse.json(
            { error: "Page not found or access denied" },
            { status: 403 },
          );
        }

        const { data, error } = await db.rpc("rollback_to_version", {
          page_uuid: pageId,
          version_num: versionNumber,
        });

        if (error) {
          console.error("[cms/pages] rollback error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const { data: page } = await db
          .from("client_pages")
          .select("*")
          .eq("id", pageId)
          .single();

        return NextResponse.json({ success: true, rolledBack: data, page });
      }

      // ── Delete page ──────────────────────────────────────────────
      case "delete": {
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

        const { error } = await db
          .from("client_pages")
          .delete()
          .eq("id", pageId);

        if (error) {
          console.error("[cms/pages] delete error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err: any) {
    console.error("[cms/pages] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
