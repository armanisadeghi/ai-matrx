/**
 * ONE LIBRARY PRIMITIVE, MANY KINDS OF SOURCE — AND NONE OF THEM SPEAKS YOUTUBE.
 *
 * The metrics header printed YouTube's words over everybody's counts. A podcast
 * with 886 episodes read "LONG VIDEOS 886", because the server sorts episodes
 * into `long`/`short` by a duration threshold. A blog with 10,563 posts read
 * "UNCLASSIFIED 10,563", because the blog adapter stores every post as
 * `media_kind: "unknown"` — correctly; there is no such axis for a post. Every
 * number was right and every word around it was wrong.
 *
 * The other half matters just as much: the better vocabulary must not invent
 * numbers to go with it. The server's §5 metrics carry no word count and the
 * blog adapter sets no duration, so a blog gets NO length tiles — not "0 min",
 * not a skeleton, nothing. The slot holds its space silently.
 *
 * RED PROOFS:
 *
 *   N1 — in `components/LibraryMetricsHeader.tsx`, hardcode the labels back
 *        (`label: "Shorts"`, `label: "Total length"`, `` `${mediaKindLabel(
 *        "long")} videos` ``) instead of reading `vocabulary`.
 *        → "a podcast is counted in episodes" and "a blog is counted in posts"
 *          fail with the exact words the podcast lane reported.
 *
 *   N2 — drop `applies` from `MetricTile`, so a tile that does not apply renders
 *        anyway.
 *        → "a blog is never given a running time" fails: the header prints
 *          "0 min" and "Median length" over posts that have no duration.
 *
 *   N3 — in `vocabulary.ts`, make the fallback `BY_ADAPTER.youtube` instead of
 *        `NEUTRAL`.
 *        → "an adapter nobody has taught this screen about says nothing it
 *          cannot back" fails: a brand-new adapter arrives wearing YouTube's
 *          clothes, which is the whole defect.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { LibraryMetricsHeader } from "../components/LibraryMetricsHeader";
import {
    ADAPTERS_WITH_VOCABULARY,
    sourceVocabulary,
} from "../vocabulary";
import type { LibraryMetrics, LibraryRow, MediaAdapter } from "../types";
import type { SyncState } from "../redux/sourceLibrarySlice";

const IDLE_SYNC: SyncState = {
    phase: "idle", startedAt: null, finishedElapsedMs: null, listed: 0,
    expectedTotal: null, pagesReceived: 0, operationId: null, message: null,
    remedy: null, retryable: false, partialTotal: null, quotaUnitsSpent: null, problems: [],
};

function library(adapter: MediaAdapter, total: number): LibraryRow {
    return {
        id: "11111111-2222-3333-4444-555555555555",
        organization_id: "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f",
        adapter,
        kind: "channel",
        external_id: "x",
        uploads_playlist_id: null,
        name: "A Library",
        description: null,
        handle: null,
        canonical_url: "https://example.com",
        thumbnail_url: null,
        visibility: "personal",
        item_count: total,
        sync_status: "idle",
        sync_error: null,
        last_synced_at: "2026-09-18T00:00:00Z",
        last_sync_duration_ms: 1000,
        settings: {},
        metrics: null,
        created_at: "2026-09-18T00:00:00Z",
        updated_at: "2026-09-18T00:00:00Z",
        created_by: null,
    };
}

/**
 * The metrics the server really returns for a non-video Library: a podcast's
 * episodes land in `long`, a blog's posts land in `unknown`, and a blog has no
 * durations at all.
 */
function metrics(shape: "podcast" | "blog" | "video", total: number): LibraryMetrics {
    const zeroLength = { total_seconds: 0, mean_seconds: 0, median_seconds: 0, p90_seconds: 0 };
    return {
        computed_at: "2026-09-18T00:00:00Z",
        library_id: "11111111-2222-3333-4444-555555555555",
        total,
        counts_by_kind:
            shape === "podcast"
                ? { long: total, short: 0, live: 0, unknown: 0 }
                : shape === "blog"
                  ? { long: 0, short: 0, live: 0, unknown: total }
                  : { long: total - 50, short: 50, live: 0, unknown: 0 },
        date_range: { earliest: null, latest: null, span_days: null },
        cadence_per_month: [{ period: "2026-01", count: total, seconds: shape === "blog" ? 0 : 60 }],
        length: shape === "blog" ? zeroLength : { ...zeroLength, total_seconds: 3600, median_seconds: 600 },
        length_by_kind: {},
        top_by_views: [],
        engagement: { total_views: 0, total_likes: 0, median_views: 0 },
        caption_coverage: { with_captions: 0, without_captions: 0, unknown: total, coverage_percent: 0 },
        transcripts: { ready: 0, queued: 0, running: 0, failed: 0, none: total },
        stale: false,
    } as unknown as LibraryMetrics;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(adapter: MediaAdapter, shape: "podcast" | "blog" | "video", total: number) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root!.render(
            <LibraryMetricsHeader
                library={library(adapter, total)}
                metrics={metrics(shape, total)}
                sync={IDLE_SYNC}
                elapsedMs={0}
                onBringUpToDate={() => {}}
            />,
        );
    });
    return container;
}

afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
});

describe("N · the header speaks the Library's own words", () => {
    it("a podcast is counted in episodes, never in long videos", () => {
        const node = render("podcast_rss", "podcast", 886);
        expect(node.textContent).toContain("Episodes");
        expect(node.textContent).toContain("886");
        expect(node.textContent).not.toContain("Long videos");
        expect(node.textContent).not.toContain("Shorts");
        expect(node.textContent).not.toContain("video");
        // A podcast DOES have a running time, and it is named for listening.
        expect(node.textContent).toContain("Total listening time");
        expect(node.textContent).toContain("Median episode");
    });

    it("a blog is counted in posts, never in unclassified videos", () => {
        const node = render("blog_feed", "blog", 10563);
        expect(node.textContent).toContain("Posts");
        expect(node.textContent).toContain("10,563");
        expect(node.textContent).not.toContain("Unclassified");
        expect(node.textContent).not.toContain("Long videos");
        expect(node.textContent).not.toContain("Shorts");
    });

    it("a blog is never given a running time it does not have", () => {
        const node = render("blog_feed", "blog", 10563);
        expect(node.textContent).not.toContain("Total length");
        expect(node.textContent).not.toContain("Median length");
        expect(node.textContent).not.toContain("Total listening time");
        // and no caption or transcript axis either — a post is already text
        expect(node.textContent).not.toContain("Caption coverage");
        expect(node.textContent).not.toContain("Transcripts ready");
    });

    it("a YouTube channel keeps every word it had", () => {
        const node = render("youtube", "video", 533);
        expect(node.textContent).toContain("Videos");
        expect(node.textContent).toContain("Long videos");
        expect(node.textContent).toContain("Shorts");
        expect(node.textContent).toContain("Live");
        expect(node.textContent).toContain("Unclassified");
        expect(node.textContent).toContain("Total length");
        expect(node.textContent).toContain("Caption coverage");
        expect(node.textContent).toContain("Publishing cadence, by month");
    });

    it("a slide deck, a mailbox, a calendar and a folder each get their own noun", () => {
        for (const [adapter, word] of [
            ["slide_deck", "Decks"],
            ["outlook_mail", "Messages"],
            ["outlook_calendar", "Events"],
            ["drive_folder", "Files"],
            ["teams_chat", "Conversations"],
        ] as const) {
            const node = render(adapter, "blog", 12);
            expect(node.textContent).toContain(word);
            expect(node.textContent).not.toContain("Long videos");
            act(() => root?.unmount());
            container?.remove();
        }
    });

    it("every adapter the screen speaks for renders without YouTube's words", () => {
        // The census, not a sample: whatever `vocabulary.ts` declares must
        // render, and only YouTube may use YouTube's vocabulary.
        for (const adapter of ADAPTERS_WITH_VOCABULARY) {
            const node = render(adapter, adapter === "youtube" ? "video" : "blog", 7);
            if (adapter !== "youtube") {
                expect(node.textContent).not.toContain("Long videos");
                expect(node.textContent).not.toContain("Shorts");
                expect(node.textContent).not.toContain("Unclassified");
            }
            expect(node.textContent).toContain("Catalogued in this Library");
            act(() => root?.unmount());
            container?.remove();
        }
    });

    it("an adapter nobody has taught this screen about says nothing it cannot back", () => {
        const unknownAdapter = sourceVocabulary(
            library("something_new_entirely" as MediaAdapter, 3),
        );
        expect(unknownAdapter.item.many).toBe("Items");
        expect(unknownAdapter.kindSplit).toBeNull();
        expect(unknownAdapter.length).toBeNull();
        expect(unknownAdapter.transcribable).toBe(false);

        const node = render("something_new_entirely" as MediaAdapter, "blog", 3);
        expect(node.textContent).toContain("Items");
        expect(node.textContent).not.toContain("Long videos");
        expect(node.textContent).not.toContain("Total length");
    });

    it("a Library whose row has not arrived yet is never assumed to be YouTube", () => {
        const before = sourceVocabulary(null);
        expect(before.item.many).toBe("Items");
        expect(before.kindSplit).toBeNull();
    });
});
