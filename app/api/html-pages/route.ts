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
import { readAllRows } from "@ai-matrx/data/db";
import type { HtmlPageSummary } from "@/features/html-pages/types";
import { isJsonObject } from "@/types/json";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import {
  archiveLive,
  archiveNotLiveResponse,
  onlyLive,
} from "@/app/api/cms/_lib/cmsArchive";
import { writeOneRow } from "@/utils/supabase/writeOne";

const HTML_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_HTML_URL ?? "";
const HTML_SUPABASE_SECRET_KEY = process.env.SUPABASE_HTML_SECRET_KEY ?? "";

const HTML_SITE_URL =
  process.env.NEXT_PUBLIC_HTML_SITE_URL || "https://www.mymatrx.com";

type HtmlPageListRow = Omit<HtmlPageSummary, "url">;
type LegacyHtmlPageListRow = Pick<
  HtmlPageListRow,
  | "id"
  | "meta_title"
  | "meta_description"
  | "is_indexable"
  | "created_at"
  | "updated_at"
> &
  Record<string, unknown>;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isLegacyHtmlPageListRow(
  value: unknown,
): value is LegacyHtmlPageListRow {
  if (!isJsonObject(value)) return false;
  const row = value;
  return (
    typeof row.id === "string" &&
    typeof row.meta_title === "string" &&
    isNullableString(row.meta_description) &&
    typeof row.is_indexable === "boolean" &&
    typeof row.created_at === "string" &&
    typeof row.updated_at === "string"
  );
}

function isHtmlPageListRow(value: unknown): value is HtmlPageListRow {
  if (!isLegacyHtmlPageListRow(value)) return false;
  const row = value;
  return (
    isNullableString(row.meta_keywords) &&
    isNullableString(row.og_image) &&
    isNullableString(row.canonical_url) &&
    isNullableString(row.artifact_id) &&
    isNullableString(row.source_message_id) &&
    isNullableString(row.source_conv_id)
  );
}

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
    } = await getClaimsUser(mainSupabase);

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

        // Always a NEW page. A chat page's publication is never made here: the
        // server's one writer publishes each canvas version
        // (aidream POST /cms/html-artifacts/{id}/publish). Reuse by source
        // message or identical content is gone — it made the chat card and the
        // canvas tab overwrite one page in turn.
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
          metaDescription,
          metaFields = {},
        } = params;

        if (!pageId) {
          return NextResponse.json(
            { error: "pageId is required" },
            { status: 400 },
          );
        }

        // Partial update: only write fields the caller actually sent.
        // Metadata-only saves (CMS editor) omit htmlContent; full republish
        // from chat/preview still sends the complete document.
        const updateData: Record<string, unknown> = {};
        if (htmlContent !== undefined) updateData.html_content = htmlContent;
        if (metaTitle !== undefined) {
          if (!metaTitle || typeof metaTitle !== "string") {
            return NextResponse.json(
              { error: "metaTitle cannot be empty" },
              { status: 400 },
            );
          }
          updateData.meta_title = metaTitle;
        }
        if (metaDescription !== undefined) {
          updateData.meta_description = metaDescription;
        }
        if (metaFields.metaKeywords !== undefined) {
          updateData.meta_keywords = metaFields.metaKeywords || null;
        }
        if (metaFields.ogImage !== undefined) {
          updateData.og_image = metaFields.ogImage || null;
        }
        if (metaFields.canonicalUrl !== undefined) {
          updateData.canonical_url = metaFields.canonicalUrl || null;
        }
        if (metaFields.isIndexable !== undefined) {
          updateData.is_indexable = Boolean(metaFields.isIndexable);
        }

        if (Object.keys(updateData).length === 0) {
          return NextResponse.json(
            { error: "No fields to update" },
            { status: 400 },
          );
        }

        const { data, error } = await writeOneRow(
          htmlDb
            .from("html_pages")
            .update(updateData)
            .eq("id", pageId)
            .eq("user_id", user.id)
            .select(),
          { action: "update", noun: "html page" },
        );

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

        // ARCHIVE, never destroy (CMS 0041). Before the column exists the delete
        // REFUSES; there is no hard-delete fallback.
        if (!(await archiveLive(htmlDb, "html_pages"))) {
          return archiveNotLiveResponse("a page");
        }
        const { data: deleted, error } = await htmlDb
          .from("html_pages")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", pageId)
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .select("id")
          .maybeSingle();

        if (error) {
          console.error("[html-pages API] archive error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!deleted) {
          return NextResponse.json(
            { error: "Page not found or access denied" },
            { status: 404 },
          );
        }

        return NextResponse.json({ success: true, archived: true });
      }

      case "list": {
        const currentColumns =
          "id, meta_title, meta_description, meta_keywords, og_image, canonical_url, is_indexable, created_at, updated_at, artifact_id, source_message_id, source_conv_id";
        const legacyColumns =
          "id, meta_title, meta_description, is_indexable, created_at, updated_at";

        // The table is rendered and searched as the user's complete library.
        // PostgREST caps a bare select at 1,000 rows, so this must read every
        // counted page or fail the request rather than report an incomplete list.
        const pagesArchive = await archiveLive(htmlDb, "html_pages");
        const readUserPages = async (columns: string): Promise<unknown[] | null> => {
          let missingColumn = false;
          try {
            return await readAllRows<unknown>(
              async ({ from, to }) => {
                const result = await onlyLive(
                  htmlDb
                    .from("html_pages")
                    .select(columns, { count: "exact" })
                    .eq("user_id", user.id),
                  pagesArchive,
                )
                  .order("updated_at", { ascending: false })
                  .order("id", { ascending: false })
                  .range(from, to);
                // `readAllRows` deliberately reduces query errors to their
                // message. Preserve the pre-existing legacy-schema fallback
                // using the actual PostgREST error code, never its wording.
                missingColumn ||= result.error?.code === "42703";
                return result;
              },
              { label: "html_pages owner-scoped list" },
            );
          } catch (error) {
            if (missingColumn) return null;
            throw error;
          }
        };

        try {
          const pages = await readUserPages(currentColumns);
          if (pages) {
            if (!pages.every(isHtmlPageListRow)) {
              throw new Error("html_pages list returned an invalid summary row");
            }
            return NextResponse.json({
              pages: pages.map((page) => ({
                ...page,
                url: `${HTML_SITE_URL}/p/${page.id}`,
              })),
            });
          }

          // Fallback: select without newer columns if migration hasn't run.
          const legacyPages = await readUserPages(legacyColumns);
          if (!legacyPages) {
            throw new Error("html_pages legacy list query references a missing column");
          }
          if (!legacyPages.every(isLegacyHtmlPageListRow)) {
            throw new Error("html_pages legacy list returned an invalid summary row");
          }

          return NextResponse.json({
            pages: legacyPages.map((page) => ({
              ...page,
              meta_keywords: null,
              og_image: null,
              canonical_url: null,
              artifact_id: null,
              source_message_id: null,
              source_conv_id: null,
              url: `${HTML_SITE_URL}/p/${page.id}`,
            })),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to list pages";
          console.error("[html-pages API] list error:", error);
          return NextResponse.json({ error: message }, { status: 500 });
        }
      }

      case "get": {
        const { pageId } = params;
        if (!pageId) {
          return NextResponse.json(
            { error: "pageId is required" },
            { status: 400 },
          );
        }

        // Owner-scoped: htmlDb uses the secret key (bypasses RLS), so we MUST
        // constrain by user_id ourselves. Without it any authenticated user
        // could read any page (incl. unpublished drafts + internal source ids)
        // by guessing/enumerating UUIDs. Published pages are served publicly by
        // the mymatrx site itself — this authoring endpoint is owner-only.
        const { data, error } = await onlyLive(
          htmlDb
            .from("html_pages")
            .select("*")
            .eq("id", pageId)
            .eq("user_id", user.id),
          await archiveLive(htmlDb, "html_pages"),
        ).maybeSingle();

        if (error) {
          console.error("[html-pages API] get error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data) {
          return NextResponse.json(
            { error: "Page not found or access denied" },
            { status: 404 },
          );
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
