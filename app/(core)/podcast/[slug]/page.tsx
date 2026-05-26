import { createClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import type { Metadata } from 'next';
import { PodcastEpisodePage } from '@/features/podcasts/components/player/PodcastEpisodePage';
import { PodcastShowPage } from '@/features/podcasts/components/player/PodcastShowPage';
import type { PcEpisodeWithShow, PcShow, PcEpisode } from '@/features/podcasts/types';

export const revalidate = 3600;

// OG images must be absolute URLs — social crawlers (Telegram, WhatsApp, Twitter)
// do not follow relative paths. Fall back to the production domain.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.aimatrx.com').replace(/\/$/, '');
const DEFAULT_OG_IMAGE = `${SITE_URL}/images/podcast-default-og.png`;

function isUUID(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// React.cache deduplicates calls within a single render pass —
// generateMetadata and the page component share one DB round-trip.
const resolveSlug = cache(async (slug: string) => {
    const supabase = await createClient();

    // Try episode first — include all show fields needed for display and OG metadata
    const episodeQuery = supabase
        .from('pc_episodes')
        .select('*, show:pc_shows(id, slug, title, description, image_url, og_image_url, thumbnail_url, author, is_published, created_at, updated_at)');

    const { data: episode } = isUUID(slug)
        ? await episodeQuery.eq('id', slug).single()
        : await episodeQuery.eq('slug', slug).single();

    if (episode) {
        return { type: 'episode' as const, data: episode as PcEpisodeWithShow };
    }

    // Try show (slug or UUID)
    const showQuery = supabase.from('pc_shows').select('*');

    const { data: show } = isUUID(slug)
        ? await showQuery.eq('id', slug).single()
        : await showQuery.eq('slug', slug).single();

    if (show) {
        return { type: 'show' as const, data: show as PcShow };
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

    if (!result) {
        return { title: 'Episode Not Found' };
    }

    if (result.type === 'episode') {
        const ep = result.data;
        const showName = ep.show?.title;
        const title = showName ? `${ep.title} — ${showName}` : ep.title;
        const description = ep.description ?? (showName ? `${ep.title} — ${showName}` : `Listen to ${ep.title}`);

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
                type: 'music.song',
                siteName: showName,
            },
            twitter: {
                card: 'summary_large_image',
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
            card: 'summary_large_image',
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

    if (result.type === 'episode') {
        return <PodcastEpisodePage episode={result.data} />;
    }

    // Show page — fetch its published episodes
    const supabase = await createClient();
    const { data: episodes } = await supabase
        .from('pc_episodes')
        .select('*')
        .eq('show_id', result.data.id)
        .eq('is_published', true)
        .order('episode_number', { ascending: true, nullsFirst: false });

    return (
        <PodcastShowPage
            show={result.data}
            episodes={(episodes ?? []) as PcEpisode[]}
        />
    );
}
