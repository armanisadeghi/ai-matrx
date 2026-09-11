import type { ResearchMedia } from "../../types";
// YouTube/Vimeo id extraction lives in the shared primitives — never re-implement.
import { youtubeId } from "@/lib/media/youtube";
import { vimeoId } from "@/lib/media/vimeo";
import { fileNameFromUrl } from "@ai-matrx/data/files";

export { youtubeId } from "@/lib/media/youtube";
export { vimeoId } from "@/lib/media/vimeo";

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

/**
 * A DISPLAY LABEL for a media URL: the recognized file name from
 * `@ai-matrx/data/files` (`response-content-disposition` name, else the last
 * path segment only when it carries an extension), otherwise the source host,
 * otherwise the raw URL. The package's ruling stands here: a segment that
 * does not look like a real name — a UUID, `report`, `download` — is NOT a
 * name and is never shown as one; the host is the honest label instead.
 */
export function mediaLabelFromUrl(url: string): string {
  return fileNameFromUrl(url) ?? hostLabel(url) ?? url;
}

/** Last raw path segment (query/hash stripped, decoded), or "". */
function rawPathSegment(url: string): string {
  const last = url.split(/[?#]/)[0]?.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** Lowercase file extension from a URL, or "": the recognized file name's
 * extension, else the raw path segment's (covers a disposition name that
 * carries no extension while the path does). */
export function fileExt(url: string): string {
  const name = fileNameFromUrl(url) ?? rawPathSegment(url);
  const m = name.match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toLowerCase() : "";
}

/** Host without `www.`, for a source label; null when `url` is not a URL. */
export function hostLabel(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
