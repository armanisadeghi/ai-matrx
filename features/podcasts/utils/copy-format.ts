/**
 * copy-format — the ONE human/agent shape for podcast admin copy actions.
 *
 * Shared by the shows/episodes table rows, the table's view copy, and the
 * exports so a row summary and a list summary can never drift (agent-copy
 * doctrine: add the shared summary once, never duplicate it).
 *
 * TWO THINGS SHAPE THIS FILE:
 *
 * 1. MEDIA RULES. Episodes carry `audio_url`, `video_url` and three image
 *    URLs. Those columns are public-web-facing and are supposed to hold
 *    durable URLs, but "supposed to" is not a guarantee — so every agent
 *    shape runs through `mediaSafe`, which swaps any signed URL for an
 *    honest stub instead of handing an agent a link that dies in days.
 *
 * 2. SIZE. `PcEpisode.script` is the full generated dialogue — easily tens of
 *    thousands of characters. A list copy that inlined it would be unusable,
 *    so list projections drop it and say so (`script_omitted` names the size).
 *    The single-episode record keeps it: that is what the user is looking at.
 */

import type { PcEpisodeWithShow, PcShow } from "@/features/podcasts/types";
import { mediaSafe } from "@/lib/media/agent-payload";

function durationLabel(seconds: number | null): string | null {
  if (seconds == null) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

// ── Shows ────────────────────────────────────────────────────────────────

export function showRowSummary(show: PcShow): string {
  return [
    show.title,
    `/${show.slug}`,
    show.author,
    show.is_published ? "published" : "draft",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function showsHumanSummary(shows: PcShow[]): string {
  return shows.map(showRowSummary).join("\n");
}

/** Core fields for a show — safe to inline in a list. */
export function showProjection(show: PcShow): Record<string, unknown> {
  return {
    id: show.id,
    slug: show.slug,
    title: show.title,
    author: show.author,
    is_published: show.is_published,
    public_page: `/podcast/${show.slug}`,
    created_at: show.created_at,
    updated_at: show.updated_at,
  };
}

export function showAgentData(show: PcShow): Record<string, unknown> {
  return {
    public_page: `/podcast/${show.slug}`,
    show: mediaSafe(show),
  };
}

// ── Episodes ─────────────────────────────────────────────────────────────

export function episodeRowSummary(episode: PcEpisodeWithShow): string {
  return [
    episode.title,
    episode.show?.title ? `show: ${episode.show.title}` : null,
    episode.episode_number != null ? `#${episode.episode_number}` : null,
    durationLabel(episode.duration_seconds),
    episode.is_published ? "published" : "draft",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function episodesHumanSummary(episodes: PcEpisodeWithShow[]): string {
  return episodes.map(episodeRowSummary).join("\n");
}

/**
 * Core fields for an episode, WITHOUT the dialogue script. The stub states
 * that the script exists and how big it is, so an agent knows to ask for the
 * single-episode payload rather than assuming the field was empty.
 */
export function episodeProjection(
  episode: PcEpisodeWithShow,
): Record<string, unknown> {
  const scriptLength = episode.script?.length ?? 0;
  return {
    id: episode.id,
    slug: episode.slug,
    title: episode.title,
    show: episode.show
      ? { id: episode.show.id, title: episode.show.title }
      : null,
    episode_number: episode.episode_number,
    duration_seconds: episode.duration_seconds,
    duration: durationLabel(episode.duration_seconds),
    host_count: episode.host_count,
    speakers: episode.speakers,
    chapter_count: episode.chapters?.length ?? 0,
    is_published: episode.is_published,
    public_page: `/podcast/${episode.slug}`,
    script_omitted: scriptLength
      ? `[omitted: ${scriptLength.toLocaleString()} chars of dialogue script — copy the single episode to get it]`
      : null,
    created_at: episode.created_at,
    updated_at: episode.updated_at,
  };
}

/** The single-episode record — keeps the script, sanitizes every URL. */
export function episodeAgentData(
  episode: PcEpisodeWithShow,
): Record<string, unknown> {
  return {
    public_page: `/podcast/${episode.slug}`,
    duration: durationLabel(episode.duration_seconds),
    episode: mediaSafe(episode),
  };
}

// ── Exports ──────────────────────────────────────────────────────────────

export function showsExportRows(
  shows: PcShow[],
): Array<Record<string, unknown>> {
  return shows.map((show) => ({
    id: show.id,
    title: show.title,
    slug: show.slug,
    author: show.author ?? "",
    is_published: show.is_published,
    created_at: show.created_at,
    updated_at: show.updated_at,
  }));
}

export function episodesExportRows(
  episodes: PcEpisodeWithShow[],
): Array<Record<string, unknown>> {
  return episodes.map((episode) => ({
    id: episode.id,
    title: episode.title,
    slug: episode.slug,
    show: episode.show?.title ?? "",
    episode_number: episode.episode_number ?? "",
    duration_seconds: episode.duration_seconds ?? "",
    host_count: episode.host_count ?? "",
    chapter_count: episode.chapters?.length ?? 0,
    is_published: episode.is_published,
    created_at: episode.created_at,
    updated_at: episode.updated_at,
  }));
}
