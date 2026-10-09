/** Preserve HTTP(S) and recognizable relative addresses; never interpret HTML as a URL.
 * Relative addresses must use an opaque sandbox in their consumer.
 */
export function safeEmbedUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const address = value.trim();
  if (!address || /[<>]/.test(address)) return null;
  if (!/^https?:\/\//i.test(address) && !/^(?:\/|\.\.?\/|\?|#)/.test(address))
    return null;
  try {
    const url = new URL(address, "https://invalid.local");
    return url.protocol === "http:" || url.protocol === "https:"
      ? address
      : null;
  } catch {
    return null;
  }
}
