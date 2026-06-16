import { createApi } from "unsplash-js";
import { NextRequest, NextResponse } from "next/server";

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
 * Returns the unsplash-js result envelope (`{ type, response, errors? }`)
 * unchanged, so callers can keep their existing `result.type === "success"`
 * branching.
 */

const unsplash = createApi({
  accessKey: process.env.UNSPLASH_ACCESS_KEY!,
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
  // We intentionally trust the args shape — unsplash-js validates internally
  // and the failure surface is just a normal `result.type === "error"` payload.
  const argsAny = args as never;
  switch (method) {
    case "search.getPhotos":
      return unsplash.search.getPhotos(argsAny);
    case "search.getCollections":
      return unsplash.search.getCollections(argsAny);
    case "photos.list":
      return unsplash.photos.list(argsAny);
    case "photos.get":
      return unsplash.photos.get(argsAny);
    case "photos.getRandom":
      return unsplash.photos.getRandom(argsAny);
    case "photos.trackDownload":
      // Unsplash API guideline: trigger a download event when a photo is
      // actually used (e.g. embedded in a slide). args: { downloadLocation }.
      return unsplash.photos.trackDownload(argsAny);
    case "collections.list":
      return unsplash.collections.list(argsAny);
    case "collections.getPhotos":
      return unsplash.collections.getPhotos(argsAny);
    case "topics.list":
      return unsplash.topics.list(argsAny);
    case "topics.getPhotos":
      return unsplash.topics.getPhotos(argsAny);
    default: {
      const exhaustive: never = method;
      throw new Error(`Unsupported Unsplash method: ${exhaustive}`);
    }
  }
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
      const result = await unsplash.search.getPhotos({
        query,
        page: parseInt(page),
        perPage: parseInt(perPage),
      });
      return NextResponse.json(result);
    }
    case "getRandomPhoto": {
      const randomResult = await unsplash.photos.getRandom({});
      return NextResponse.json(randomResult);
    }
    case "getCollections": {
      const collectionsResult = await unsplash.collections.list({});
      return NextResponse.json(collectionsResult);
    }
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}
