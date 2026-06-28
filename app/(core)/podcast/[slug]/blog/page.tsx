import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { PodcastBlogPage } from "@/features/podcasts/components/player/PodcastBlogPage";
import type { PcArticle, PcEpisodeWithShow } from "@/features/podcasts/types";
import { mapPcEpisodeWithShowRow } from "@/features/podcasts/types";

export const revalidate = 3600;

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.aimatrx.com"
).replace(/\/$/, "");
const DEFAULT_OG_IMAGE = `${SITE_URL}/images/podcast-default-og.png`;

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str,
  );
}

// One DB round-trip shared by generateMetadata + the page. Resolves the
// episode (by slug or UUID) and its PUBLISHED blog article.
const resolveBlog = cache(async (slug: string) => {
  const supabase = await createClient();
  const episodeQuery = supabase
    .from("pc_episodes")
    .select(
      "*, show:pc_shows(id, slug, title, description, image_url, og_image_url, thumbnail_url, author, is_published, created_at, updated_at)",
    );
  const { data: episode } = isUUID(slug)
    ? await episodeQuery.eq("id", slug).single()
    : await episodeQuery.eq("slug", slug).single();
  if (!episode) return null;

  const mappedEpisode = mapPcEpisodeWithShowRow(episode);

  const { data: article } = await supabase
    .from("pc_articles")
    .select("*")
    .eq("episode_id", mappedEpisode.id)
    .eq("kind", "blog")
    .eq("status", "published")
    .maybeSingle();
  if (!article) return null;

  return { episode: mappedEpisode, article: article as PcArticle };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await resolveBlog(slug);
  if (!result) return { title: "Article Not Found" };

  const { episode, article } = result;
  const showName = episode.show?.title;
  const title = article.title || episode.title;
  const description = episode.description ?? `Read ${title}`;
  const ogImage =
    article.og_image_url ??
    episode.og_image_url ??
    episode.image_url ??
    episode.show?.og_image_url ??
    episode.show?.image_url ??
    DEFAULT_OG_IMAGE;
  const canonical =
    article.canonical_url ?? `${SITE_URL}/podcast/${episode.slug}/blog`;

  return {
    title: `${title} | Blog`,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      type: "article",
      publishedTime: article.created_at,
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

export default async function PodcastBlogRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await resolveBlog(slug);
  if (!result) notFound();
  return <PodcastBlogPage episode={result.episode} article={result.article} />;
}
