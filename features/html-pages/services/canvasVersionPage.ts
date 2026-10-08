/**
 * A chat page's ONE truth is its `canvas_items` version chain; `html_pages` is a
 * derived publication — one page per VERSION row (`html_pages.artifact_id =
 * canvas_items.id`, `canvas_items.external_id = html_pages.id`). Rendered-output
 * standard, ruling 1 (common-docs/projects/rendered-output-standard/PLAN.md).
 *
 * - `publishHtmlCanvasVersion` is called ONLY when a version is saved
 *   (materialize, a user's canvas save). Never on mount.
 * - `resolveHtmlCanvasPage` is the read the chat card and the canvas tab use:
 *   the card serves ITS version, the canvas the chain's latest. It never writes.
 *
 * The server twin (aidream `services/artifacts/html_publication.py`, endpoint
 * `POST /cms/html-artifacts/{id}/publish`, tool `edit_artifact`) applies the
 * same one-page-per-version rule.
 */

import { supabase } from "@/utils/supabase/client";
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { requireUserId } from "@/utils/auth/getUserId";

const HTML_SITE_URL =
  process.env.NEXT_PUBLIC_HTML_SITE_URL || "https://www.mymatrx.com";

export const HTML_PAGES_SYSTEM = "html_pages";

export function htmlPageUrl(pageId: string): string {
  return `${HTML_SITE_URL}/p/${pageId}`;
}

export interface PublishableHtmlVersion {
  id: string;
  html: string;
  title?: string | null;
  sourceMessageId?: string | null;
  conversationId?: string | null;
}

/** Publish one version and link it. Idempotent per version id. */
export async function publishHtmlCanvasVersion(
  version: PublishableHtmlVersion,
): Promise<{ pageId: string; url: string } | null> {
  if (!version.html.trim()) return null;
  const result = await HTMLPageService.createPage(
    version.html,
    version.title || "Web page",
    "Generated from chat",
    requireUserId(),
    {},
    {
      artifactId: version.id,
      sourceMessageId: version.sourceMessageId ?? undefined,
      sourceConversationId: version.conversationId ?? undefined,
    },
  );
  const pageId = result?.pageId ?? result?.id;
  if (!pageId) return null;
  await canvasArtifactService.setExternalLink(version.id, {
    externalSystem: HTML_PAGES_SYSTEM,
    externalId: String(pageId),
  });
  notifyHtmlVersionPublished(version.id);
  return { pageId: String(pageId), url: htmlPageUrl(String(pageId)) };
}

interface VersionRow {
  id: string;
  version: number;
  parent_canvas_id: string | null;
  external_system: string | null;
  external_id: string | null;
}

export interface ResolvedHtmlCanvasPage {
  /** The version this surface shows. */
  shown: { id: string; version: number; url: string | null };
  /** The chain's newest version (equals `shown` when the surface is current). */
  latest: { id: string; version: number; url: string | null };
}

function urlOf(row: VersionRow): string | null {
  return row.external_system === HTML_PAGES_SYSTEM && row.external_id
    ? htmlPageUrl(row.external_id)
    : null;
}

/** Read-only: the published page of `canvasItemId` (or its chain's latest). */
export async function resolveHtmlCanvasPage(
  canvasItemId: string,
  which: "self" | "latest",
): Promise<ResolvedHtmlCanvasPage | null> {
  const columns = "id, version, parent_canvas_id, external_system, external_id";
  const { data: own, error } = await supabase
    .schema("canvas")
    .from("canvas_items")
    .select(columns)
    .eq("id", canvasItemId)
    .is("deleted_at", null)
    .maybeSingle<VersionRow>();
  if (error) throw new Error(error.message);
  if (!own) return null;
  const rootId = own.parent_canvas_id ?? own.id;
  const { data: chain, error: chainError } = await supabase
    .schema("canvas")
    .from("canvas_items")
    .select(columns)
    .or(`id.eq.${rootId},parent_canvas_id.eq.${rootId}`)
    .is("deleted_at", null)
    .order("version", { ascending: false })
    .limit(1)
    .returns<VersionRow[]>();
  if (chainError) throw new Error(chainError.message);
  const newest = chain?.[0] ?? own;
  const shownRow = which === "latest" ? newest : own;
  return {
    shown: { id: shownRow.id, version: shownRow.version, url: urlOf(shownRow) },
    latest: { id: newest.id, version: newest.version, url: urlOf(newest) },
  };
}

// ── "a version was published" — lets a mounted card pick up its page the moment
// the materializer (or a save) publishes it, without the card ever writing. ──
const PUBLISHED_EVENT = "matrx:html-canvas-version-published";

export function notifyHtmlVersionPublished(canvasItemId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PUBLISHED_EVENT, { detail: { canvasItemId } }),
  );
}

export function onHtmlVersionPublished(
  listener: (canvasItemId: string) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    const id = (event as CustomEvent<{ canvasItemId?: string }>).detail
      ?.canvasItemId;
    if (id) listener(id);
  };
  window.addEventListener(PUBLISHED_EVENT, handler);
  return () => window.removeEventListener(PUBLISHED_EVENT, handler);
}
