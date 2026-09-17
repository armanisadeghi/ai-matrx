import { chapterStartSeconds } from "@/features/content-ir/kinds/media-chapters";
import type { PcEpisodeChapter } from "@/features/podcasts/types";

/** A chapter start must be before the media end, so a whole-second marker may
 * use the final integer second only when that second is still playable. */
function maxPlayableSecond(durationSeconds: number): number {
  return Math.ceil(durationSeconds) - 1;
}

/** `pc_episodes.duration_seconds` is PostgreSQL int4; retain the closest
 * truthful display/runtime hint without sending a fractional value to it. */
export function durationSecondsForStorage(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Audio metadata did not provide a positive duration; chapter markers were not saved.");
  }
  return Math.max(1, Math.round(durationSeconds));
}

function formatStartHint(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

/**
 * The shared chapter-write boundary. It is deliberately independent of the
 * generator and the surface write target: both must hand persistence one
 * list whose rows can actually seek within the episode's audio.
 */
export function normalizeChapterTiming(
  chapters: PcEpisodeChapter[],
  durationSeconds: number,
): PcEpisodeChapter[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Chapter markers need a known positive audio duration before they can be saved.");
  }
  if (chapters.length === 0) {
    throw new Error("Chapter markers need at least one chapter before they can be saved.");
  }

  const starts = chapters.map((chapter, index) => {
    const seconds = chapterStartSeconds(chapter.start_hint ?? "");
    if (seconds === null) {
      throw new Error(`Chapter ${index + 1} has an invalid start time and was not saved.`);
    }
    return seconds;
  });

  if (starts[0] !== 0) {
    throw new Error("The first chapter must start at 00:00 and was not saved.");
  }
  for (let index = 1; index < starts.length; index += 1) {
    if (starts[index] <= starts[index - 1]) {
      throw new Error("Chapter markers must be strictly increasing and were not saved.");
    }
  }

  const maxSecond = maxPlayableSecond(durationSeconds);
  if (maxSecond < 0 || chapters.length > maxSecond + 1) {
    throw new Error(
      `This ${durationSeconds.toFixed(3)}s audio file cannot hold ${chapters.length} distinct whole-second chapter markers.`,
    );
  }

  // Already playable: preserve user-authored timestamps exactly (apart from
  // canonical display padding) instead of perturbing a good chapter map.
  const sourceEnd = starts[starts.length - 1];
  if (sourceEnd <= maxSecond) {
    return chapters.map((chapter, index) => ({
      ...chapter,
      start_hint: formatStartHint(starts[index]),
    }));
  }

  // Generated markers often reflect an absent/stale duration hint. Scale the
  // complete sequence into the real playable interval so relative pacing and
  // order survive, reserving a distinct integer second for every later row.
  const normalized = [0];
  for (let index = 1; index < starts.length; index += 1) {
    const start = starts[index];
    const proportional = Math.round((start / sourceEnd) * maxSecond);
    const minimum = normalized[index - 1] + 1;
    const maximum = maxSecond - (starts.length - 1 - index);
    normalized.push(Math.min(maximum, Math.max(minimum, proportional)));
  }

  return chapters.map((chapter, index) => ({
    ...chapter,
    start_hint: formatStartHint(normalized[index]),
  }));
}

/**
 * Copy for every caller that reports a successful chapter save. A normalizer
 * that is not disclosed at this seam would silently change listener-facing
 * seek targets.
 */
export function chapterTimingAdjustmentNotice(
  requested: PcEpisodeChapter[],
  saved: PcEpisodeChapter[],
  durationSeconds: number | null,
): string | null {
  const adjusted = requested.reduce((count, chapter, index) => {
    const before = chapterStartSeconds(chapter.start_hint ?? "");
    const after = chapterStartSeconds(saved[index]?.start_hint ?? "");
    return count + (before !== after ? 1 : 0);
  }, 0);
  if (adjusted === 0 || !durationSeconds || durationSeconds <= 0) return null;
  return `Adjusted ${adjusted} chapter ${adjusted === 1 ? "timestamp" : "timestamps"} to fit the actual ${durationSeconds.toFixed(3)}-second audio. Review the chapter markers before publishing.`;
}

/** Resolve the duration from the same browser media metadata the player uses. */
export function resolveAudioMetadataDuration(audioUrl: string): Promise<number> {
  if (typeof Audio === "undefined") {
    return Promise.reject(new Error("Audio metadata is unavailable here; chapter markers were not saved."));
  }
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", onMetadata);
      audio.removeEventListener("error", onError);
      window.clearTimeout(timeout);
      audio.removeAttribute("src");
      audio.load();
    };
    const onMetadata = () => {
      const duration = audio.duration;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Audio metadata did not provide a positive duration; chapter markers were not saved."));
        return;
      }
      resolve(duration);
    };
    const onError = () => {
      cleanup();
      reject(new Error("Audio metadata could not be loaded; chapter markers were not saved."));
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Audio metadata timed out; chapter markers were not saved."));
    }, 15_000);
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", onMetadata, { once: true });
    audio.addEventListener("error", onError, { once: true });
    audio.src = audioUrl;
    audio.load();
  });
}
