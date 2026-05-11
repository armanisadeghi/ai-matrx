/**
 * HTML Pages API Route
 *
 * Proxies create/update/delete operations to the HTML Supabase project
 * using the secret key to bypass RLS.
 *
 * Auth: Verifies the caller is authenticated against the main Supabase project
 * by reading the session cookie via the SSR client.
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_HTML_URL  — HTML CMS Supabase project URL
 *   SUPABASE_HTML_SECRET_KEY       — sb_secret_* key for the HTML CMS project
 *                                    (project: viyklljfdhtidwecakwx)
 *   Generate at:
 *   https://supabase.com/dashboard/project/viyklljfdhtidwecakwx/settings/api-keys
 *
 * API keys: ONLY sb_publishable_* / sb_secret_*. The legacy JWT keys
 * (NEXT_PUBLIC_SUPABASE_HTML_ANON_KEY, SUPABASE_HTML_SERVICE_ROLE_KEY) are
 * DEPRECATED and BANNED in this repo (ESLint enforces this).
 * Docs: https://supabase.com/docs/guides/getting-started/api-keys
 *
 * POST body: { action, ...params }
 *   action: 'create' | 'update' | 'delete' | 'get' | 'list'
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { createClient } from "@supabase/supabase-js";

const HTML_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_HTML_URL!;
const HTML_SUPABASE_SECRET_KEY = process.env.SUPABASE_HTML_SECRET_KEY ?? "";

const HTML_SITE_URL =
  process.env.NEXT_PUBLIC_HTML_SITE_URL || "https://mymatrx.com";

function getHtmlAdminClient() {
  if (!HTML_SUPABASE_URL || !HTML_SUPABASE_SECRET_KEY) {
    throw new Error(
      "Missing HTML Supabase env vars (NEXT_PUBLIC_SUPABASE_HTML_URL, SUPABASE_HTML_SECRET_KEY). " +
        "Generate the secret key at " +
        "https://supabase.com/dashboard/project/viyklljfdhtidwecakwx/settings/api-keys",
    );
  }
  return createClient(HTML_SUPABASE_URL, HTML_SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Verify main-app session
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

    const htmlDb = getHtmlAdminClient();

    switch (action) {
      case "create": {
        const {
          htmlContent,
          metaTitle,
          metaDescription = "",
          metaFields = {},
          // Source tracking (optional — provided by HtmlPreviewBridge / thunks)
          sourceMessageId,
          sourceConversationId,
          contextMetadata,
        } = params;

        if (!htmlContent || !metaTitle) {
          return NextResponse.json(
            { error: "htmlContent and metaTitle are required" },
            { status: 400 },
          );
        }

        const insertData: Record<string, unknown> = {
          html_content: htmlContent,
          user_id: user.id,
          meta_title: metaTitle,
          meta_description: metaDescription,
          meta_keywords: metaFields.metaKeywords || null,
          og_image: metaFields.ogImage || null,
          canonical_url: metaFields.canonicalUrl || null,
          is_indexable: metaFields.isIndexable || false,
        };

        // Store source tracking if columns exist (migration 002 required)
        if (sourceMessageId) insertData.source_message_id = sourceMessageId;
        if (sourceConversationId)
          insertData.source_conv_id = sourceConversationId;
        if (contextMetadata) insertData.context_metadata = contextMetadata;

        const { data, error } = await htmlDb
          .from("html_pages")
          .insert(insertData)
          .select()
          .single();

        if (error) {
          // If context columns don't exist yet (migration not run), retry without them
          if (error.code === "42703") {
            const fallbackData: Record<string, unknown> = {
              html_content: htmlContent,
              user_id: user.id,
              meta_title: metaTitle,
              meta_description: metaDescription,
              meta_keywords: metaFields.metaKeywords || null,
              og_image: metaFields.ogImage || null,
              canonical_url: metaFields.canonicalUrl || null,
              is_indexable: metaFields.isIndexable || false,
            };
            const { data: fallback, error: fallbackError } = await htmlDb
              .from("html_pages")
              .insert(fallbackData)
              .select()
              .single();

            if (fallbackError) {
              console.error(
                "[html-pages API] create fallback error:",
                fallbackError,
              );
              return NextResponse.json(
                { error: fallbackError.message },
                { status: 500 },
              );
            }

            return NextResponse.json({
              success: true,
              pageId: fallback.id,
              url: `${HTML_SITE_URL}/p/${fallback.id}`,
              metaTitle: fallback.meta_title,
              metaDescription: fallback.meta_description,
              isIndexable: fallback.is_indexable,
              createdAt: fallback.created_at,
            });
          }

          console.error("[html-pages API] create error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          pageId: data.id,
          url: `${HTML_SITE_URL}/p/${data.id}`,
          metaTitle: data.meta_title,
          metaDescription: data.meta_description,
          isIndexable: data.is_indexable,
          createdAt: data.created_at,
        });
      }

      case "update": {
        const {
          pageId,
          htmlContent,
          metaTitle,
          metaDescription = "",
          metaFields = {},
        } = params;

        if (!pageId || !htmlContent || !metaTitle) {
          return NextResponse.json(
            { error: "pageId, htmlContent and metaTitle are required" },
            { status: 400 },
          );
        }

        const { data, error } = await htmlDb
          .from("html_pages")
          .update({
            html_content: htmlContent,
            meta_title: metaTitle,
            meta_description: metaDescription,
            meta_keywords: metaFields.metaKeywords || null,
            og_image: metaFields.ogImage || null,
            canonical_url: metaFields.canonicalUrl || null,
            is_indexable:
              metaFields.isIndexable !== undefined
                ? metaFields.isIndexable
                : false,
          })
          .eq("id", pageId)
          .eq("user_id", user.id)
          .select()
          .single();

        if (error) {
          console.error("[html-pages API] update error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data) {
          return NextResponse.json(
            { error: "Page not found or access denied" },
            { status: 404 },
          );
        }

        return NextResponse.json({
          success: true,
          pageId: data.id,
          url: `${HTML_SITE_URL}/p/${data.id}`,
          metaTitle: data.meta_title,
          metaDescription: data.meta_description,
          isIndexable: data.is_indexable,
          updatedAt: data.updated_at,
        });
      }

      case "delete": {
        const { pageId } = params;
        if (!pageId) {
          return NextResponse.json(
            { error: "pageId is required" },
            { status: 400 },
          );
        }

        const { error } = await htmlDb
          .from("html_pages")
          .delete()
          .eq("id", pageId)
          .eq("user_id", user.id);

        if (error) {
          console.error("[html-pages API] delete error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
      }

      case "list": {
        const { data, error } = await htmlDb
          .from("html_pages")
          .select(
            "id, meta_title, meta_description, is_indexable, created_at, artifact_id, source_message_id",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          // Fallback: select without new columns if migration hasn't run
          if (error.code === "42703") {
            const { data: fallback, error: fallbackError } = await htmlDb
              .from("html_pages")
              .select(
                "id, meta_title, meta_description, is_indexable, created_at",
              )
              .eq("user_id", user.id)
              .order("created_at", { ascending: false });

            if (fallbackError) {
              console.error(
                "[html-pages API] list fallback error:",
                fallbackError,
              );
              return NextResponse.json(
                { error: fallbackError.message },
                { status: 500 },
              );
            }

            return NextResponse.json({
              pages: (fallback || []).map((page) => ({
                ...page,
                artifact_id: null,
                source_message_id: null,
                url: `${HTML_SITE_URL}/p/${page.id}`,
              })),
            });
          }

          console.error("[html-pages API] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
          pages: (data || []).map((page) => ({
            ...page,
            url: `${HTML_SITE_URL}/p/${page.id}`,
          })),
        });
      }

      case "get": {
        const { pageId } = params;
        if (!pageId) {
          return NextResponse.json(
            { error: "pageId is required" },
            { status: 400 },
          );
        }

        const { data, error } = await htmlDb
          .from("html_pages")
          .select("*")
          .eq("id", pageId)
          .single();

        if (error) {
          console.error("[html-pages API] get error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
          ...data,
          url: `${HTML_SITE_URL}/p/${data.id}`,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[html-pages API] Unexpected error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
