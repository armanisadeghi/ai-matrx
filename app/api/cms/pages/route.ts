/**
 * CMS Pages API Route — v3 (ownership-secured + admin page-tree read)
 *
 * All owner-scoped actions verify the page's site is owned by the authenticated
 * user via a site ownership check before proceeding. `admin_list` bypasses
 * ownership (requireSuperAdmin) — it backs the fleet-wide page-tree view on the
 * agent-activity visibility surface, which needs to see every site's pages.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { getCmsClient, verifySiteOwnership, verifyPageOwnership } from "../_lib/cmsDb";
import { logCmsActivity } from "../_lib/activityLog";

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

        await logCmsActivity(db, {
          siteId,
          activityType: "page.create",
          entityType: "page",
          entityId: data.id,
          description: `Created page "${data.title}" (${data.slug})`,
          userId: user.id,
          userEmail: user.email,
        });

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

        await logCmsActivity(db, {
          siteId: data.client_id,
          activityType: "page.update",
          entityType: "page",
          entityId: pageId,
          description: `Updated page "${data.title}" (${Object.keys(updateData).join(", ")})`,
          userId: user.id,
          userEmail: user.email,
          changes: { fields: Object.keys(updateData) },
        });

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

        await logCmsActivity(db, {
          siteId: data.client_id,
          activityType: "page.save_draft",
          entityType: "page",
          entityId: pageId,
          description: `Saved draft for "${data.title}"`,
          userId: user.id,
          userEmail: user.email,
          changes: { fields: Object.keys(draftData) },
        });

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

        await logCmsActivity(db, {
          siteId: page?.client_id ?? null,
          activityType: "page.publish",
          entityType: "page",
          entityId: pageId,
          description: `Published "${page?.title ?? pageId}"`,
          userId: user.id,
          userEmail: user.email,
        });

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

        const { data: discardedPage } = await db
          .from("client_pages")
          .select("client_id, title")
          .eq("id", pageId)
          .single();

        await logCmsActivity(db, {
          siteId: discardedPage?.client_id ?? null,
          activityType: "page.discard_draft",
          entityType: "page",
          entityId: pageId,
          description: `Discarded draft for "${discardedPage?.title ?? pageId}"`,
          userId: user.id,
          userEmail: user.email,
        });

        return NextResponse.json({ success: true, discarded: data });
      }

      // ── Rollback to version (canonical restore) ──────────────────
      // `version_restore` restores CONTENT columns only, and is itself a
      // versioned UPDATE — history is appended to, never rewritten. It returns
      // the page's new version number. Same restore aidream's
      // `page_service.rollback` runs (`platform.version_restore`).
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

        const { data: newVersion, error } = await db.rpc("version_restore", {
          p_token: "client_page",
          p_id: pageId,
          p_version: versionNumber,
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

        await logCmsActivity(db, {
          siteId: page?.client_id ?? null,
          activityType: "page.rollback",
          entityType: "page",
          entityId: pageId,
          description: `Rolled back content of "${page?.title ?? pageId}" to version ${versionNumber} (now version ${newVersion})`,
          userId: user.id,
          userEmail: user.email,
          changes: {
            restored_from_version: versionNumber,
            new_version: newVersion,
          },
        });

        return NextResponse.json({ success: true, newVersion, page });
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

        const { data: pageToDelete } = await db
          .from("client_pages")
          .select("client_id, title, slug")
          .eq("id", pageId)
          .single();

        const { error } = await db
          .from("client_pages")
          .delete()
          .eq("id", pageId);

        if (error) {
          console.error("[cms/pages] delete error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logCmsActivity(db, {
          siteId: pageToDelete?.client_id ?? null,
          activityType: "page.delete",
          entityType: "page",
          entityId: pageId,
          description: `Deleted page "${pageToDelete?.title ?? pageId}" (${pageToDelete?.slug ?? ""})`,
          userId: user.id,
          userEmail: user.email,
        });

        return NextResponse.json({ success: true });
      }

      // ── Admin: fleet-wide page-tree read, requireSuperAdmin ────────
      case "admin_list": {
        await requireSuperAdmin();
        const { siteId } = params;

        let query = db.from("client_pages").select(LIST_COLUMNS);
        if (siteId) query = query.eq("client_id", siteId);
        query = query.order("client_id").order("sort_order");

        const { data, error } = await query;

        if (error) {
          console.error("[cms/pages] admin_list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ pages: data ?? [] });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err: unknown) {
    console.error("[cms/pages] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.startsWith("Forbidden") ? 403 : message.startsWith("Unauthorized") ? 401 : 500;
    return NextResponse.json(
      { error: message },
      { status },
    );
  }
}
