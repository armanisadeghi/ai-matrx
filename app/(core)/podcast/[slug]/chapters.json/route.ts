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
import { PC_EPISODE_PUBLIC_SELECT } from "@/features/podcasts/publicColumns";
import { publiclyServableEpisodes } from "@/features/podcasts/publicGate";
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

  const episodeQuery = publiclyServableEpisodes(
    supabase
      .schema("podcast")
      .from("pc_episodes")
      // Fetched with no account: `anon` holds a COLUMN grant, so `*` is 42501 (DD-230).
      .select(PC_EPISODE_PUBLIC_SELECT),
  );

  const { data: episodeRow, error: episodeError } = isUUID(slug)
    ? await episodeQuery.eq("id", slug).single()
    : await episodeQuery.eq("slug", slug).single();

  // "Episode not found" is a claim about the catalogue; a refused read cannot
  // support it (DD-230). `PGRST116` is a genuine no-row `.single()`; anything
  // else means we were refused and must say so instead of denying the episode.
  if (episodeError && episodeError.code !== "PGRST116") {
    throw new Error(
      `The chapters document could not read podcast.pc_episodes: ${episodeError.message}` +
        (episodeError.code ? ` (${episodeError.code})` : "") +
        ". See lib/security/public-exposure.ts#ANON_COLUMN_SURFACE.",
    );
  }

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
  //
  // DD-234 (2026-09-14): this branch now means what it says. Chapters used to
  // live in `pc_episodes.metadata.chapters`, and `metadata` is withheld from a
  // signed-out reader (DD-186), so this 404 was taken for EVERY listener with no
  // account no matter what the episode held. They are podcast content and are
  // public exactly when the episode is, so they have their own public-class
  // column in the signed-out bound (`PC_EPISODE_PUBLIC_SELECT`), and a listener
  // with no account is served the real document. A 404 here is now a genuine
  // "this episode has no chapters"; a REFUSED read is the throw above, never
  // this. `metadata` stays withheld.
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
