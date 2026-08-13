/**
 * snapshot-video.ts — pure site-level aggregation of crawled VIDEO evidence.
 *
 * Input: per-page rows carrying the latest snapshot's DOM resource inventory
 * (already normalized by `parseSnapshotResources`). Output: one deduplicated
 * asset per real video/embed across the whole site, with every page it
 * appears on. The dedupe key is provider+id (youtube.com/embed/X and
 * youtu.be/X are the SAME video), never the raw URL.
 *
 * Provider identity reuses the canonical primitives — `lib/media/youtube`
 * (never re-implement id extraction) and research's `vimeoId`. Tracking
 * iframes the scraper mislabels as media (GTM noscript frames etc.) are
 * excluded via NON_MEDIA_EMBED_HOSTS, a named list, so the Videos view shows
 * evidence, not analytics noise.
 */

import {
  parseYouTubeUrl,
  youTubeEmbedUrl,
  youTubeThumbnail,
  youTubeWatchUrl,
} from "@/lib/media/youtube";
import { vimeoEmbedUrl, vimeoId } from "@/lib/media/vimeo";
import { videoPublishDateFromMetadata } from "@/lib/media/video-date";
import {
  isMediaResourceKind,
  type ParsedSnapshotResource,
} from "@/features/marketing/lib/snapshot-content";

/**
 * Hosts whose iframes are tracking/analytics scaffolding, never watchable
 * media, even though old scraper inventories could classify them as video
 * (a GTM `ns.html` noscript frame is the canonical offender).
 */
const NON_MEDIA_EMBED_HOSTS = new Set([
  "googletagmanager.com",
  "google-analytics.com",
  "doubleclick.net",
  "googlesyndication.com",
  "facebook.com/tr",
]);

function isTrackingEmbed(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (NON_MEDIA_EMBED_HOSTS.has(host)) return true;
    if (host === "facebook.com" && u.pathname.startsWith("/tr")) return true;
    // reCAPTCHA anchors are iframes but never media.
    return host === "google.com" && u.pathname.startsWith("/recaptcha");
  } catch {
    return false;
  }
}

/** Direct video file extensions the crawl can reference via <video>/<source>. */
const VIDEO_FILE_EXT = /\.(mp4|webm|m4v|mov|ogv|mkv|avi)(\?|#|$)/i;

/**
 * Structured-data video entries often carry the POSTER image URL under
 * kind="video" (e.g. `i.ytimg.com/vi/<id>/default.jpg`) — an image URL is
 * never the video itself.
 */
const IMAGE_FILE_EXT = /\.(png|jpe?g|webp|gif|svg|ico|avif)(\?|#|$)/i;

export type SiteVideoProvider = "youtube" | "vimeo" | "file" | "embed";

export interface SiteVideoPageRef {
  pageId: string;
  url: string;
  path: string | null;
}

export interface SiteVideoAsset {
  /** Stable dedupe key: `youtube:<id>` / `vimeo:<id>` / normalized URL. */
  key: string;
  provider: SiteVideoProvider;
  /** Canonical watch/source URL (durable round-trip form for YouTube). */
  url: string;
  /** Provider video id (YouTube/Vimeo), null for files and generic embeds. */
  videoId: string | null;
  /** Privacy-enhanced embed URL when the provider supports iframing. */
  embedUrl: string | null;
  /** Poster derived without an API call (YouTube only, today). */
  posterUrl: string | null;
  /** Provider/schema publish date when the crawl captured one. */
  publishedAt: string | null;
  /** The scraper's resource kind ("video" | "embed" | "iframe" | "audio"…). */
  kind: string;
  tag: string | null;
  mimeType: string | null;
  /** Every canonical page this video was observed on. */
  pages: SiteVideoPageRef[];
}

/** One page's latest-snapshot resource inventory, ready for aggregation. */
export interface SiteVideoResourceRow {
  pageId: string;
  url: string;
  path: string | null;
  capturedAt: string;
  resources: ParsedSnapshotResource[];
}

function canonicalize(resource: ParsedSnapshotResource): {
  key: string;
  provider: SiteVideoProvider;
  url: string;
  videoId: string | null;
  embedUrl: string | null;
  posterUrl: string | null;
  publishedAt: string | null;
} | null {
  const url = resource.url.trim();
  if (!url || isTrackingEmbed(url) || IMAGE_FILE_EXT.test(url)) return null;

  const yt = parseYouTubeUrl(url);
  if (yt) {
    return {
      key: `youtube:${yt.videoId}`,
      provider: "youtube",
      url: youTubeWatchUrl(yt.videoId, yt.start),
      videoId: yt.videoId,
      embedUrl: youTubeEmbedUrl(yt.videoId, { start: yt.start }),
      posterUrl: youTubeThumbnail(yt.videoId),
      publishedAt: videoPublishDateFromMetadata(resource.attributes),
    };
  }

  const vm = vimeoId(url);
  if (vm) {
    return {
      key: `vimeo:${vm}`,
      provider: "vimeo",
      url,
      videoId: vm,
      embedUrl: vimeoEmbedUrl(vm),
      posterUrl: null,
      publishedAt: videoPublishDateFromMetadata(resource.attributes),
    };
  }

  const isFile =
    VIDEO_FILE_EXT.test(url) ||
    (resource.mimeType?.startsWith("video/") ?? false);
  const providerHint = resource.attributes.provider;
  const hasExplicitVideoEvidence =
    resource.kind.toLowerCase() === "video" ||
    isFile ||
    (typeof providerHint === "string" && providerHint.trim().length > 0);
  // The crawler deliberately records arbitrary iframe/embed/object resources
  // as `embed`; only recognized media providers are promoted to `video` and
  // carry a provider hint. Requiring that positive signal keeps Maps, forms,
  // calendars, documents, and other embedded tools out of the video library.
  // YouTube/Vimeo are handled above so older snapshots remain compatible.
  if (!hasExplicitVideoEvidence) return null;
  let normalized = url;
  try {
    const u = new URL(url);
    u.hash = "";
    normalized = u.toString();
  } catch {
    return null; // Not an absolute URL — not renderable evidence.
  }
  return {
    key: normalized.toLowerCase(),
    provider: isFile ? "file" : "embed",
    url: normalized,
    videoId: null,
    embedUrl: null,
    posterUrl: null,
    publishedAt: videoPublishDateFromMetadata(resource.attributes),
  };
}

/**
 * Fold every page's media resources into one deduplicated site-level video
 * inventory, providers first (YouTube/Vimeo/file before generic embeds),
 * most-referenced first within each group.
 */
export function buildSiteVideoAssets(
  rows: SiteVideoResourceRow[],
): SiteVideoAsset[] {
  const byKey = new Map<string, SiteVideoAsset>();
  for (const row of rows) {
    for (const resource of row.resources) {
      if (!isMediaResourceKind(resource.kind)) continue;
      if (resource.kind.toLowerCase() === "audio") continue;
      const canonical = canonicalize(resource);
      if (!canonical) continue;
      const existing = byKey.get(canonical.key);
      if (existing) {
        existing.publishedAt ??= canonical.publishedAt;
        if (!existing.pages.some((page) => page.pageId === row.pageId)) {
          existing.pages.push({
            pageId: row.pageId,
            url: row.url,
            path: row.path,
          });
        }
        continue;
      }
      byKey.set(canonical.key, {
        ...canonical,
        kind: resource.kind.toLowerCase(),
        tag: resource.tag,
        mimeType: resource.mimeType,
        pages: [{ pageId: row.pageId, url: row.url, path: row.path }],
      });
    }
  }
  const rank: Record<SiteVideoProvider, number> = {
    youtube: 0,
    vimeo: 1,
    file: 2,
    embed: 3,
  };
  return [...byKey.values()].sort(
    (a, b) =>
      rank[a.provider] - rank[b.provider] || b.pages.length - a.pages.length,
  );
}
