/** Drafts use an opaque origin; only a known separate HTTP(S) page keeps its origin.
 * This classifies the initial URL, not a publisher's subsequent redirects.
 */
export function pageSandbox(
  url: string | null,
  base: string,
  appOrigin: string | null = null,
): string {
  const opaque = base.split(/\s+/).filter(flag => flag !== "allow-same-origin").join(" ");
  if (!url || !appOrigin) return opaque;
  try {
    const app = new URL(appOrigin);
    const page = new URL(url);
    if (!["http:", "https:"].includes(app.protocol) ||
        !["http:", "https:"].includes(page.protocol) || page.origin === app.origin) return opaque;
    return base;
  } catch { return opaque; }
}
