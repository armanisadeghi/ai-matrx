/**
 * Slide image resolution — turns a slide's `extra.imagePrompt` into a real
 * Unsplash photo when no explicit `image_url` was provided. Module-scoped cache
 * + in-flight dedup (the same prompt resolves once per session, and the same
 * deck rendered in several places shares the result).
 *
 * Unsplash API guidelines are honored: we keep attribution (photographer name +
 * link) and fire a download-tracking event when a photo is used in a deck.
 */

export interface ResolvedImage {
  url: string;
  credit?: string;
  creditUrl?: string;
}

const cache = new Map<string, ResolvedImage | null>();
const inflight = new Map<string, Promise<ResolvedImage | null>>();

const UTM = "?utm_source=ai_matrx&utm_medium=referral";

/** Resolve a search phrase to the best landscape Unsplash photo (or null). */
export async function resolveUnsplashImage(query: string): Promise<ResolvedImage | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  const existing = inflight.get(key);
  if (existing) return existing;

  const p = (async (): Promise<ResolvedImage | null> => {
    try {
      const res = await fetch("/api/unsplash", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method: "search.getPhotos",
          args: { query, perPage: 1, orientation: "landscape", contentFilter: "high" },
        }),
      });
      if (!res.ok) {
        cache.set(key, null);
        return null;
      }
      const data = await res.json();
      const photo = data?.response?.results?.[0];
      const url: string | undefined = photo?.urls?.regular;
      if (!url) {
        cache.set(key, null);
        return null;
      }

      // ToS: register the use of the photo (fire-and-forget).
      const downloadLocation: string | undefined = photo?.links?.download_location;
      if (downloadLocation) {
        void fetch("/api/unsplash", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method: "photos.trackDownload", args: { downloadLocation } }),
        }).catch(() => {});
      }

      const creditUrl: string | undefined = photo?.user?.links?.html ?? photo?.links?.html;
      const resolved: ResolvedImage = {
        url,
        credit: photo?.user?.name,
        creditUrl: creditUrl ? `${creditUrl}${UTM}` : undefined,
      };
      cache.set(key, resolved);
      return resolved;
    } catch {
      cache.set(key, null);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}
