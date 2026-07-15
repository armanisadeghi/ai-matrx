// features/education/publishing/sitemap.ts
//
// Enumerates every indexable Education Hub URL for the dynamic sitemap: the hub,
// each discovery-axis index + entry (subjects / levels / exam-prep / study-aids
// / features), each live tool, and every PUBLISHED learn doc. Paths are
// relative to the origin — the sitemap route prefixes the absolute base.

import "server-only";
import { EDU_AXES, EDU_BASE, EDU_LEARN_SEGMENT, eduHref } from "../constants";
import { getAxisEntries } from "../data/registry";
import { EDU_TOOLS } from "../data/tools";
import { getCreatorSitemapPaths } from "../creators/sitemap";
import { listPublishedLearnDocs } from "./queries";

export interface SitemapPath {
  path: string;
  changefreq: string;
  priority: string;
}

/** All indexable education paths (relative). Deduped by path. */
export async function getEducationSitemapPaths(): Promise<SitemapPath[]> {
  const seen = new Set<string>();
  const out: SitemapPath[] = [];
  const add = (path: string, changefreq: string, priority: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    out.push({ path, changefreq, priority });
  };

  add(EDU_BASE, "weekly", "0.8");

  for (const axis of EDU_AXES) {
    add(eduHref(axis.segment), "weekly", "0.7");
    for (const entry of getAxisEntries(axis.id)) {
      if (entry.status === "planned") continue; // not a real page yet
      add(
        eduHref(axis.segment, entry.slug),
        "monthly",
        entry.featured ? "0.7" : "0.6",
      );
    }
  }

  add(eduHref(EDU_LEARN_SEGMENT), "weekly", "0.7");
  const docs = await listPublishedLearnDocs();
  for (const d of docs) {
    add(eduHref(EDU_LEARN_SEGMENT, d.slug), "monthly", "0.6");
  }

  for (const tool of EDU_TOOLS) {
    // `creator` is the AUTHED manage surface (/education/creator, noindex) — its
    // public, indexable pages are /c/<handle> (added below), not this route.
    if (tool.slug === "creator") continue;
    if (tool.status === "live" || tool.status === "beta") {
      add(eduHref(tool.slug), "weekly", "0.6");
    }
  }

  // Public creator landing pages (/c/<handle>) — top-level acquisition pages.
  for (const p of await getCreatorSitemapPaths()) {
    add(p.path, p.changefreq, p.priority);
  }

  return out;
}
