/**
 * Shared Vimeo URL primitives — the Vimeo sibling of `lib/media/youtube`.
 *
 * Single source of truth for extracting a Vimeo video id and building a
 * player embed URL. Consumed by `features/research/.../mediaEmbed` (which
 * re-exports `vimeoId` for its local callers) and
 * `features/marketing/lib/snapshot-video`.
 *
 * Do NOT re-implement Vimeo id extraction anywhere else — extend this file.
 */

/** Extract a numeric Vimeo id from player/share URLs. */
export function vimeoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
      const m = u.pathname.match(/(\d{6,})/);
      return m ? m[1] : null;
    }
  } catch {
    /* malformed */
  }
  return null;
}

/** Player embed URL for a Vimeo video id. */
export function vimeoEmbedUrl(
  videoId: string,
  opts: { autoplay?: boolean } = {},
): string {
  return `https://player.vimeo.com/video/${videoId}${opts.autoplay ? "?autoplay=1" : ""}`;
}
