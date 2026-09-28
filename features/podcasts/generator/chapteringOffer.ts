// features/podcasts/generator/chapteringOffer.ts
//
// The `podcast.chaptering` offered values the chapter-marker launch holds as
// REAL facts (the loaded episode row + its show), sent by name beside
// episode_script / duration_hint / granularity_hint. The launch is on the
// MANDATE door (useLiveAgentRun({ mandateKey })), where these mapped-only
// values are dropped on the default pin — the current Holder's payload is
// unchanged. Absent facts are omitted.

import type { PodcastChapteringOffer } from "@/types/python-generated/provision-offers";
import type { PcEpisode, PcShow } from "@/features/podcasts/types";

export type ChapteringEpisodeFacts = Partial<
  Pick<
    PcEpisode,
    | "duration_seconds"
    | "title"
    | "description"
    | "episode_number"
    | "speakers"
    | "chapters"
  >
> & { show?: Pick<PcShow, "title"> | null };

export function chapteringOfferVariables(
  episode: ChapteringEpisodeFacts,
): Partial<PodcastChapteringOffer> {
  const out: Partial<PodcastChapteringOffer> = {};
  if (typeof episode.duration_seconds === "number" && episode.duration_seconds > 0)
    out.duration_seconds = Math.round(episode.duration_seconds);
  if (episode.title?.trim()) out.episode_title = episode.title.trim();
  if (episode.description?.trim())
    out.episode_description = episode.description.trim();
  if (typeof episode.episode_number === "number")
    out.episode_number = episode.episode_number;
  const speakers = (episode.speakers ?? [])
    .map((s) => s?.name?.trim())
    .filter((n): n is string => Boolean(n));
  if (speakers.length > 0) out.speaker_names = speakers;
  if (episode.show?.title?.trim()) out.show_title = episode.show.title.trim();
  const existing = episode.chapters ?? [];
  if (existing.length > 0) {
    out.existing_chapters = existing
      .map(
        (c) =>
          `- ${c.start_hint} ${c.title}${c.summary?.trim() ? ` — ${c.summary.trim()}` : ""}`,
      )
      .join("\n");
  }
  return out;
}
