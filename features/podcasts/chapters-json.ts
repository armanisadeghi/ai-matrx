// features/podcasts/chapters-json.ts
//
// The Podcasting 2.0 "JSON Chapters" document for one episode — the thing
// `<podcast:chapters>` in the RSS feed points at, and the thing the
// `/podcast/<slug>/chapters.json` route serves.
//
// WHY A JSON DOCUMENT AND NOT INLINE PSC TAGS.
// The two ways to ship chapters in a feed are Podlove Simple Chapters
// (`<psc:chapters>`, inline in every <item>) and the Podcast Index namespace's
// `<podcast:chapters url= type="application/json+chapters"/>` pointing at an
// external JSON file. We emit the latter, for three reasons:
//   1. It is the format modern podcast apps actually read (Podcast Index,
//      Fountain, Podverse, Pocket Casts, Overcast). PSC is legacy.
//   2. It keeps the feed small and its cache lifetime independent — a feed
//      with 50 episodes × 20 chapters inline is an enormous document that must
//      be regenerated whenever any chapter changes. A pointer does not.
//   3. It is the shape a Next.js App Router codebase already speaks: one more
//      Route Handler next to `feed.xml`, no XML string-building for a payload
//      that is natively JSON.
//
// Format: JSON Chapters Format 1.2.0
// (https://github.com/Podcastindex-org/podcast-namespace/blob/main/chapters/jsonChapters.md).
// Only `startTime` and `title` are required, and those are the only fields our
// chapter markers carry that the format has a home for — the agent's one-line
// `summary` has NO field in the spec (there is no description/summary key), so
// it is deliberately dropped here rather than smuggled into `title`. It stays
// visible in the player's chapter list.

import { chapterStartSeconds } from "@/features/content-ir/kinds/media-chapters";
import type { PcEpisodeChapter } from "@/features/podcasts/types";

/** The MIME type the spec requires on both the RSS attribute and the response. */
export const CHAPTERS_JSON_MIME = "application/json+chapters";

/** The version this document declares. */
export const CHAPTERS_JSON_VERSION = "1.2.0";

export interface JsonChapter {
  /** Offset from the start of the media, in seconds. */
  startTime: number;
  title: string;
}

export interface JsonChaptersDocument {
  version: string;
  chapters: JsonChapter[];
}

/**
 * Persisted chapter markers → the JSON Chapters document.
 *
 * A row whose `start_hint` does not parse as MM:SS / HH:MM:SS is DROPPED, not
 * defaulted to 0 — a chapter that jumps listeners to the wrong place is worse
 * than a missing one. Output is sorted by `startTime` because the format's
 * consumers assume playback order, and a stray out-of-order row would make an
 * app's chapter cursor jump backwards.
 */
export function buildChaptersJson(
  chapters: PcEpisodeChapter[] | null | undefined,
): JsonChaptersDocument {
  const out: JsonChapter[] = [];
  for (const chapter of chapters ?? []) {
    const title = chapter.title?.trim();
    if (!title) continue;
    const startTime = chapterStartSeconds(chapter.start_hint ?? "");
    if (startTime === null) continue;
    out.push({ startTime, title });
  }
  out.sort((a, b) => a.startTime - b.startTime);
  return { version: CHAPTERS_JSON_VERSION, chapters: out };
}

/** Public URL of an episode's chapters document. `base` must have no trailing slash. */
export function chaptersJsonUrl(base: string, episodeSlug: string): string {
  return `${base}/podcast/${episodeSlug}/chapters.json`;
}
