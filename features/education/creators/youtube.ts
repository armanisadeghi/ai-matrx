// features/education/creators/youtube.ts
//
// Pure helpers for the YouTube-embed feature. Importable, side-effect-free.

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extract an 11-char YouTube video id from any common URL shape, or return the
 * input if it already IS a bare id. Returns null when nothing valid is found.
 * Handles: watch?v=, youtu.be/, /embed/, /shorts/, /live/, and bare ids.
 */
export function parseYouTubeId(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (YT_ID.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return YT_ID.test(id) ? id : null;
  }
  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const v = url.searchParams.get("v");
    if (v && YT_ID.test(v)) return v;
    const parts = url.pathname.split("/").filter(Boolean);
    // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
    const idx = parts.findIndex((p) => ["embed", "shorts", "live", "v"].includes(p));
    if (idx >= 0 && parts[idx + 1] && YT_ID.test(parts[idx + 1])) return parts[idx + 1];
  }
  return null;
}

/** Privacy-friendly (nocookie) embed URL for a validated video id. */
export function youTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
}

/** Canonical thumbnail (hqdefault) — durable, anonymous-readable CDN URL. */
export function youTubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Watch URL for a "watch on YouTube" fallback link. */
export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
