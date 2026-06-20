/**
 * Shared YouTube URL primitives.
 *
 * Single source of truth for turning any YouTube URL (watch / share / embed /
 * shorts / live) into a video id + start offset, building a privacy-enhanced
 * embed URL, and deriving a poster thumbnail without an API call.
 *
 * Consumed by:
 *   - the markdown splitter's `detectYoutubeMarkdown` (auto-playable YouTube
 *     links in any rendered content)
 *   - `features/files/blocks/youtube/YouTubeEmbed` (the one embed component)
 *   - `features/research/.../mediaEmbed` (delegates its `youtubeId` here)
 *
 * Do NOT re-implement YouTube id extraction anywhere else — extend this file.
 */

/** A YouTube id is 11 chars in practice; allow 6+ of the id alphabet to be lenient. */
function isYouTubeId(id: string | undefined | null): id is string {
  return !!id && /^[A-Za-z0-9_-]{6,}$/.test(id);
}

/**
 * Parse a YouTube time token into whole seconds.
 * Accepts plain seconds ("15", "15s") and the `1h2m3s` form ("1m30s", "90").
 * Returns undefined when the token is absent or unparseable.
 */
export function parseYouTubeStart(
  token: string | null | undefined,
): number | undefined {
  if (!token) return undefined;
  const raw = token.trim();
  if (!raw) return undefined;

  // Plain integer seconds (the `start=` form and the common `t=15`).
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  // `1h2m3s` / `2m30s` / `45s` form.
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (m && (m[1] || m[2] || m[3])) {
    const h = parseInt(m[1] ?? "0", 10);
    const min = parseInt(m[2] ?? "0", 10);
    const s = parseInt(m[3] ?? "0", 10);
    const total = h * 3600 + min * 60 + s;
    return total > 0 ? total : undefined;
  }
  return undefined;
}

export interface ParsedYouTube {
  /** The 11-ish char video id. */
  videoId: string;
  /** Start offset in whole seconds, when the URL carried `t` / `start`. */
  start?: number;
}

/**
 * Extract `{ videoId, start }` from any YouTube URL, or null when the URL is
 * not a recognizable YouTube video link.
 */
export function parseYouTubeUrl(url: string): ParsedYouTube | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();

  let videoId: string | null = null;
  if (host === "youtu.be") {
    videoId = u.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host.endsWith("youtube.com") || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") {
      videoId = u.searchParams.get("v");
    } else {
      const m = u.pathname.match(/^\/(?:embed|shorts|v|live)\/([^/?#]+)/);
      videoId = m ? m[1] : null;
    }
  }

  if (!isYouTubeId(videoId)) return null;

  // Start offset: `?t=` or `?start=` (query), or `#t=` (hash fragment).
  const hashT = u.hash.match(/[#&]t=([^&]+)/)?.[1];
  const start =
    parseYouTubeStart(u.searchParams.get("start")) ??
    parseYouTubeStart(u.searchParams.get("t")) ??
    parseYouTubeStart(hashT);

  return start !== undefined ? { videoId, start } : { videoId };
}

/** Just the video id, or null — back-compat helper for callers that only need it. */
export function youtubeId(url: string): string | null {
  return parseYouTubeUrl(url)?.videoId ?? null;
}

/** YouTube site paths that are never channel/profile links. */
const YOUTUBE_NON_CHANNEL_SEGMENTS = new Set([
  "watch",
  "embed",
  "shorts",
  "v",
  "live",
  "results",
  "feed",
  "playlist",
  "account",
  "about",
  "trends",
  "gaming",
  "music",
  "news",
  "movies",
  "premium",
  "redirect",
  "attribution_link",
]);

/**
 * True when the URL points at a YouTube channel or profile page — not an
 * embeddable video. These must open on YouTube; they cannot be iframe-embedded.
 */
export function isYouTubeChannelUrl(url: string): boolean {
  if (parseYouTubeUrl(url)) return false;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") return false;
    if (!host.endsWith("youtube.com") && host !== "youtube-nocookie.com") {
      return false;
    }

    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return true;

    const first = segments[0].toLowerCase();
    if (YOUTUBE_NON_CHANNEL_SEGMENTS.has(first)) return false;

    if (first === "user" || first === "channel" || first === "c") return true;
    if (first.startsWith("@")) return true;

    // Legacy custom URLs: youtube.com/ChannelName
    return segments.length === 1;
  } catch {
    return false;
  }
}

/** A readable channel/handle label parsed from a YouTube channel URL. */
export function youTubeChannelLabel(url: string): string {
  try {
    const u = new URL(url.trim());
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return "YouTube";

    const first = segments[0];
    const firstLower = first.toLowerCase();
    if (first.startsWith("@")) return first;
    if (
      firstLower === "user" ||
      firstLower === "channel" ||
      firstLower === "c"
    ) {
      return segments[1] ?? first;
    }
    return first;
  } catch {
    return "YouTube channel";
  }
}

/** True when a thumbnail URL points at YouTube's image host (img.youtube.com / i.ytimg.com). */
export function isYouTubeThumbnailUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return host === "img.youtube.com" || host === "i.ytimg.com";
  } catch {
    return false;
  }
}

/** Privacy-enhanced (`youtube-nocookie.com`) embed URL for a video id. */
export function youTubeEmbedUrl(
  videoId: string,
  opts: { start?: number; autoplay?: boolean } = {},
): string {
  const params = new URLSearchParams({ rel: "0" });
  if (opts.autoplay) params.set("autoplay", "1");
  if (opts.start && opts.start > 0) params.set("start", String(opts.start));
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/** Canonical watch URL for a video id (used for durable round-trip + "open on YouTube"). */
export function youTubeWatchUrl(videoId: string, start?: number): string {
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  return start && start > 0 ? `${base}&t=${start}s` : base;
}

/** A poster thumbnail derived without any API call. `maxres` falls back to `hq`. */
export function youTubeThumbnail(
  videoId: string,
  quality: "maxres" | "hq" | "mq" | "sd" = "hq",
): string {
  const file =
    quality === "maxres"
      ? "maxresdefault"
      : quality === "mq"
        ? "mqdefault"
        : quality === "sd"
          ? "sddefault"
          : "hqdefault";
  return `https://i.ytimg.com/vi/${videoId}/${file}.jpg`;
}
