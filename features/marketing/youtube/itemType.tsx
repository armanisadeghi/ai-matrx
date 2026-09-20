"use client";

/**
 * YouTube Plane C — `web_youtube_video`'s ONE registration in THE
 * item-presentation registry (one import line and one entry in `registry.tsx`).
 * Everything the record shows as a window, a docked panel, or
 * `/detail/web_youtube_video/<id>` comes from here, through the same
 * `refineDetail` seam the Google Doc (U-W1) and the calendar event (U-W2) use —
 * never a second registry and never a bespoke video screen.
 *
 * 🚨 THIS FILE IS THE HANDOVER V-22 NEW-6 ASKED FOR. The registry carried an
 * INLINE `web_youtube_video` entry from that finding, with the note: *"It is
 * registered INLINE rather than beside a feature because no feature owns this
 * table in this repo yet… when a YouTube surface lands it takes this entry
 * over, the way `features/marketing/site-item-type.ts` did for a site."* This
 * is that surface, so the entry moves here and GAINS what the inline one could
 * not have: a typed loader over the real table, a curated field list, the
 * health strip telling the truth about this VIDEO and not only the account, and
 * the two sections below.
 *
 * What the generic registration already gives and this file therefore does NOT:
 * the header and its doors, the health strip's producer, the associations
 * section (where the `covers` edge to a topical-map topic renders), the history
 * section, the three presentations, the keyboard model and the right-click
 * frame.
 */

import { MonitorPlay } from "lucide-react";

import type { ItemTypeConfig } from "@/features/item-presentation/registry";
import type { EnrichedItem } from "@/features/item-presentation/types";
import type { DetailRecordType, DetailSection } from "@/lib/detail/types";

import {
  YouTubeVideoAvailabilitySection,
  YouTubeVideoUnavailableActionsSection,
  videoNeedsAvailabilityNotice,
} from "./components/YouTubeVideoSections";
import {
  YOUTUBE_VIDEO_TYPE,
  asYouTubeVideoRow,
  publishedText,
  videoStatsOf,
  youtubeVideoDetailRow,
  youtubeVideoFields,
  youtubeVideoHealthOverride,
} from "./record";
import { readYouTubeVideo } from "./service";

/**
 * 🚨 THE STRIP TELLS THE TRUTH ABOUT **THIS VIDEO**, NOT ONLY ABOUT THE
 * ACCOUNT — same law as the Doc and calendar-event siblings. The merge itself
 * is pure (`youtubeVideoHealthOverride`: no React, no network) so it is
 * unit-tested without mounting anything; this wrapper only runs the generic
 * producer and hands the row to it.
 */
function refineHealth(base: DetailRecordType): DetailRecordType["health"] {
  const inner = base.health ?? null;
  return async (row, ctx) => {
    const typed = asYouTubeVideoRow(row);
    if (!typed) return inner ? inner(row, ctx) : null;
    const produced = inner ? await inner(row, ctx) : null;
    if (ctx.signal.aborted) return null;
    return youtubeVideoHealthOverride(typed, produced);
  };
}

/** The refinement the registry hands to `resolveItemDetailType`. */
export function refineYouTubeVideoDetail(base: DetailRecordType): DetailRecordType {
  return {
    ...base,
    load: async (id, signal) => {
      const row = await readYouTubeVideo(id, signal);
      if (!row) return { notFound: true };
      return { row: youtubeVideoDetailRow(row) };
    },
    title: (row, seed) => {
      const typed = asYouTubeVideoRow(row);
      return typed?.title?.trim() || seed?.name?.trim() || "Untitled video";
    },
    fields: (row) => {
      const typed = asYouTubeVideoRow(row);
      // A row this registration cannot recognise gets NO invented fields; the
      // primitive's own absent state is honest about having nothing to show.
      return typed ? youtubeVideoFields(typed, new Date()) : [];
    },
    health: refineHealth(base),
    extraSections: (row) => {
      const typed = asYouTubeVideoRow(row);
      if (!typed) return [];
      const sections: DetailSection[] = [];
      if (videoNeedsAvailabilityNotice(typed)) {
        sections.push({
          id: "youtube-availability",
          label: "YouTube",
          content: <YouTubeVideoAvailabilitySection video={typed} />,
        });
      }
      sections.push({
        id: "read-only",
        label: "What you cannot change from here",
        content: <YouTubeVideoUnavailableActionsSection />,
      });
      return sections;
    },
  };
}

/**
 * The registry entry. `entityToken` is omitted because the item type and the
 * entity token are the same word — `web_youtube_video` is a registered
 * `platform.entity_types` token (aidream migration 0767, certified live), which
 * is what gives the record its route, its peek, its associations and its
 * history.
 */
export const WEB_YOUTUBE_VIDEO_ITEM_TYPE: ItemTypeConfig = {
  type: YOUTUBE_VIDEO_TYPE,
  label: "YouTube video",
  icon: MonitorPlay,
  accent: {
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    ring: "ring-red-500/20",
  },
  // No bespoke window exists, so it opens the Detail primitive — window by
  // default, docked or page per the person's own setting.
  open: { kind: "web_youtube_video" },
  // The address the generic machinery reads (the entity registry and the
  // doors); the TYPED read in the refinement above is what actually runs.
  detailSource: { table: "youtube_video", schemaName: "web", titleField: "title" },
  // The card's own read, so a video card an agent emits shows the real title
  // and the real counts instead of the model's guess.
  enrich: async (_client, id): Promise<EnrichedItem> => {
    const row = await readYouTubeVideo(id, new AbortController().signal);
    if (!row) return { notFound: true };
    const stats = videoStatsOf(row.stats);
    return {
      name: row.title,
      about: publishedText(row.published_at),
      details: [
        stats.views === null
          ? null
          : { label: "Views", value: Intl.NumberFormat().format(stats.views) },
      ].filter(Boolean) as EnrichedItem["details"],
    };
  },
  refineDetail: refineYouTubeVideoDetail,
};
