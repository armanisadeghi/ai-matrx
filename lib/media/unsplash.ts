/**
 * lib/media/unsplash.ts
 *
 * THE shared Unsplash primitive. Every surface that puts a stock photo into
 * our data goes through here, so three things can never diverge:
 *
 *   1. the transport — always the server proxy `/api/unsplash`
 *      (`hooks/images/unsplashClient`), so the access key stays server-side;
 *   2. the ToS contract — attribution travels WITH the photo
 *      (`credit.name` / `credit.url`, UTM-tagged per the Unsplash API
 *      guidelines) and `trackUnsplashUse()` fires the download event when the
 *      photo is actually USED (saved/embedded), never merely rendered;
 *   3. durability — `url` is Unsplash's own permanent CDN URL, which is safe
 *      to persist and safe for anonymous readers (media-durability doctrine:
 *      never store a signed URL).
 *
 * Consumers: `components/mardown-display/blocks/presentations/slide-images.ts`
 * (slide decks, one-shot best match) and the flashcard editor's free UNSPLASH
 * lane (pick from results).
 */

import { unsplashClient } from "@/hooks/images/unsplashClient";

/** Attribution required by the Unsplash API guidelines. */
export interface UnsplashCredit {
  name: string;
  /** Photographer profile URL, UTM-tagged. */
  url?: string;
}

/** One choosable photo, already reduced to what we persist and render. */
export interface UnsplashPick {
  id: string;
  /** Permanent Unsplash CDN URL — durable, anonymous-readable. */
  url: string;
  /** Small URL for result grids. */
  thumbUrl: string;
  /** Unsplash's own description — the honest starting point for alt text. */
  alt?: string;
  credit: UnsplashCredit;
  /** Opaque handle for the ToS download event. */
  downloadLocation?: string;
}

/** Legacy shape kept for the slide-deck consumer. */
export interface ResolvedImage {
  url: string;
  credit?: string;
  creditUrl?: string;
}

const UTM = "?utm_source=ai_matrx&utm_medium=referral";

type UnsplashPhotoLike = {
  id?: string;
  urls?: { regular?: string; small?: string };
  links?: { html?: string; download_location?: string };
  user?: { name?: string; links?: { html?: string } };
  alt_description?: string | null;
  description?: string | null;
};

function toPick(photo: UnsplashPhotoLike): UnsplashPick | null {
  const url = photo?.urls?.regular;
  if (!url) return null;
  const profile = photo?.user?.links?.html ?? photo?.links?.html;
  return {
    id: photo.id ?? url,
    url,
    thumbUrl: photo?.urls?.small ?? url,
    alt: photo.alt_description || photo.description || undefined,
    credit: {
      name: photo?.user?.name || "Unsplash",
      url: profile ? `${profile}${UTM}` : undefined,
    },
    downloadLocation: photo?.links?.download_location,
  };
}

/**
 * Search Unsplash and return choosable picks. Never throws — an outage or a
 * miss is an empty list, which the caller renders as "nothing found".
 */
export async function searchUnsplashPhotos(
  query: string,
  opts: { perPage?: number; orientation?: "landscape" | "portrait" | "squarish" } = {},
): Promise<UnsplashPick[]> {
  const q = query.trim();
  if (!q) return [];
  const result = await unsplashClient.search.getPhotos({
    query: q,
    perPage: opts.perPage ?? 12,
    orientation: opts.orientation ?? "landscape",
    contentFilter: "high",
  });
  if (result.type !== "success") return [];
  return (result.response?.results ?? [])
    .map((photo) => toPick(photo as UnsplashPhotoLike))
    .filter((p): p is UnsplashPick => p !== null);
}

/**
 * Unsplash ToS: register the use of a photo when it is actually used.
 * Fire-and-forget — a failed ping must never block the user's action.
 */
export function trackUnsplashUse(pick: Pick<UnsplashPick, "downloadLocation">): void {
  if (!pick.downloadLocation) return;
  void unsplashClient.photos
    .trackDownload({ downloadLocation: pick.downloadLocation })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// One-shot best match (slide decks) — module-scoped cache + in-flight dedup,
// so the same prompt resolves once per session and a deck rendered in several
// places shares the result.
// ---------------------------------------------------------------------------

const cache = new Map<string, ResolvedImage | null>();
const inflight = new Map<string, Promise<ResolvedImage | null>>();

/** Resolve a search phrase to the best landscape Unsplash photo (or null). */
export async function resolveUnsplashImage(query: string): Promise<ResolvedImage | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  const existing = inflight.get(key);
  if (existing) return existing;

  const p = (async (): Promise<ResolvedImage | null> => {
    try {
      const [pick] = await searchUnsplashPhotos(query, { perPage: 1 });
      if (!pick) {
        cache.set(key, null);
        return null;
      }
      trackUnsplashUse(pick);
      const resolved: ResolvedImage = {
        url: pick.url,
        credit: pick.credit.name,
        creditUrl: pick.credit.url,
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
