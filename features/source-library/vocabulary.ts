/**
 * WHAT THIS LIBRARY'S SOURCES ARE CALLED — and what a number about them means.
 *
 * 🚨 THE HEADER MUST NOT SPEAK YOUTUBE TO A PODCAST. A Library is one primitive
 * over many adapters, so the metrics header used to print YouTube's words over
 * everyone's counts: a podcast with 886 episodes read "LONG VIDEOS 886" (the
 * server sorts episodes into `long`/`short` by a duration threshold), and a
 * blog with 10,563 posts read "UNCLASSIFIED 10,563" (the blog adapter stores
 * every post as `media_kind: "unknown"`, correctly — there is no such axis for
 * a post). The counts were right and every word around them was wrong.
 *
 * 🚨 AND IT MUST NOT INVENT A NUMBER TO GO WITH A BETTER WORD. "Posts, words"
 * is the right vocabulary for a blog, but the server's §5 metrics carry no word
 * count, and the blog adapter sets no duration — so this file says a blog has
 * no length axis AT ALL, and the header renders those slots as empty, not as
 * "0 min". A tile is honest or absent. The day the server publishes a word
 * count, this file is where it becomes "Words" and nothing else changes.
 *
 * The default is deliberately NEUTRAL, not YouTube: an adapter this file has
 * never heard of gets "items" and no axes, so a new adapter can never arrive
 * wearing somebody else's clothes.
 */

import type { LibraryRow, MediaAdapter } from "./types";

export interface SourceVocabulary {
    /** What ONE catalogued thing is, in this Library. */
    item: { one: string; many: string };
    /**
     * The long / short / live split, when it is a real distinction for this
     * kind of Source. `null` everywhere else — the server still fills
     * `counts_by_kind`, and printing it would be a category error.
     */
    kindSplit: { long: string; short: string; live: string; unknown: string } | null;
    /** What a duration MEANS here, or null when nothing here has one. */
    length: { total: string; median: string; mean: string } | null;
    /**
     * Whether a caption / transcript axis exists. A blog post and a slide deck
     * are already text; there is nothing to caption and nothing to transcribe.
     */
    transcribable: boolean;
    /**
     * Where the FREE transcription lane's text comes from, in the same words
     * the job panel and the confirm dialog print beside `free_captions` (§7.1).
     * `null` when `transcribable` is false — there is no free lane to name.
     * D6b (jobs-bar cold-walk-12): this used to be a hardcoded "YouTube's own
     * captions" printed over a podcast row, which the row's OWN failure text
     * beside it correctly called "a podcast" — one screen, two vocabularies.
     */
    freeCaptionsSource: string | null;
    /** The cadence chart's own title. */
    cadence: string;
}

const NEUTRAL: SourceVocabulary = {
    item: { one: "item", many: "Items" },
    kindSplit: null,
    length: null,
    transcribable: false,
    freeCaptionsSource: null,
    cadence: "Added, by month",
};

const BY_ADAPTER: Partial<Record<MediaAdapter, SourceVocabulary>> = {
    youtube: {
        item: { one: "video", many: "Videos" },
        kindSplit: {
            long: "Long videos",
            short: "Shorts",
            live: "Live",
            unknown: "Unclassified",
        },
        length: {
            total: "Total length",
            median: "Median length",
            mean: "mean per video",
        },
        transcribable: true,
        freeCaptionsSource: "YouTube's own captions",
        cadence: "Publishing cadence, by month",
    },
    podcast_rss: {
        item: { one: "episode", many: "Episodes" },
        // The server sorts episodes into long/short by a duration threshold.
        // That is a YouTube distinction wearing a podcast's data, so it is not
        // shown: an episode is an episode.
        kindSplit: null,
        length: {
            total: "Total listening time",
            median: "Median episode",
            mean: "mean per episode",
        },
        transcribable: true,
        freeCaptionsSource: "the show's own published transcript",
        cadence: "Publishing cadence, by month",
    },
    blog_feed: {
        item: { one: "post", many: "Posts" },
        kindSplit: null,
        // No duration and no word count reach the client today. Absent, not zero.
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        cadence: "Publishing cadence, by month",
    },
    slide_deck: {
        item: { one: "deck", many: "Decks" },
        kindSplit: null,
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        cadence: "Published, by month",
    },
    drive_folder: {
        item: { one: "file", many: "Files" },
        kindSplit: null,
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        cadence: "Added, by month",
    },
    onedrive_drive: {
        item: { one: "file", many: "Files" },
        kindSplit: null,
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        cadence: "Added, by month",
    },
    google_picked_files: {
        item: { one: "file", many: "Files" },
        kindSplit: null,
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        cadence: "Added, by month",
    },
    outlook_mail: {
        item: { one: "message", many: "Messages" },
        kindSplit: null,
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        cadence: "Received, by month",
    },
    outlook_calendar: {
        item: { one: "event", many: "Events" },
        kindSplit: null,
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        cadence: "Scheduled, by month",
    },
    teams_chat: {
        item: { one: "conversation", many: "Conversations" },
        kindSplit: null,
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        cadence: "Active, by month",
    },
};

/**
 * The words for one Library. `null` (the row has not arrived yet) gets the
 * neutral set, so the header never guesses YouTube while it is still loading.
 */
export function sourceVocabulary(library: LibraryRow | null): SourceVocabulary {
    if (!library) return NEUTRAL;
    return BY_ADAPTER[library.adapter] ?? NEUTRAL;
}

/** Every adapter this file speaks for — the guard iterates it. */
export const ADAPTERS_WITH_VOCABULARY = Object.keys(BY_ADAPTER) as MediaAdapter[];
