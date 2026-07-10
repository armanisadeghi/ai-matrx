import type { ClientEntityVersionDetail, PageVersionContent } from "@/features/cms/types";

/**
 * Read the `client_page` content fields out of a version's raw `data` snapshot.
 *
 * `history.row_versions.row_data` is the whole row as it was, and its columns
 * differ per entity — so the version DTO carries the snapshot untyped and each
 * entity gets its own reader. This is the one for pages.
 */

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

export function pageVersionContent(
  version: ClientEntityVersionDetail,
): PageVersionContent {
  const d = version.data ?? {};
  return {
    title: str(d.title),
    slug: str(d.slug),
    is_published: bool(d.is_published),
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
