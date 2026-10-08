/**
 * A chat page's ONE truth is its `canvas_items` version chain; `html_pages` is a
 * derived publication — one page per VERSION row (`html_pages.artifact_id =
 * canvas_items.id`, `canvas_items.external_id = html_pages.id`). Rendered-output
 * standard, ruling 1 (common-docs/projects/rendered-output-standard/PLAN.md).
 *
 * - `publishHtmlCanvasVersion` is called ONLY when a version is saved
 *   (materialize, a user's canvas save). Never on mount. It goes to the server.
 * - `resolveHtmlCanvasPage` is the read the chat card and the canvas tab use:
 *   the card serves ITS version, the canvas the chain's latest. It never writes.
 *
 * The one writer is aidream `services/artifacts/html_publication.py`
 * (endpoint `POST /cms/html-artifacts/{id}/publish`, tool `edit_artifact`).
 */

import { supabase } from "@/utils/supabase/client";
import { callApi } from "@/lib/api/call-api";
import { getStore } from "@/lib/redux/store-singleton";
import type { AppDispatch } from "@/lib/redux/store";

const HTML_SITE_URL =
  process.env.NEXT_PUBLIC_HTML_SITE_URL || "https://www.mymatrx.com";

export const HTML_PAGES_SYSTEM = "html_pages";

export function htmlPageUrl(pageId: string): string {
  return `${HTML_SITE_URL}/p/${pageId}`;
}

/**
 * Publish ONE saved canvas version through the server's one writer
 * (`POST /cms/html-artifacts/{id}/publish`): it reads the version, writes its
 * own `html_pages` row (idempotent per version) and links `external_id`. The
 * html_pages database is a separate Supabase project with no client access, so
 * the server is the door — no Next.js route sits in between.
 */
export async function publishHtmlCanvasVersion(
  canvasItemId: string,
): Promise<{ pageId: string; url: string }> {
  const store = getStore();
  if (!store) throw new Error("Publishing a page needs the app to be loaded.");
  const dispatch = store.dispatch as AppDispatch;
  const result = await dispatch(
    callApi({
      path: "/cms/html-artifacts/{canvas_item_id}/publish",
      method: "POST",
      pathParams: { canvas_item_id: canvasItemId },
    }),
  );
  if (result.error) throw new Error(result.error.message);
  const data = result.data as { page_id?: unknown; page_url?: unknown } | null;
  if (!data || typeof data.page_id !== "string" || typeof data.page_url !== "string") {
    throw new Error("The publish answer named no page.");
  }
  notifyHtmlVersionPublished(canvasItemId);
  return { pageId: data.page_id, url: data.page_url };
}

interface VersionRow {
  id: string;
  chain_version: number;
  parent_canvas_id: string | null;
  external_system: string | null;
  external_id: string | null;
  content: unknown;
}

export interface ResolvedVersion {
  id: string;
  version: number;
  url: string | null;
  /** This version's own HTML — what Copy / Download hand over. */
  html: string | null;
}

export interface ResolvedHtmlCanvasPage {
  /** The version this surface shows. */
  shown: ResolvedVersion;
  /** The chain's newest version (equals `shown` when the surface is current). */
  latest: ResolvedVersion;
}

function htmlOf(content: unknown): string | null {
  if (!content || typeof content !== "object") return null;
  const data = (content as { data?: unknown }).data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const html = (data as { html?: unknown }).html;
    return typeof html === "string" ? html : null;
  }
  return null;
}

function resolved(row: VersionRow): ResolvedVersion {
  return {
    id: row.id,
    version: row.chain_version,
    url:
      row.external_system === HTML_PAGES_SYSTEM && row.external_id
        ? htmlPageUrl(row.external_id)
        : null,
    html: htmlOf(row.content),
  };
}

/** Read-only: the published page of `canvasItemId` (or its chain's latest). */
export async function resolveHtmlCanvasPage(
  canvasItemId: string,
  which: "self" | "latest",
): Promise<ResolvedHtmlCanvasPage | null> {
  const columns =
    "id, chain_version, parent_canvas_id, external_system, external_id, content";
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
  // `chain_version` is the chain's own number (assigned at INSERT); `version` is
  // the row-revision token every update bumps, so it never orders a chain.
  const { data: chain, error: chainError } = await supabase
    .schema("canvas")
    .from("canvas_items")
    .select(columns)
    .or(`id.eq.${rootId},parent_canvas_id.eq.${rootId}`)
    .is("deleted_at", null)
    .order("chain_version", { ascending: false })
    .limit(1)
    .returns<VersionRow[]>();
  if (chainError) throw new Error(chainError.message);
  const newest = chain?.[0] ?? own;
  return {
    shown: resolved(which === "latest" ? newest : own),
    latest: resolved(newest),
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
