// features/education/creators/sitemap.ts
//
// Sitemap entries for public creator landing pages (/c/[handle]). Consumed by
// the Education Hub sitemap (features/education/publishing/sitemap.ts), which
// the app sitemap route renders. Creator pages are a top-level namespace, so
// the paths are absolute-from-origin ("/c/<handle>").

import "server-only";
import { listPublicCreatorHandles } from "./queries";
import type { SitemapPath } from "../publishing/sitemap";

/** One entry per published creator page. High priority — these are acquisition pages. */
export async function getCreatorSitemapPaths(): Promise<SitemapPath[]> {
  const handles = await listPublicCreatorHandles();
  return handles.map((h) => ({
    path: `/c/${h.handle}`,
    changefreq: "weekly",
    priority: "0.7",
  }));
}
