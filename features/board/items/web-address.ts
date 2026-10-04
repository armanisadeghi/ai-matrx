/** Web addresses a person typed, pasted or dropped onto a board (pure). */

/** A URL the person typed, made absolute; null when it is not a web URL. */
export function parseWebUrl(value: string): URL | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i;
export const looksLikeImageUrl = (url: URL) => IMAGE_EXT.test(url.pathname);
