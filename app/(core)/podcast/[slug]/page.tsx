import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { PodcastEpisodePage } from "@/features/podcasts/components/player/PodcastEpisodePage";
import { PodcastShowPage } from "@/features/podcasts/components/player/PodcastShowPage";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import type {
  PcArticle,
  PcEpisode,
  PcEpisodeWithShow,
  PcShow,
} from "@/features/podcasts/types";
import {
  mapPcEpisodeRow,
  mapPcEpisodeWithShowRow,
  mapPcShowRow,
} from "@/features/podcasts/types";

export const revalidate = 3600;

// OG images must be absolute URLs — social crawlers (Telegram, WhatsApp, Twitter)
// do not follow relative paths. Fall back to the production domain.
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.aimatrx.com"
).replace(/\/$/, "");
const DEFAULT_OG_IMAGE = `${SITE_URL}/images/podcast-default-og.png`;

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str,
  );
}

// React.cache deduplicates calls within a single render pass —
// generateMetadata and the page component share one DB round-trip.
const resolveSlug = cache(async (slug: string) => {
  const supabase = await createClient();

  // Try episode first — include all show fields needed for display and OG metadata
  const episodeQuery = supabase
    .schema("podcast").from("pc_episodes")
    .select(
      "*, show:pc_shows(id, slug, title, description, image_url, og_image_url, thumbnail_url, author, is_published, created_at, updated_at)",
    )
    .is("deleted_at", null);

  const { data: episode } = isUUID(slug)
    ? await episodeQuery.eq("id", slug).single()
    : await episodeQuery.eq("slug", slug).single();

  if (episode) {
    return { type: "episode" as const, data: mapPcEpisodeWithShowRow(episode) };
  }

  // Try show (slug or UUID)
  const showQuery = supabase.schema("podcast").from("pc_shows").select("*").is("deleted_at", null);

  const { data: show } = isUUID(slug)
    ? await showQuery.eq("id", slug).single()
    : await showQuery.eq("slug", slug).single();

  if (show) {
    return { type: "show" as const, data: mapPcShowRow(show) };
  }

  return null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await resolveSlug(slug);

  // Neutral: an unresolved public slug may be an unpublished episode rather
  // than a nonexistent one, and the tab title must not pick.
  if (!result) {
    return { title: "Podcast" };
  }

  if (result.type === "episode") {
    const ep = result.data;
    const showName = ep.show?.title;
    const title = showName ? `${ep.title} — ${showName}` : ep.title;
    const description =
      ep.description ??
      (showName ? `${ep.title} — ${showName}` : `Listen to ${ep.title}`);

    // Full fallback chain — episode OG → episode cover → show OG → show cover →
    // show thumbnail → site default. This ensures episodes with a video but no
    // extracted frame still get a rich preview using the show's artwork.
    const ogImage =
      ep.og_image_url ??
      ep.image_url ??
      ep.show?.og_image_url ??
      ep.show?.image_url ??
      ep.show?.thumbnail_url ??
      DEFAULT_OG_IMAGE;

    return {
      title: `${title} | Podcast`,
      description,
      openGraph: {
        title,
        description,
        images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
        type: "music.song",
        siteName: showName,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogImage],
      },
    };
  }

  // Show metadata
  const show = result.data;
  const showDescription = show.description ?? `Listen to ${show.title}`;
  const showOgImage = show.og_image_url ?? show.image_url ?? DEFAULT_OG_IMAGE;
  return {
    title: `${show.title} | Podcast`,
    description: showDescription,
    openGraph: {
      title: show.title,
      description: showDescription,
      images: [{ url: showOgImage, width: 1200, height: 630, alt: show.title }],
      siteName: show.title,
    },
    twitter: {
      card: "summary_large_image",
      title: show.title,
      description: showDescription,
      images: [showOgImage],
    },
  };
}

export default async function PodcastPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await resolveSlug(slug);

  if (!result) {
    notFound();
  }

  if (result.type === "episode") {
    // Published companion content (blog / show notes) drives the live CTAs.
    const supabase = await createClient();
    const { data: articles } = await supabase
      .schema("podcast").from("pc_articles")
      .select("*")
      .is("deleted_at", null)
      .eq("episode_id", result.data.id)
      .eq("status", "published");
    return (
      <>
        <RouteHeader
          left={
            <>
              <ChevronLeftTapButton
                href={
                  result.data.show
                    ? `/podcast/${result.data.show.slug}`
                    : "/podcast"
                }
                variant="glass"
                ariaLabel="Back"
              />
              <span className="ml-2 min-w-0 truncate text-sm font-medium text-foreground">
                {result.data.title}
              </span>
            </>
          }
        />
        <PodcastEpisodePage
          episode={result.data}
          articles={(articles ?? []) as PcArticle[]}
        />
      </>
    );
  }

  // Show page — fetch its published episodes
  const supabase = await createClient();
  const { data: episodes } = await supabase
    .schema("podcast").from("pc_episodes")
    .select("*")
    .is("deleted_at", null)
    .eq("show_id", result.data.id)
    .eq("is_published", true)
    .order("episode_number", { ascending: true, nullsFirst: false });

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              href="/podcast"
              variant="glass"
              ariaLabel="Back"
            />
            <span className="ml-2 max-w-[45vw] truncate text-sm font-medium text-foreground">
              {result.data.title}
            </span>
          </>
        }
      />
      <PodcastShowPage
        show={result.data}
        episodes={(episodes ?? []).map(mapPcEpisodeRow)}
      />
    </>
  );
}
