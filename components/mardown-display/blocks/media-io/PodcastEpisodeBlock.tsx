"use client";

/**
 * PodcastEpisodeBlock — THE renderer for the `podcast_episode` kind. There is
 * no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (`features/content-ir/FEATURE.md`). This is
 * the podcast pipeline's terminal deliverable wherever a RUN is displayed —
 * chat, the live-run window, the workflow-runtime readout. It is not a second
 * episode page: managing an episode lives in `features/podcasts/`, and this
 * card's job is to show what the run produced and open the doors to it.
 *
 * 🚨 MEDIA DURABILITY. Audio, artwork and video all render through
 * `<InlineMediaRef>`, handed the id-first handles the bridge already paired
 * (`kinds/podcast-episode.ts` → `pairHandles`). The component never writes a
 * raw `src` and never re-decides id-vs-URL.
 *
 * NO DEAD ENDS. A persisted episode (slug) links to its public page; a failed
 * official-video composition states the error instead of silently omitting
 * the video.
 */

import Link from "next/link";
import { AlertTriangle, ExternalLink, Loader2, Mic } from "lucide-react";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { episodeHref } from "@/features/podcasts/generator/constants";
import {
  readPodcastSpeakerList,
  type PodcastEpisodeData,
  type PodcastSpeakerData,
} from "@/features/content-ir/kinds/podcast-episode";
import { cn } from "@/lib/utils";

export interface PodcastEpisodeBlockProps {
  serverData?: unknown;
  hideHeader?: boolean;
  className?: string;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function readPodcastEpisodeData(
  serverData: unknown,
): PodcastEpisodeData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<PodcastEpisodeData>;
  if (!("show_id" in candidate)) return null;
  return {
    show_id: stringOr(candidate.show_id, ""),
    title: stringOr(candidate.title, ""),
    description: stringOr(candidate.description, ""),
    script: stringOr(candidate.script, ""),
    speakers: readPodcastSpeakerList(candidate.speakers),
    host_count:
      typeof candidate.host_count === "number" ? candidate.host_count : null,
    audioHandle:
      typeof candidate.audioHandle === "string" ? candidate.audioHandle : null,
    imageHandles: stringArray(candidate.imageHandles),
    videoHandles: stringArray(candidate.videoHandles),
    officialVideoHandle:
      typeof candidate.officialVideoHandle === "string"
        ? candidate.officialVideoHandle
        : null,
    official_video_error: stringOr(candidate.official_video_error, ""),
    episode_id:
      typeof candidate.episode_id === "string" ? candidate.episode_id : null,
    episode_slug:
      typeof candidate.episode_slug === "string" ? candidate.episode_slug : null,
    isComplete: candidate.isComplete === true,
  };
}

// ---------------------------------------------------------------------------
// PARTS — importable alone. The ONLY sanctioned way to render part of this
// shape.
// ---------------------------------------------------------------------------

export function PodcastCastChips({ speakers }: { speakers: PodcastSpeakerData[] }) {
  if (speakers.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {speakers.map((speaker, index) => (
        <span
          key={`${speaker.name}-${index}`}
          className="animate-in fade-in rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
          title={speaker.voice ? `Voice: ${speaker.voice}` : undefined}
        >
          {speaker.name}
        </span>
      ))}
    </div>
  );
}

export function PodcastEpisodeScript({ script }: { script: string }) {
  if (!script.trim()) return null;
  return (
    <details className="rounded-md border border-border">
      <summary className="cursor-pointer px-2 py-1.5 text-xs font-medium text-foreground">
        Script
      </summary>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap px-2 pb-2 text-xs text-muted-foreground">
        {script}
      </pre>
    </details>
  );
}

// ---------------------------------------------------------------------------
// The parent — composes the parts.
// ---------------------------------------------------------------------------

export default function PodcastEpisodeBlock({
  serverData,
  hideHeader = false,
  className,
}: PodcastEpisodeBlockProps) {
  const data = readPodcastEpisodeData(serverData);
  if (!data) return null;

  // THE DOOR LAW: a persisted episode has a public page — reachable by slug
  // or, when persistence produced only an id, by id. One href builder, shared
  // with the studio.
  const episodeUrl = episodeHref(data.episode_slug, data.episode_id);

  return (
    <div className={cn("my-2 space-y-2.5", className)}>
      {!hideHeader && (
        <div className="flex flex-wrap items-center gap-2">
          <Mic className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {data.title || "Podcast episode"}
          </span>
          {!data.isComplete && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Producing
            </span>
          )}
          {episodeUrl && (
            <Link
              href={episodeUrl}
              className="ml-auto inline-flex items-center gap-1 rounded text-xs text-primary underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Open episode
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}

      {data.description && (
        <p className="text-sm text-muted-foreground">{data.description}</p>
      )}

      <PodcastCastChips speakers={data.speakers} />

      {/* The wrapper is a HEIGHT, not chrome: `size="fill"` means `h-full`,
          and a parent with auto height renders the player at 0px. */}
      {data.audioHandle && (
        <div className="h-[54px] w-full">
          <InlineMediaRef
            ref={data.audioHandle}
            as="audio"
            size="fill"
            rounded="md"
            controls
            preload="metadata"
          />
        </div>
      )}

      {data.officialVideoHandle && (
        <InlineMediaRef
          ref={data.officialVideoHandle}
          as="video"
          size="fill"
          fit="contain"
          rounded="md"
          border="subtle"
          controls
          preload="metadata"
          className="aspect-video w-full bg-black"
        />
      )}

      {/* A composition failure is stated, never swallowed — the user would
          otherwise just see a missing video and no reason. */}
      {data.official_video_error && (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Official video could not be composed: {data.official_video_error}
        </p>
      )}

      {data.imageHandles.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {data.imageHandles.map((handle, index) => (
            <InlineMediaRef
              key={handle}
              ref={handle}
              as="img"
              size="fill"
              fit="cover"
              rounded="md"
              border="subtle"
              alt={`Episode artwork ${index + 1}`}
              className="aspect-square w-full bg-muted"
            />
          ))}
        </div>
      )}

      {data.videoHandles.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {data.videoHandles.map((handle) => (
            <InlineMediaRef
              key={handle}
              ref={handle}
              as="video"
              size="fill"
              fit="contain"
              rounded="md"
              border="subtle"
              controls
              preload="metadata"
              className="aspect-video w-full bg-black"
            />
          ))}
        </div>
      )}

      <PodcastEpisodeScript script={data.script ?? ""} />
    </div>
  );
}
