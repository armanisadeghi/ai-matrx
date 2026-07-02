/**
 * hooks/images/unsplashClient.ts
 *
 * Client-side shim around `unsplash-js` — exposes the same nested
 * `client.<group>.<call>(args)` shape that the rest of our code expects,
 * but every call goes through the server route at `app/api/unsplash`
 * so the access key stays on the server.
 *
 * The returned envelope (`{ type: "success" | "error", response, errors? }`)
 * matches the official unsplash-js shape, so consuming code can keep its
 * existing `result.type === "success"` branching unchanged.
 *
 * If you need a new method, add it both here and in the server route's
 * `UnsplashMethod` switch.
 */

import type { Basic as UnsplashBasicPhoto } from "unsplash-js/dist/methods/photos/types";
import type { Basic as UnsplashBasicCollection } from "unsplash-js/dist/methods/collections/types";
import type { Basic as UnsplashBasicTopic } from "unsplash-js/dist/methods/topics/types";

type UnsplashEnvelope<TResponse> =
  | { type: "success"; response: TResponse; errors?: undefined }
  | { type: "error"; response?: undefined; errors: string[] };

type AnyArgs = Record<string, unknown> | undefined;

// Mirrors unsplash-js's own response shapes per method group (see
// node_modules/unsplash-js/dist/methods/*/types.d.ts) — search results carry
// `total_pages`, plain `list`/`getPhotos` calls only carry `total`.
type UnsplashSearchPhotosResponse = {
  results: UnsplashBasicPhoto[];
  total: number;
  total_pages: number;
};
type UnsplashSearchCollectionsResponse = {
  results: UnsplashBasicCollection[];
  total: number;
  total_pages: number;
};
type UnsplashPhotoListResponse = { results: UnsplashBasicPhoto[]; total: number };
type UnsplashCollectionListResponse = { results: UnsplashBasicCollection[]; total: number };
type UnsplashTopicListResponse = { results: UnsplashBasicTopic[]; total: number };

async function call<TResponse>(
  method: string,
  args: AnyArgs,
): Promise<UnsplashEnvelope<TResponse>> {
  try {
    const res = await fetch("/api/unsplash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, args: args ?? {} }),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        type: "error",
        errors: [text || `Unsplash request failed (${res.status})`],
      };
    }
    return (await res.json()) as UnsplashEnvelope<TResponse>;
  } catch (err) {
    return {
      type: "error",
      errors: [err instanceof Error ? err.message : "Unknown error"],
    };
  }
}

// Mirror the surface used by the rest of the codebase. Add methods as
// callers require them — keep both this file and the server route in sync.
export const unsplashClient = {
  search: {
    getPhotos: (args: AnyArgs) =>
      call<UnsplashSearchPhotosResponse>(
        "search.getPhotos",
        args,
      ),
    getCollections: (args: AnyArgs) =>
      call<UnsplashSearchCollectionsResponse>(
        "search.getCollections",
        args,
      ),
  },
  photos: {
    list: (args: AnyArgs) =>
      call<UnsplashPhotoListResponse>(
        "photos.list",
        args,
      ),
    get: (args: AnyArgs) => call<unknown>("photos.get", args),
    getRandom: (args: AnyArgs) => call<unknown>("photos.getRandom", args),
  },
  collections: {
    list: (args: AnyArgs) =>
      call<UnsplashCollectionListResponse>(
        "collections.list",
        args,
      ),
    getPhotos: (args: AnyArgs) =>
      call<UnsplashPhotoListResponse>(
        "collections.getPhotos",
        args,
      ),
  },
  topics: {
    list: (args: AnyArgs) =>
      call<UnsplashTopicListResponse>(
        "topics.list",
        args,
      ),
    getPhotos: (args: AnyArgs) =>
      call<UnsplashPhotoListResponse>(
        "topics.getPhotos",
        args,
      ),
  },
} as const;

export type UnsplashClient = typeof unsplashClient;
