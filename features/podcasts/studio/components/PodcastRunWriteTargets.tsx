"use client";

/**
 * PodcastRunWriteTargets — the live handlers for the write half of
 * `matrx-user/podcast-run` (`episode_title`, `episode_description`).
 *
 * Both land through `useStudioRun.applyEpisodeMetadata`, which is the ONE
 * canonical path: `podcastService.updateEpisode(episodeId, patch)` — the exact
 * call the Title options panel's "Use" button already makes — followed by a
 * reflect into the run state the hero renders. No component here touches
 * supabase, and there is no second way to set a title.
 *
 * The `episode_chapters` handler is NOT here: it lives in
 * `EpisodeChaptersPanel`, which owns the loaded episode row, the chapter list,
 * and the canonical `saveEpisodeChapters` call that target writes through.
 *
 * Renders nothing. Mount once inside the run page's `SurfaceRuntimeProvider`.
 * Handlers throw on a bad shape or a mid-run attempt — the writeback runtime
 * turns that into the loud toast + captured error.
 */

import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { UseStudioRun } from "@/features/podcasts/studio/runs/useStudioRun";

export const PODCAST_RUN_SURFACE_NAME = "matrx-user/podcast-run";

/** Wire value for the `episode_title` target. */
export interface EpisodeTitleWrite {
  title: string;
}

/** Wire value for the `episode_description` target. */
export interface EpisodeDescriptionWrite {
  description: string;
}

const MAX_TITLE_CHARS = 200;
const MAX_DESCRIPTION_CHARS = 2000;

export function asRecord(
  value: unknown,
  target: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects an object value.`);
  }
  return value as Record<string, unknown>;
}

export function requiredString(
  obj: Record<string, unknown>,
  key: string,
  target: string,
  maxChars: number,
): string {
  const raw = obj[key];
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(`${target}: ${key} must be a non-empty string.`);
  }
  const trimmed = raw.trim();
  if (trimmed.length > maxChars) {
    throw new Error(
      `${target}: ${key} must be ${maxChars} characters or fewer (got ${trimmed.length}).`,
    );
  }
  return trimmed;
}

/**
 * The mid-run guard, shared by every target on this surface.
 *
 * A run that is still producing writes these very columns from the pipeline,
 * so an agent value applied now would be silently overwritten by the next
 * metadata event — "applied" would be a lie. Refuse loudly instead. Also
 * refuses before the episode row exists, since there is nothing to write to.
 */
export function assertRunWritable(
  run: Pick<
    UseStudioRun,
    "state" | "streaming" | "backgroundWorking"
  >,
  target: string,
): void {
  if (run.streaming || run.backgroundWorking || run.state.status === "running") {
    throw new Error(
      `${target}: this run is still producing the episode. Wait for it to finish — a value written now would be overwritten by the pipeline.`,
    );
  }
  if (!run.state.episodeId) {
    throw new Error(
      `${target}: this run has no saved episode yet, so there is nothing to write to.`,
    );
  }
}

export function PodcastRunWriteTargets({ run }: { run: UseStudioRun }) {
  useSurfaceWriteHandlers(PODCAST_RUN_SURFACE_NAME, {
    episode_title: async (value: unknown) => {
      const obj = asRecord(value, "episode_title");
      const title = requiredString(obj, "title", "episode_title", MAX_TITLE_CHARS);
      if (title.includes("\n")) {
        throw new Error("episode_title: title must be a single line.");
      }
      assertRunWritable(run, "episode_title");
      await run.applyEpisodeMetadata({ title });
    },

    episode_description: async (value: unknown) => {
      const obj = asRecord(value, "episode_description");
      const description = requiredString(
        obj,
        "description",
        "episode_description",
        MAX_DESCRIPTION_CHARS,
      );
      assertRunWritable(run, "episode_description");
      await run.applyEpisodeMetadata({ description });
    },
  });

  return null;
}
