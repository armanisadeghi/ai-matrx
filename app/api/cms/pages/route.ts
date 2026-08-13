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
import {
  getCmsClient,
  verifySiteOwnership,
  verifyPageOwnership,
  verifyHtmlPageOwnership,
} from "../_lib/cmsDb";
import { logCmsActivity } from "../_lib/activityLog";
import {
  splitHtmlDocument,
  slugifyTitle,
  SLUG_RE,
  MAX_PROMOTE_HTML_BYTES,
} from "@/features/html-pages/utils/promoteConvert";
import { clientPageRoute } from "@/features/cms/utils/pageUrls";

/**
 * Summary columns for list view (no HTML content blobs). `content_stats` is a
 * PostgREST computed field (CMS migration 0036) — four integers measuring the
 * blobs in-database, so the list can say what's actually there without ever
 * transferring the HTML.
 */
const LIST_COLUMNS = `
    id, client_id, slug, route, title, category, page_type,
    is_published, has_draft, is_home_page, show_in_nav,
    sort_order, excerpt, featured_image, author, tags,
    meta_title, meta_description,
    publish_date, last_published_at, created_at, updated_at,
    plan_node_id, web_page_id,
    content_stats
`
  .replace(/\s+/g, " ")
  .trim();

/**
 * Caller-supplied provenance for the activity log (`changes.metadata`, the C6
 * seam) — e.g. the marketing page-workspace push stamps
 * `{source: "page-workspace", web_page_id, pushed_at}`. Only a plain object is
 * accepted; anything else is dropped (undefined), never an error.
 */
function asProvenance(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
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
          .order("created_at", { ascending: false })
          // Unique tiebreak LAST — unstable-pagination guard (ties are common on bulk-seeded rows).
          .order("id", { ascending: false });

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
          provenance,
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

        // `route` is NEVER written here: it is trigger-computed from
        // slug + category + the parent's route (CMS migration 0028). Adding it
        // to this row would fight the trigger and desync the live URL.
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
          metadata: asProvenance(provenance),
        });

        return NextResponse.json({ success: true, page: data });
      }

      // ── Promote an html_page → NEW draft page on a site (W2-A) ──────
      // Converted content lands ONLY in the _draft twins (has_draft=true,
      // never auto-published); provenance recorded both directions. The
      // /p/{id} original stays live. Twin of aidream's promote_service
      // (services/cms/promote.py) — same converter spec, same idempotency
      // key (client_id, source_html_page_id).
      case "promote": {
        const { htmlPageId, siteId, slug, title, category, forceNew } = params;

        if (!htmlPageId || !siteId) {
          return NextResponse.json(
            { error: "htmlPageId and siteId are required" },
            { status: 400 },
          );
        }
        if (!(await verifyHtmlPageOwnership(db, htmlPageId, user.id))) {
          return NextResponse.json(
            { error: "HTML page not found or access denied" },
            { status: 403 },
          );
        }
        if (!(await verifySiteOwnership(db, siteId, user.id))) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: 403 },
          );
        }

        const { data: source, error: sourceError } = await db
          .from("html_pages")
          .select("*")
          .eq("id", htmlPageId)
          .single();
        if (sourceError || !source) {
          return NextResponse.json(
            { error: "HTML page not found" },
            { status: 404 },
          );
        }

        // Idempotency: same html_page already promoted onto this site → reuse.
        if (!forceNew) {
          const { data: existing } = await db
            .from("client_pages")
            .select("*")
            .eq("client_id", siteId)
            .eq("source_html_page_id", htmlPageId)
            .order("created_at", { ascending: false })
            // Unique tiebreak LAST — unstable-pagination guard (ties are common on bulk-seeded rows).
            .order("id", { ascending: false })
            .limit(1);
          if (existing && existing.length > 0) {
            return NextResponse.json({
              success: true,
              reused: true,
              page: existing[0],
              conversionWarnings: [],
              wasFullDocument: null,
            });
          }
        }

        // Adversarial F4, second layer: the converter is linear and never
        // throws, but a pathological multi-MB document is refused up front
        // (largest live row ≈ 200 KB; cap = 2 MB). Twin of promote.py.
        const rawBytes = Buffer.byteLength(source.html_content ?? "", "utf8");
        if (rawBytes > MAX_PROMOTE_HTML_BYTES) {
          return NextResponse.json(
            {
              error: `html_content is too large to promote (${rawBytes} bytes > ${MAX_PROMOTE_HTML_BYTES})`,
            },
            { status: 413 },
          );
        }

        const conversion = splitHtmlDocument(source.html_content ?? "");

        // DB values ALWAYS win over extracted ones (the /p/ renderer's rule).
        const metaTitle = source.meta_title || conversion.extractedTitle;
        const metaDescription =
          source.meta_description || conversion.extractedDescription;
        const resolvedTitle =
          (typeof title === "string" && title.trim()) ||
          metaTitle ||
          "Untitled Page";
        const resolvedCategory =
          (typeof category === "string" && category.trim()) || "general";

        // Slug: explicit (validated, must be free) or derived + uniquified.
        // Uniqueness is on the ROUTE, not the slug — CMS migration 0028 dropped
        // `client_pages_client_id_slug_key` for
        // `client_pages_client_id_route_key UNIQUE (client_id, route)`. Scanning
        // slugs here would falsely reject promoting `about` into category `blog`
        // (route `/blog/about`) just because a root `/about` exists. A promote
        // never sets `parent_id`, so the candidate route derives from
        // slug + category alone.
        const { data: siblingRows } = await db
          .from("client_pages")
          .select("route")
          .eq("client_id", siteId);
        const taken = new Set((siblingRows ?? []).map((r) => r.route));
        const routeFor = (candidate: string) =>
          clientPageRoute({ slug: candidate, category: resolvedCategory });
        let resolvedSlug: string;
        if (typeof slug === "string" && slug.trim()) {
          resolvedSlug = slug.trim();
          if (!SLUG_RE.test(resolvedSlug)) {
            return NextResponse.json(
              { error: "slug must be lowercase letters/digits/hyphens" },
              { status: 400 },
            );
          }
          if (taken.has(routeFor(resolvedSlug))) {
            return NextResponse.json(
              {
                error: `a page already exists at "${routeFor(resolvedSlug)}" on this site`,
              },
              { status: 409 },
            );
          }
        } else {
          const base = slugifyTitle(resolvedTitle);
          resolvedSlug = base;
          for (let n = 2; taken.has(routeFor(resolvedSlug)); n++) {
            resolvedSlug = `${base}-${n}`;
          }
        }

        const insertRow: Record<string, unknown> = {
          client_id: siteId,
          slug: resolvedSlug,
          title: resolvedTitle,
          category: resolvedCategory,
          // Live columns stay EMPTY — a promote never publishes.
          html_content: null,
          css_content: null,
          js_content: null,
          is_published: false,
          show_in_nav: false,
          // Converted content + carried SEO land in the draft twins.
          has_draft: true,
          html_content_draft: conversion.body,
          css_content_draft: conversion.css,
          js_content_draft: conversion.js,
          meta_title_draft: metaTitle,
          meta_description_draft: metaDescription,
          meta_keywords_draft: source.meta_keywords,
          og_image_draft: source.og_image,
          canonical_url_draft: source.canonical_url,
          // Forward provenance (CMS migration 0008).
          source_html_page_id: source.id,
          source_artifact_id: source.artifact_id,
          source_message_id: source.source_message_id,
          source_conv_id: source.source_conv_id,
        };

        const { data: created, error: createError } = await db
          .from("client_pages")
          .insert(insertRow)
          .select()
          .single();
        if (createError) {
          console.error("[cms/pages] promote error:", createError);
          return NextResponse.json(
            { error: createError.message },
            { status: 500 },
          );
        }

        // Reverse provenance on the source html_page — ATOMIC at the DB
        // (adversarial F6): a JS read-modify-write loses entries under
        // concurrent promotes of the same html_page to different sites.
        // `append_html_page_promotion` (CMS migration 0014, service_role-only)
        // does the jsonb append in one UPDATE; aidream's promote_service
        // calls the same function.
        const { error: reverseError } = await db.rpc(
          "append_html_page_promotion",
          {
            page_uuid: htmlPageId,
            entry: {
              client_page_id: created.id,
              client_site_id: siteId,
              promoted_at: new Date().toISOString(),
            },
          },
        );
        if (reverseError) {
          // The page exists — don't fail the promote, but scream: the reverse
          // provenance link did not land.
          console.error(
            "[cms/pages] promote: reverse-provenance write FAILED for",
            htmlPageId,
            reverseError,
          );
        }

        await logCmsActivity(db, {
          siteId,
          activityType: "page.promote",
          entityType: "page",
          entityId: created.id,
          description: `Promoted html_page ${htmlPageId} → "${resolvedTitle}" (${resolvedSlug})`,
          userId: user.id,
          userEmail: user.email,
          changes: {
            source_html_page_id: htmlPageId,
            was_full_document: conversion.wasFullDocument,
            conversion_warnings: conversion.warnings,
          },
        });
        await logCmsActivity(db, {
          siteId,
          activityType: "html_page.promote",
          entityType: "html_page",
          entityId: htmlPageId,
          description: `Promoted to site as page ${created.id}`,
          userId: user.id,
          userEmail: user.email,
          changes: { client_page_id: created.id },
        });

        return NextResponse.json({
          success: true,
          reused: false,
          page: created,
          conversionWarnings: conversion.warnings,
          wasFullDocument: conversion.wasFullDocument,
        });
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

        // `route` is deliberately absent: it is trigger-computed (CMS migration
        // 0028) and must never be written. Note that `slug`, `category` and
        // `parentId` ARE writable and each MOVES the live URL — the trigger
        // recomputes `route` and cascades the new prefix to every descendant.
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

      // ── Link this page to the web.page it serves ──────────────────
      //
      // THE ONE write path for `client_pages.web_page_id` (CMS migration
      // 0037) on this side of the wire — the twin of aidream's
      // `page_service.set_web_page_link`. It is a separate action, and
      // `web_page_id` is deliberately absent from `update`'s fieldMap, so the
      // generic update can never forge a measurement link.
      //
      // `webPageId` is a MAIN-project `web.page.id` with no foreign key here
      // (separate database). The caller proves it exists; this seam owns
      // ownership, the unique-conflict answer, and the audit trail.
      case "set-web-page-link": {
        const { pageId, webPageId } = params;
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

        const wanted: string | null =
          typeof webPageId === "string" && webPageId.length > 0
            ? webPageId
            : null;

        const { data, error } = await db
          .from("client_pages")
          .update({ web_page_id: wanted })
          .eq("id", pageId)
          .select()
          .single();

        if (error) {
          // Unique (client_id, web_page_id): one crawled URL is served by
          // exactly one CMS page. Say which conflict this is, never a 500.
          if (error.code === "23505") {
            return NextResponse.json(
              {
                error:
                  "Another page on this site is already linked to that measured page. One crawled URL is served by exactly one CMS page — unlink the other page first.",
              },
              { status: 409 },
            );
          }
          console.error("[cms/pages] set-web-page-link error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logCmsActivity(db, {
          siteId: data.client_id,
          activityType: "page.web_page_link",
          entityType: "page",
          entityId: pageId,
          description: wanted
            ? `Linked page to measured page ${wanted}`
            : "Unlinked page from its measured page",
          userId: user.id,
          userEmail: user.email,
          changes: { web_page_id: wanted },
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
          provenance,
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
          metadata: asProvenance(provenance),
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
