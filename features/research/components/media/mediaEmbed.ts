import type { ResearchMedia } from "../../types";

/** Extract a YouTube video id from watch / share / embed / shorts URLs. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return isYtId(id) ? id : null;
    }
    if (host.endsWith("youtube.com") || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") {
        const v = u.searchParams.get("v");
        return v && isYtId(v) ? v : null;
      }
      const m = u.pathname.match(/^\/(?:embed|shorts|v|live)\/([^/?#]+)/);
      return m && isYtId(m[1]) ? m[1] : null;
    }
  } catch {
    /* malformed */
  }
  return null;
}

function isYtId(id: string | undefined): id is string {
  return !!id && /^[A-Za-z0-9_-]{6,}$/.test(id);
}

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

export interface EmbedInfo {
  provider: "youtube" | "vimeo";
  embedUrl: string;
  /** Poster thumbnail derived without any API call (YouTube only). */
  poster: string | null;
}

/** Embed info for a media row, or null when it can't be embedded inline. */
export function embedInfo(item: ResearchMedia): EmbedInfo | null {
  if (item.media_type !== "video") return null;
  const yt = youtubeId(item.url);
  if (yt) {
    return {
      provider: "youtube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0`,
      poster: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
    };
  }
  const vm = vimeoId(item.url);
  if (vm) {
    return {
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${vm}?autoplay=1`,
      poster: null,
    };
  }
  return null;
}

/** Best poster for a video row: server thumbnail → derived YouTube thumb. */
export function videoPoster(item: ResearchMedia): string | null {
  if (item.thumbnail_url) return item.thumbnail_url;
  const yt = youtubeId(item.url);
  return yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null;
}

/** A readable file name from a URL path (decoded, query stripped). */
export function fileNameFromUrl(url: string): string {
  try {
    const p = new URL(url).pathname;
    const last = decodeURIComponent(p.split("/").filter(Boolean).pop() ?? "");
    return last || new URL(url).hostname;
  } catch {
    return url.split("/").pop() || url;
  }
}

/** Lowercase file extension from a URL path, or "". */
export function fileExt(url: string): string {
  const name = fileNameFromUrl(url);
  const m = name.match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toLowerCase() : "";
}

/** Host without `www.`, for a source label. */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
