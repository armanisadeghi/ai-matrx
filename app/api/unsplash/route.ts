import { createApi } from "unsplash-js";
import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "@/utils/supabase/env";

/**
 * Unsplash proxy.
 *
 * Single endpoint for every Unsplash call the client makes, so the access
 * key never leaves the server. Two transports for backwards-compat:
 *
 *   GET  /api/unsplash?action=searchPhotos&query=…&page=1&perPage=15
 *        — preserved for the legacy callers listed below; favors a small
 *          enum of `action` values that map onto the corresponding
 *          unsplash-js method.
 *
 *   POST /api/unsplash  body: { method: "search.getPhotos", args: { … } }
 *        — generic, used by `hooks/images/useUnsplashGallery.ts` and any
 *          new client. Mirrors the unsplash-js `client.<group>.<call>(args)`
 *          shape exactly so consumers never have to translate result types.
 *
 * Unsplash JS 8 uses openapi-fetch's `{ data, error, response }` result. This
 * route normalizes that result to the legacy `{ type, response, errors? }`
 * envelope consumed by the browser shim.
 */

const unsplash = createApi({
  accessKey: requireEnv("UNSPLASH_ACCESS_KEY", process.env.UNSPLASH_ACCESS_KEY),
});

type UnsplashMethod =
  | "search.getPhotos"
  | "search.getCollections"
  | "photos.list"
  | "photos.get"
  | "photos.getRandom"
  | "photos.trackDownload"
  | "collections.list"
  | "collections.getPhotos"
  | "topics.list"
  | "topics.getPhotos";

async function dispatch(method: UnsplashMethod, args: Record<string, unknown>) {
  const stringArg = (name: string) =>
    typeof args[name] === "string" ? args[name] : undefined;
  const numberArg = (name: string) =>
    typeof args[name] === "number" ? args[name] : undefined;
  const query = {
    page: numberArg("page"),
    per_page: numberArg("perPage"),
  };

  switch (method) {
    case "search.getPhotos": {
      // `plus` remains accepted by Unsplash but was dropped from the v8
      // generated schema. Keep forwarding it so the existing premium filter
      // does not silently stop working during the client migration.
      const searchPhotoQuery = {
        ...query,
        query: stringArg("query") ?? "",
        order_by: searchOrder(stringArg("orderBy")),
        orientation: orientation(stringArg("orientation")),
        content_filter: contentFilter(stringArg("contentFilter")),
        plus: stringArg("plus"),
      };
      return toLegacy(
        await unsplash.GET("/search/photos", {
          params: { query: searchPhotoQuery },
        }),
      );
    }
    case "search.getCollections":
      return toLegacy(
        await unsplash.GET("/search/collections", {
          params: {
            query: { ...query, query: stringArg("query") ?? "" },
          },
        }),
      );
    case "photos.list": {
      const photoListQuery = {
        ...query,
        order_by: feedOrder(stringArg("orderBy")),
      };
      return toLegacyFeed(
        await unsplash.GET("/photos", { params: { query: photoListQuery } }),
      );
    }
    case "photos.get": {
      const assetSlug = stringArg("photoId") ?? stringArg("assetSlug") ?? stringArg("id");
      if (!assetSlug) throw new Error("photoId is required");
      return toLegacy(
        await unsplash.GET("/photos/{assetSlug}", {
          params: { path: { assetSlug } },
        }),
      );
    }
    case "photos.getRandom":
      return toLegacy(
        await unsplash.GET("/photos/random", {
          params: {
            query: {
              query: stringArg("query"),
              orientation: orientation(stringArg("orientation")),
            },
          },
        }),
      );
    case "photos.trackDownload": {
      // Unsplash API guideline: trigger a download event when a photo is
      // actually used (e.g. embedded in a slide). Older callers carry the
      // API's download-location URL, so recover its photo ID when necessary.
      const downloadLocation = stringArg("downloadLocation");
      const id =
        stringArg("id") ??
        (downloadLocation
          ? /\/photos\/([^/]+)\/download(?:\?|$)/.exec(downloadLocation)?.[1]
          : undefined);
      if (!id) throw new Error("photo id is required to track a download");
      return toLegacy(
        await unsplash.GET("/photos/{id}/download", {
          params: { path: { id } },
        }),
      );
    }
    case "collections.list":
      return toLegacyFeed(
        await unsplash.GET("/collections", { params: { query } }),
      );
    case "collections.getPhotos": {
      const collectionId = stringArg("collectionId");
      if (!collectionId) throw new Error("collectionId is required");
      const collectionPhotoQuery = {
        ...query,
        order_by: feedOrder(stringArg("orderBy")),
        orientation: orientation(stringArg("orientation")),
      };
      return toLegacyFeed(
        await unsplash.GET("/collections/{collectionId}/photos", {
          params: {
            path: { collectionId },
            query: collectionPhotoQuery,
          },
        }),
      );
    }
    case "topics.list":
      return toLegacyFeed(
        await unsplash.GET("/topics", { params: { query } }),
      );
    case "topics.getPhotos": {
      const topicSlug = stringArg("topicIdOrSlug");
      if (!topicSlug) throw new Error("topicIdOrSlug is required");
      return toLegacyFeed(
        await unsplash.GET("/topics/{topicSlug}/photos", {
          params: {
            path: { topicSlug },
            query: {
              ...query,
              order_by: topicOrder(stringArg("orderBy")),
              orientation: orientation(stringArg("orientation")),
            },
          },
        }),
      );
    }
    default: {
      const exhaustive: never = method;
      throw new Error(`Unsupported Unsplash method: ${exhaustive}`);
    }
  }
}

type OpenApiResult<T> = {
  data?: T;
  error?: unknown;
  response: Response;
};

function errorMessages(error: unknown): string[] {
  if (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray(error.errors)
  ) {
    return error.errors.filter((item): item is string => typeof item === "string");
  }
  return [typeof error === "string" ? error : "Unsplash request failed"];
}

function toLegacy<T>(result: OpenApiResult<T>) {
  return result.data === undefined
    ? { type: "error" as const, errors: errorMessages(result.error) }
    : { type: "success" as const, response: result.data };
}

function toLegacyFeed<T>(result: OpenApiResult<T[]>) {
  if (result.data === undefined) {
    return { type: "error" as const, errors: errorMessages(result.error) };
  }
  const headerTotal = Number.parseInt(result.response.headers.get("x-total") ?? "", 10);
  return {
    type: "success" as const,
    response: {
      results: result.data,
      total: Number.isFinite(headerTotal) ? headerTotal : result.data.length,
    },
  };
}

function orientation(
  value: string | undefined,
): "landscape" | "portrait" | "squarish" | undefined {
  return value === "landscape" || value === "portrait" || value === "squarish"
    ? value
    : undefined;
}

function contentFilter(value: string | undefined): "high" | "low" | undefined {
  return value === "high" || value === "low" ? value : undefined;
}

function searchOrder(
  value: string | undefined,
): "latest" | "relevant" | undefined {
  return value === "latest" || value === "relevant" ? value : undefined;
}

function topicOrder(
  value: string | undefined,
): "latest" | "oldest" | "popular" | undefined {
  return value === "latest" || value === "oldest" || value === "popular"
    ? value
    : undefined;
}

function feedOrder(
  value: string | undefined,
): "latest" | "oldest" | "popular" | "views" | "downloads" | undefined {
  return value === "latest" ||
    value === "oldest" ||
    value === "popular" ||
    value === "views" ||
    value === "downloads"
    ? value
    : undefined;
}

export async function POST(request: NextRequest) {
  let body: { method?: UnsplashMethod; args?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.method) {
    return NextResponse.json({ error: "Missing 'method'" }, { status: 400 });
  }

  try {
    const result = await dispatch(body.method, body.args ?? {});
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  switch (action) {
    case "searchPhotos": {
      const query = searchParams.get("query");
      const page = searchParams.get("page") ?? "1";
      const perPage = searchParams.get("perPage") ?? "10";
      if (!query) {
        return NextResponse.json({ error: "Missing 'query'" }, { status: 400 });
      }
      const result = await dispatch("search.getPhotos", {
        query,
        page: parseInt(page),
        perPage: parseInt(perPage),
      });
      return NextResponse.json(result);
    }
    case "getRandomPhoto": {
      const randomResult = await dispatch("photos.getRandom", {});
      return NextResponse.json(randomResult);
    }
    case "getCollections": {
      const collectionsResult = await dispatch("collections.list", {});
      return NextResponse.json(collectionsResult);
    }
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}
