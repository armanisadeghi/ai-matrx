// app/(core)/podcast/[slug]/chapters.json/route.ts
//
// Podcasting 2.0 JSON Chapters document for ONE episode. This is the target of
// the `<podcast:chapters>` element the show's feed.xml emits, so podcast apps
// fetch it directly — see `features/podcasts/chapters-json.ts` for why the
// chapters ship as a linked JSON document rather than inline PSC tags.
//
// Sibling of `feed.xml/route.ts` under the same `[slug]` segment and follows it
// exactly: server Supabase client, `podcast` schema, `deleted_at IS NULL`,
// slug-or-UUID resolution, hourly revalidate. `[slug]` resolves an episode here
// (feed.xml resolves a show) — the same public slug space the episode page uses.

import { createClient } from "@/utils/supabase/server";
import { mapPcEpisodeRow } from "@/features/podcasts/types";
import {
  buildChaptersJson,
  CHAPTERS_JSON_MIME,
} from "@/features/podcasts/chapters-json";

export const revalidate = 3600;

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str,
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const supabase = await createClient();

  const episodeQuery = supabase
    .schema("podcast")
    .from("pc_episodes")
    .select("*")
    .is("deleted_at", null);

  const { data: episodeRow } = isUUID(slug)
    ? await episodeQuery.eq("id", slug).single()
    : await episodeQuery.eq("slug", slug).single();

  if (!episodeRow) {
    return new Response("Episode not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const episode = mapPcEpisodeRow(episodeRow);
  const document = buildChaptersJson(episode.chapters);

  // No chapters is a 404, not an empty document: the feed only links this URL
  // for episodes that have them, so an empty body here would only ever be a
  // stale link — and apps handle a 404 by hiding the chapter UI, which is right.
  if (document.chapters.length === 0) {
    return new Response("No chapters for this episode", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(JSON.stringify(document), {
    headers: {
      "Content-Type": `${CHAPTERS_JSON_MIME}; charset=utf-8`,
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
