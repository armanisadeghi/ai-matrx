// app/(core)/podcast/[slug]/feed.xml/route.ts
//
// iTunes / Apple-Podcasts-compatible RSS 2.0 feed for one podcast show.
// This is the distribution surface: paste `${origin}/podcast/<slug>/feed.xml`
// into Apple Podcasts Connect / Spotify for Podcasters and the show + every
// published episode is ingested.
//
// Pattern mirrors `app/sitemap.xml/route.ts` — an App Router Route Handler that
// returns a hand-built XML string (no library) with the right Content-Type.
// Media URLs in <enclosure>/<itunes:image> are the durable CDN URLs persisted
// on pc_episodes / pc_shows (durability work landed June 2026), so they are safe
// to hand to podcast directories that re-fetch the feed for days/weeks.
//
// Resolves the show by slug OR id. Returns 404 (plain Response) when missing.

import { createClient } from '@/utils/supabase/server';
import type { PcShow, PcEpisode } from '@/features/podcasts/types';

export const revalidate = 3600;

// Base URL the public web sees. Matches the convention used by the podcast page
// route (`NEXT_PUBLIC_SITE_URL` → production domain). Trailing slash stripped so
// `${BASE}/podcast/...` never doubles up.
const BASE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aimatrx.com').replace(/\/$/, '');

// Defaults for required iTunes channel fields when the show leaves them blank.
const DEFAULT_OWNER_NAME = 'AI Matrx';
const DEFAULT_OWNER_EMAIL = 'info@aimatrx.com';
const DEFAULT_CATEGORY = 'Technology';
const DEFAULT_LANGUAGE = 'en-us';

function isUUID(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/** Escape the five XML metacharacters for use in element text / attributes. */
function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Wrap free-form text in CDATA, neutralising any embedded `]]>` terminator. */
function cdata(value: string): string {
    return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

/** Map an audio URL extension to its enclosure MIME type. Defaults to audio/mpeg. */
function audioMimeType(url: string): string {
    const clean = url.split('?')[0].toLowerCase();
    if (clean.endsWith('.wav')) return 'audio/wav';
    if (clean.endsWith('.m4a')) return 'audio/mp4';
    if (clean.endsWith('.aac')) return 'audio/aac';
    if (clean.endsWith('.ogg')) return 'audio/ogg';
    if (clean.endsWith('.mp3')) return 'audio/mpeg';
    return 'audio/mpeg';
}

/** Format seconds as H:MM:SS (or M:SS when under an hour) for <itunes:duration>. */
function formatItunesDuration(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** RFC-822 date string, as required by RSS <pubDate> / <lastBuildDate>. */
function rfc822(date: Date): string {
    return date.toUTCString();
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
    const { slug } = await params;
    const supabase = await createClient();

    // Resolve show by id (UUID) or slug.
    const showQuery = supabase.from('pc_shows').select('*');
    const { data: showRow } = isUUID(slug)
        ? await showQuery.eq('id', slug).single()
        : await showQuery.eq('slug', slug).single();

    if (!showRow) {
        return new Response('Podcast not found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }

    const show = showRow as PcShow;

    // Published episodes, newest-first: episode_number desc (nulls last), then created_at desc.
    const { data: episodeRows } = await supabase
        .from('pc_episodes')
        .select('*')
        .eq('show_id', show.id)
        .eq('is_published', true)
        .order('episode_number', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

    const episodes = (episodeRows ?? []) as PcEpisode[];

    const showPageUrl = `${BASE}/podcast/${show.slug}`;
    const channelCover = show.image_url ?? show.og_image_url ?? show.thumbnail_url ?? '';
    const ownerName = show.author ?? DEFAULT_OWNER_NAME;
    const channelDescription = show.description ?? `Listen to ${show.title}`;

    // lastBuildDate = newest episode's created_at, or now if there are none.
    const lastBuild =
        episodes.length > 0 ? new Date(episodes[0].created_at) : new Date();

    const itemsXml = episodes
        .map((ep) => {
            const episodeUrl = `${BASE}/podcast/${ep.slug}`;
            const epCover = ep.image_url ?? ep.thumbnail_url ?? channelCover;
            const enclosureType = audioMimeType(ep.audio_url);
            const pubDate = rfc822(new Date(ep.created_at));
            const descParts: string[] = [];
            descParts.push(`    <title>${cdata(ep.title)}</title>`);
            descParts.push(`    <description>${cdata(ep.description ?? '')}</description>`);
            descParts.push(`    <itunes:summary>${cdata(ep.description ?? '')}</itunes:summary>`);
            descParts.push(`    <link>${escapeXml(episodeUrl)}</link>`);
            descParts.push(
                `    <enclosure url="${escapeXml(ep.audio_url)}" type="${enclosureType}" length="0"/>`
            );
            descParts.push(`    <guid isPermaLink="false">${escapeXml(ep.id)}</guid>`);
            descParts.push(`    <pubDate>${pubDate}</pubDate>`);
            if (ep.episode_number != null) {
                descParts.push(`    <itunes:episode>${ep.episode_number}</itunes:episode>`);
            }
            if (ep.duration_seconds != null) {
                descParts.push(
                    `    <itunes:duration>${formatItunesDuration(ep.duration_seconds)}</itunes:duration>`
                );
            }
            descParts.push(`    <itunes:explicit>false</itunes:explicit>`);
            if (epCover) {
                descParts.push(`    <itunes:image href="${escapeXml(epCover)}"/>`);
            }
            return `  <item>\n${descParts.join('\n')}\n  </item>`;
        })
        .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>${cdata(show.title)}</title>
  <link>${escapeXml(showPageUrl)}</link>
  <description>${cdata(channelDescription)}</description>
  <language>${DEFAULT_LANGUAGE}</language>
  <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>
  <itunes:author>${escapeXml(ownerName)}</itunes:author>
  <itunes:summary>${cdata(channelDescription)}</itunes:summary>
  <itunes:explicit>false</itunes:explicit>
  <itunes:category text="${escapeXml(DEFAULT_CATEGORY)}"/>
  <itunes:owner>
    <itunes:name>${escapeXml(ownerName)}</itunes:name>
    <itunes:email>${escapeXml(DEFAULT_OWNER_EMAIL)}</itunes:email>
  </itunes:owner>${
      channelCover ? `\n  <itunes:image href="${escapeXml(channelCover)}"/>` : ''
  }
${itemsXml}
</channel>
</rss>`;

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
    });
}
