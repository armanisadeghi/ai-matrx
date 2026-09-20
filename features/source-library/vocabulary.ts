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
    /**
     * What a view/play count is called here, or `null` when this kind of
     * Source has no such number AT ALL.
     *
     * 🚨 A COLUMN THAT CAN NEVER FILL IS NOT A COLUMN (jobs-bar cold-walk-13,
     * Friction). A podcast Library rendered a VIEWS column reading `—` on
     * every one of 2,981 rows, and a "Most watched" panel beside it: an RSS
     * feed publishes no play count, so neither could ever be anything else.
     * Same rule as `length` and `kindSplit` above — absent, never a row of
     * dashes, and never a header promising a number nobody has.
     */
    views: { column: string; top: string } | null;
    /** The cadence chart's own title. */
    cadence: string;
}

const NEUTRAL: SourceVocabulary = {
    item: { one: "item", many: "Items" },
    kindSplit: null,
    length: null,
    transcribable: false,
    freeCaptionsSource: null,
    views: null,
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
        views: { column: "Views", top: "Most watched" },
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
        views: null,
        cadence: "Publishing cadence, by month",
    },
    blog_feed: {
        item: { one: "post", many: "Posts" },
        kindSplit: null,
        // No duration and no word count reach the client today. Absent, not zero.
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        views: null,
        cadence: "Publishing cadence, by month",
    },
    slide_deck: {
        item: { one: "deck", many: "Decks" },
        kindSplit: null,
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        views: null,
        cadence: "Published, by month",
    },
    drive_folder: {
        item: { one: "file", many: "Files" },
        kindSplit: null,
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        views: null,
        cadence: "Added, by month",
    },
    onedrive_drive: {
        item: { one: "file", many: "Files" },
        kindSplit: null,
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        views: null,
        cadence: "Added, by month",
    },
    google_picked_files: {
        item: { one: "file", many: "Files" },
        kindSplit: null,
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        views: null,
        cadence: "Added, by month",
    },
    outlook_mail: {
        item: { one: "message", many: "Messages" },
        kindSplit: null,
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        views: null,
        cadence: "Received, by month",
    },
    outlook_calendar: {
        item: { one: "event", many: "Events" },
        kindSplit: null,
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        views: null,
        cadence: "Scheduled, by month",
    },
    teams_chat: {
        item: { one: "conversation", many: "Conversations" },
        kindSplit: null,
        length: null,
        transcribable: false,
        freeCaptionsSource: null,
        views: null,
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

/**
 * 🚨 N6 (jobs-bar cold-walk-13): THE SERVER'S SENTENCES SPEAK THIS TABLE TOO.
 *
 * Walk 12 fixed the headers — "3 episodes selected", "Transcribe 3 episodes" —
 * because those are written HERE, from the table above. Walk 13 found the word
 * "video" seven more times in the same two dialogs, all of it in sentences the
 * SERVER wrote: the Action registry's own descriptions, the estimate's cost
 * basis, its warnings, and the refusal you get when a selection has no
 * transcripts.
 *
 * The server cannot fix that by itself. `GET /media/actions` is one global
 * registry — it has no Library and therefore no adapter — so a description
 * baked with a noun is baked with somebody else's noun for everyone. The
 * server now writes those sentences with TOKENS instead, and this function is
 * the one place they become words. One table, one substitution, and a header
 * and the sentence under it can no longer disagree.
 *
 * The tokens (the server half is `aidream/services/media_catalog`):
 *   {item} {items}                singular / plural, lowercase
 *   {Item} {Items}                the same, capitalised for sentence starts
 *   {free_captions_source}        where the free lane's words come from
 *
 * UNKNOWN TOKENS ARE LEFT ALONE, NEVER BLANKED. A `{whatever}` this build has
 * never heard of is a server ahead of this client; printing it intact is ugly
 * and obvious, which is what we want — blanking it would quietly delete a
 * noun from the middle of a sentence and nobody would ever find it.
 */
export function speakMediaNouns(
    text: string,
    vocabulary: SourceVocabulary,
): string;
export function speakMediaNouns(
    text: string | null | undefined,
    vocabulary: SourceVocabulary,
): string | null;
export function speakMediaNouns(
    text: string | null | undefined,
    vocabulary: SourceVocabulary,
): string | null {
    if (text == null) return null;
    const one = vocabulary.item.one;
    const many = vocabulary.item.many.toLowerCase();
    const replacements: Record<string, string> = {
        item: one,
        items: many,
        Item: capitalise(one),
        Items: capitalise(many),
        // A Library with no free lane still has to read as a sentence. The
        // neutral phrasing names no provider and promises nothing.
        free_captions_source:
            vocabulary.freeCaptionsSource ?? "captions it already has",
    };
    return text.replace(/\{([A-Za-z_]+)\}/g, (whole, token: string) =>
        token in replacements ? replacements[token] : whole,
    );
}

function capitalise(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1);
}
